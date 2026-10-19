import express from 'express';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyCandidate, verifyRuntimeDirectory} from './hosted-candidate-lib.mjs';
import {proxyHostedRequest} from './hosted-preview-proxy.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
function argument(name, fallback='') {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] || fallback;
}
const stateArgument=argument('--state-dir');
const state=path.resolve(stateArgument);
const port=Number(argument('--port','4174'));
const candidateArg=argument('--candidate');
const runtimeArg=argument('--runtime-dir');
const realModel=args.includes('--real-model');
const realModelKey=process.env.DEEPSEEK_API_KEY;
if(!stateArgument||!path.isAbsolute(stateArgument)||!Number.isInteger(port)||port<1||port>65535){console.error('预览必须指定绝对 --state-dir 隔离状态目录和有效 --port');process.exit(2);}
if(!candidateArg){console.error('预览必须指定 --candidate <冻结候选根目录>');process.exit(2);}
if(realModel&&(!realModelKey||realModelKey.trim()==='')){console.error('真实模型模式需要显式通过 `node --env-file=.env scripts/hosted-preview.mjs --real-model ...` 提供既有 DEEPSEEK_API_KEY；未发送请求');process.exit(2);}
let candidate=path.resolve(candidateArg);
let candidateRoot=candidate;
let frozenManifest;
try{const verified=await verifyCandidate(candidate);candidateRoot=verified.root;frozenManifest=verified.manifest;candidate=path.join(candidateRoot,frozenManifest.frontend.path);}catch(e){console.error(`候选校验失败: ${e.message}`);process.exit(2);}
await requireFile(path.join(candidate,'index.html'),'托管构建不存在');
const runtimeRoot=runtimeArg?path.resolve(runtimeArg):path.join(candidateRoot,'runtime');
try{await verifyRuntimeDirectory(candidateRoot,runtimeRoot);}catch(e){console.error(`暂存运行时校验失败: ${e.message}`);process.exit(2);}
await requireFile(path.join(runtimeRoot,'node_modules/express/package.json'),'候选运行依赖未安装');
await requireFile(path.join(runtimeRoot,'node_modules/tsx/package.json'),'tsx 运行依赖未安装');
await fs.mkdir(state,{recursive:true});
const budget=path.join(state,'budget.json'),stats=path.join(state,'statistics.json');
const baseEnv={PATH:process.env.PATH||'',HOME:process.env.HOME||'',NODE_ENV:'production',HOSTED_BUDGET_PATH:budget,HOSTED_STATISTICS_PATH:stats,HOSTED_ORIGIN:`http://127.0.0.1:${port}`,HOSTED_TRUSTED_PROXY:'loopback'};
if(realModel){baseEnv.DEEPSEEK_API_KEY=realModelKey;baseEnv.HOSTED_DAILY_BUDGET_USD='0.005';}
// Initialize only files owned by this explicitly supplied isolated state directory.
if(!await exists(budget)) await initializeBudget(runtimeRoot,baseEnv);
if(await exists(stats)){try{const s=JSON.parse(await fs.readFile(stats,'utf8'));if(s.version!==1||!s.days||typeof s.days!=='object'||Array.isArray(s.days))throw Error();}catch{console.error('托管统计账本损坏');process.exit(1);}}
else await fs.writeFile(stats,'{"version":1,"days":{}}\n',{mode:0o600});
const apiPort=await freePort();
const apiEntry=path.join(runtimeRoot,'server/hosted-index.ts');
const api=spawn(process.execPath,['--import','tsx',apiEntry],{cwd:runtimeRoot,env:{...baseEnv,HOSTED_PORT:String(apiPort),HOSTED_API_ID:frozenManifest.api.id,HOSTED_CANDIDATE_ID:frozenManifest.candidateId},stdio:'inherit'});
let server;
let stopping=false;
let apiExit=null;
api.on('exit',(code,signal)=>{
  apiExit={code,signal};
  if(stopping)return;
  console.error(`托管 API 已退出 (code=${code}, signal=${signal})`);
  if(server){server.close();server.closeAllConnections();}
  process.exitCode=1;
});

try {
  await waitForApi(apiPort, api, () => apiExit, baseEnv, frozenManifest);
} catch(error) {
  stopping=true;
  await stopApi(api, 1000);
  console.error(`托管 API 启动或健康检查失败: ${error.message}`);
  process.exit(1);
}
const app=express();app.disable('x-powered-by');
app.use(async(req,res)=>{
 if(req.path==='/__candidate'&&req.method==='GET'){res.setHeader('Cache-Control','no-store');res.json({candidateId:frozenManifest.candidateId,apiId:frozenManifest.api.id});return;}
 if(req.path.startsWith('/api/')){
  if(!req.path.startsWith('/api/hosted/')){res.status(404).json({error:'本机接口不在托管预览中开放',code:'not_found'});return;}
  proxyHostedRequest(req,res,apiPort);return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.status(405).setHeader('Allow','GET, HEAD').end();return;}
 let rel;try{rel=decodeURIComponent(req.path).replace(/^\/+/, '')||'index.html';}catch{res.status(404).end();return;}
 if(rel.split('/').some(x=>x==='..')||rel.includes('\\')||rel.startsWith('.')){res.status(404).end();return;}
 const file=path.resolve(candidate,rel);if(!file.startsWith(candidate+path.sep)&&file!==path.join(candidate,'index.html')){res.status(404).end();return;}
 if(frozenManifest&&!frozenManifest.files.some(x=>x.path===path.posix.join('frontend',rel))){res.status(404).end();return;}
 let st;try{st=await fs.stat(file);}catch{res.status(404).type('text/plain').send('Not found');return;}
 if(!st.isFile()){res.status(404).end();return;}
 const ext=path.extname(file).toLowerCase(),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.pdf':'application/pdf'}[ext];
 if(!mime){res.status(415).type('text/plain').send('Unsupported resource type');return;}
 res.setHeader('Content-Type',mime);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('X-Got-It-Candidate-Id',frozenManifest.candidateId);res.sendFile(file);
});
server=app.listen(port,'127.0.0.1');
try {
  await waitForServer(server);
} catch(error) {
  stopping=true;
  await stopApi(api, 1000);
  console.error(`托管预览监听失败: ${error.message}`);
  process.exit(1);
}
console.info(`Hosted candidate ${frozenManifest.candidateId} (API ${frozenManifest.api.id}; ${realModel?'explicit real-model':'free/no-credential'} mode) at http://127.0.0.1:${port}; identity: /__candidate`);
const stop=()=>{
  if(stopping)return;
  stopping=true;
  server.close();
  void stopApi(api, 66_000);
};
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
async function exists(p){try{await fs.access(p);return true;}catch{return false;}}
async function freePort(){return await new Promise((resolve,reject)=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});s.on('error',reject);});}
async function requireFile(file,message){try{await fs.access(file);}catch{console.error(`${message}: ${file}；请先生成托管候选`);process.exit(2);}}
async function initializeBudget(runtime,env){const file=env.HOSTED_BUDGET_PATH;const init=spawn(process.execPath,['--import','tsx','server/hosted-index.ts','--init-budget'],{cwd:runtime,env,stdio:'inherit'});const code=await new Promise(resolve=>init.once('exit',resolve));if(code!==0){console.error('无法初始化隔离费用账本');process.exit(1);}if(!await exists(file)){console.error('费用账本初始化命令未生成账本文件');process.exit(1);}}
async function waitForApi(apiPort,api,getExit,env,manifest){
  for(let attempt=0;attempt<100;attempt++){
    const exit=getExit();
    if(exit)throw Error(`子进程退出 (code=${exit.code}, signal=${exit.signal})`);
    try {
      const response=await fetch(`http://127.0.0.1:${apiPort}/api/hosted/capabilities`,{headers:{Origin:env.HOSTED_ORIGIN,'X-Trial-Id':'11111111-1111-4111-8111-111111111111'}});
      if(response.ok){
        const capabilities=await response.json();
        if(capabilities.apiId!==manifest.api.id||capabilities.candidateId!==manifest.candidateId||capabilities.available!==realModel||capabilities.searchAvailable){
          throw Error('API 身份、真实模型模式或禁用搜索检查失败');
        }
        return;
      }
    }catch(error){
      if(error.message==='API 身份或无凭据能力检查失败')throw error;
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('健康检查超时');
}
async function stopApi(api,graceMs){
  if(api.exitCode!==null||api.signalCode!==null)return;
  api.kill('SIGTERM');
  const exited=await waitForChild(api,graceMs);
  if(!exited){api.kill('SIGKILL');await waitForChild(api,2000);}
}
function waitForChild(child,timeoutMs){
  if(child.exitCode!==null||child.signalCode!==null)return Promise.resolve(true);
  return new Promise(resolve=>{
    const timer=setTimeout(()=>{child.off('exit',onExit);resolve(false);},timeoutMs);
    const onExit=()=>{clearTimeout(timer);resolve(true);};
    child.once('exit',onExit);
  });
}
function waitForServer(server){
  return new Promise((resolve,reject)=>{
    server.once('listening',resolve);
    server.once('error',reject);
  });
}
