import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyCandidate, verifyRuntimeDirectory, collectApiSourceClosure} from './hosted-candidate-lib.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [mode,...rest]=process.argv.slice(2);const value=(k,d='')=>{const i=rest.indexOf(k);return i<0?d:rest[i+1];};
let dir=path.resolve(value('--dir',''));
if(['prepare','verify'].includes(mode)&&(!value('--dir')||dir===root)){console.error('请使用 --dir <候选输出目录>');process.exit(2);}
const digest=b=>createHash('sha256').update(b).digest('hex');
const hashFile=async p=>digest(await fs.readFile(p));
async function walk(base,rel=''){let out=[];for(const ent of await fs.readdir(path.join(base,rel),{withFileTypes:true})){const r=path.posix.join(rel,ent.name);if(ent.isSymbolicLink())throw Error(`拒绝符号链接: ${r}`);if(ent.isDirectory())out.push(...await walk(base,r));else if(ent.isFile())out.push(r);else throw Error(`拒绝特殊文件: ${r}`);}return out.sort();}
async function copyTree(from,to){await fs.mkdir(to,{recursive:true});for(const ent of await fs.readdir(from,{withFileTypes:true})){const a=path.join(from,ent.name),b=path.join(to,ent.name);if(ent.isSymbolicLink())throw Error(`拒绝符号链接: ${a}`);if(ent.isDirectory())await copyTree(a,b);else if(ent.isFile())await fs.copyFile(a,b);}}
async function copyApiClosure(to){
 const files=await collectApiSourceClosure('server/hosted-index.ts',root);
 for(const file of files){
  const relative=path.relative(root,file);
  const destination=path.join(to,relative);
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.copyFile(file,destination);
 }
}
async function verify(){const {manifest:m,files}=await verifyCandidate(dir);console.log(JSON.stringify({ok:true,candidateId:m.candidateId,apiId:m.api.id,files:files.length}));}
async function prepareRuntime() {
 const candidateRoot=path.resolve(value('--candidate',''));
 const requested=path.resolve(value('--dir',''));
 if(!value('--candidate')||!value('--dir'))throw Error('用法: node scripts/hosted-candidate.mjs prepare-runtime --candidate <候选根目录> --dir <新的暂存目录>');
 const candidate=await verifyCandidate(candidateRoot);
 const parent=await fs.realpath(path.dirname(requested));
 const target=path.join(parent,path.basename(requested));
 try {await fs.lstat(target);throw Error(`运行时目标已存在，拒绝覆盖: ${target}`);}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const staging=await fs.mkdtemp(path.join(parent,'.gotit-runtime-'));
 try {
  const frozenRuntime=path.join(candidateRoot,'runtime');
  for(const relative of await walk(frozenRuntime)) {
   const source=path.join(frozenRuntime,relative),destination=path.join(staging,relative);
   await fs.mkdir(path.dirname(destination),{recursive:true});
   await fs.copyFile(source,destination);
  }
  const npmArgs=['ci','--include=dev','--ignore-scripts','--no-audit','--no-fund','--prefix',staging];
  const npmCommand='npm';
  const userConfig=path.join(staging,'.npmrc.user');
  const globalConfig=path.join(staging,'.npmrc.global');
  await fs.writeFile(userConfig,'');
  await fs.writeFile(globalConfig,'');
  const result=spawnSync(npmCommand,npmArgs,{cwd:staging,encoding:'utf8',stdio:'inherit',env:safeNpmEnvironment(value('--cache'),userConfig,globalConfig)});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(`npm ci 失败 (exit ${result.status})`);
  await fs.rm(userConfig,{force:true});
  await fs.rm(globalConfig,{force:true});
  await verifyRuntimeDirectory(candidateRoot,staging);
  await fs.rename(staging,target);
  console.log(JSON.stringify({ok:true,candidateId:candidate.manifest.candidateId,apiId:candidate.manifest.api.id,runtimeDirectory:target}));
 } catch(error) {
  await fs.rm(staging,{recursive:true,force:true});
  throw error;
 }
}
function safeNpmEnvironment(cacheArgument,userConfig,globalConfig){
 const home=process.env.HOME||'';
 const environment={PATH:process.env.PATH||'',HOME:home,TMPDIR:process.env.TMPDIR||'/tmp',CI:'1',npm_config_ignore_scripts:'true',npm_config_userconfig:userConfig,npm_config_globalconfig:globalConfig};
 if(cacheArgument)environment.npm_config_cache=path.resolve(cacheArgument);
 else if(home)environment.npm_config_cache=path.join(home,'.npm');
 if(process.env.npm_config_cache)environment.npm_config_cache=process.env.npm_config_cache;
 return environment;
}
let stagingPath=null;
try{
 if(mode==='verify'){await verify();process.exit(0);}
 if(mode==='prepare-runtime'){await prepareRuntime();process.exit(0);}
 if(mode!=='prepare')throw Error('用法: node scripts/hosted-candidate.mjs prepare|verify|prepare-runtime');
 const requested=dir,parent=await fs.realpath(path.dirname(requested)),target=path.join(parent,path.basename(requested));try{await fs.lstat(target);throw Error(`候选目标已存在，拒绝覆盖: ${target}`);}catch(e){if(e.code!=='ENOENT')throw e;}stagingPath=await fs.mkdtemp(path.join(parent,'.gotit-candidate-'));dir=stagingPath;
 const source=path.join(root,'server'),build=value('--build',path.join(root,'dist-hosted'));await fs.access(path.join(build,'index.html'));
 await copyTree(build,path.join(dir,'frontend'));
 await copyApiClosure(path.join(dir,'runtime'));
 for(const f of ['package.json','package-lock.json','tsconfig.json'])await fs.copyFile(path.join(root,f),path.join(dir,'runtime',f));
 const names=await walk(dir),files=[];for(const p of names)files.push({path:p,size:(await fs.stat(path.join(dir,p))).size,sha256:await hashFile(path.join(dir,p))});
 const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}),status=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'});
 const sourceFiles=files.filter(x=>x.path.startsWith('runtime/')).map(x=>[x.path,x.sha256]);
 const api={id:'api-'+digest(JSON.stringify(sourceFiles)).slice(0,16),inputSha256:digest(JSON.stringify(sourceFiles)),node:process.versions.node,engine:JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).engines.node,dependencyLockSha256:await hashFile(path.join(root,'package-lock.json'))};
 const core={createdAt:new Date().toISOString(),frontend:{path:'frontend',indexSha256:await hashFile(path.join(dir,'frontend/index.html'))},files,api,source:{commit:git.status===0?git.stdout.trim():null,worktreeSha256:digest(status.stdout||'')},compatibility:{browserFormat:value('--browser-format','1'),ledgerFormat:value('--ledger-format','1'),backwardCompatibleWith:value('--compatible-with','')},rollback:{frontend:value('--rollback-frontend',''),api:value('--rollback-api','')},acceptance:{status:'pending',reference:value('--acceptance','')},privateProvenance:true};
 core.candidateId='hosted-'+digest(JSON.stringify(core)).slice(0,16);await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(core,null,2)+'\n',{mode:0o600});await verify();
 await fs.rename(dir,target);stagingPath=null;dir=target;
 console.log(JSON.stringify({candidateId:core.candidateId,apiId:api.id,directory:dir}));
}catch(e){if(stagingPath)await fs.rm(stagingPath,{recursive:true,force:true});console.error(`候选操作失败: ${e.message}`);process.exit(1);}
