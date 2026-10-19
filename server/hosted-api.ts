import {createHash} from 'node:crypto';
import express from 'express';
import type {InquiryEvent} from '../src/types';
import {HostedBudget, HostedError, MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS} from './hosted-budget';
import {HostedAdmission, sameSecret, type AdmissionCategory, type AdmissionLease} from './hosted-admission';
import type {HostedAlerts} from './hosted-alerts';
import {HOSTED_MODEL, parseHostedInquiry, usesHostedSearch, type HostedRunner} from './hosted-model';
import {requestDeadline} from '../src/lib/request-deadline';
import type {HostedWebImports} from './hosted-web-imports';
import {hostedOperationId, hostedOperationToken} from './hosted-web-imports';
import type {HostedTranslations} from './hosted-translations';
import {WebError} from './web-fetch';
import type {HostedStatistics} from './hosted-statistics';

export interface HostedOptions {origin:string;budget:HostedBudget;runner?:HostedRunner;verificationRunner?:HostedRunner;searchCostUsd?:number;webImports?:HostedWebImports;translations?:HostedTranslations;statistics?:HostedStatistics;timeoutMs?:number;images?:boolean;apiId?:string;candidateId?:string;fixtureMode?:'loopback-fixture';admission?:HostedAdmission;alerts?:HostedAlerts;opsToken?:string;trustedProxy?:boolean;}
const loopback=(address?:string)=>address==='127.0.0.1'||address==='::1'||address==='::ffff:127.0.0.1';
export function createHostedApp(options:HostedOptions) {
  const app=express();
  const admission=options.admission??new HostedAdmission({trustedProxy:options.trustedProxy});
  const verificationAvailable=!!options.verificationRunner&&Number.isFinite(options.searchCostUsd)&&options.searchCostUsd!>0;
  app.disable('x-powered-by');
  app.set('trust proxy',false);
  app.use('/api/hosted/ops',(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const token=req.get('x-gotit-ops-token')||'';
    if(!loopback(req.socket.remoteAddress)||!options.opsToken||!sameSecret(token,options.opsToken)){res.status(404).json({error:'接口不存在',code:'not_found'});return;}
    if(req.method==='GET'&&req.path==='/'){res.json({admission:admission.snapshot(),budget:options.budget.summary(),statistics:options.statistics?.summary()??null,alerts:options.budget.alerts()});return;}
    const retry=req.path.match(/^\/alerts\/([^/]+)\/retry$/);
    if(req.method==='POST'&&retry){try{res.json(options.budget.retryAlert(decodeURIComponent(retry[1])));}catch(error){const safe=error instanceof HostedError?error:new HostedError('请求格式错误');res.status(safe.status).json({error:safe.message,code:safe.code});}return;}
    res.status(404).json({error:'接口不存在',code:'not_found'});
  });
  app.use((req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Vary','Origin');
    const sameOriginGet=req.method==='GET'&&!req.get('origin')&&req.get('sec-fetch-site')==='same-origin'&&req.get('host')===new URL(options.origin).host;
    if(req.get('origin')!==options.origin&&!sameOriginGet){res.status(403).json({error:'请求来源不允许',code:'origin_rejected'});return;}
    res.setHeader('Access-Control-Allow-Origin',options.origin);
    res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Trial-Id, X-Hosted-Operation-Token, X-Hosted-Generation, X-Hosted-Round-Token, X-Hosted-Operation-Id');
    res.setHeader('Access-Control-Expose-Headers','X-Hosted-Round-Token, Retry-After');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    if(req.method==='OPTIONS'){res.sendStatus(204);return;}
    if(req.headers.authorization||req.headers['x-api-key']||req.headers['api-key']){res.status(400).json({error:'体验版不接受用户密钥',code:'user_key_rejected'});return;}
    next();
  });
  const ordinaryJson=express.json({limit:'40kb',strict:true}),captureJson=express.json({limit:'2mb',strict:true}),translationJson=express.json({limit:'160kb',strict:true}),imageJson=express.json({limit:'6mb',strict:true}),usageJson=express.json({limit:'256kb',strict:true});
  const imagesEnabled=!!options.images&&!!options.runner;
  const categoryOf=(path:string):AdmissionCategory|undefined=>path==='/api/hosted/inquiry/stream'?'inquiry':path==='/api/hosted/translation-batches'?'translation':path==='/api/hosted/web-imports'||path==='/api/hosted/x-article-imports'||path==='/api/hosted/web-media/retry'?'capture':undefined;
  const bodyLimit=(path:string)=>path==='/api/hosted/x-article-imports'?2*1024*1024:path==='/api/hosted/translation-batches'?160*1024:path==='/api/hosted/inquiry/stream'&&imagesEnabled?6*1024*1024:path==='/api/hosted/usage'?256*1024:40*1024;
  app.use((req,res,next)=>{
    if(req.method==='GET'||/\/cancel$/.test(req.path)||/\/release$/.test(req.path)){
      if(req.path==='/api/hosted/capabilities')return next();
      try{admission.takeControl(admission.clientIp(req,false)||'untrusted');}catch(error){next(error);return;}
      return next();
    }
    if(req.method!=='POST')return next();
    const category=categoryOf(req.path);
    try{
      if(req.path==='/api/hosted/usage'){admission.takeStatistics(admission.clientIp(req,false)||'untrusted');}
      else if(category){
        const id=validateIdentity(req.get('x-trial-id'));
        admission.requireGeneration(req.get('x-hosted-generation'));
        const ip=admission.clientIp(req,true)!;
        res.locals.transportId=admission.validateTransportId(req.get('x-hosted-operation-id'));
        const round=req.get('x-hosted-round-token');
        const exempt=category==='translation'&&!!round&&admission.claimRound(id,round);
        if(exempt&&round)res.once('finish',()=>admission.releaseRound(round));
        admission.takeExpensive(id,ip,exempt);
        const length=Number(req.get('content-length'));
        if(Number.isFinite(length)&&length>bodyLimit(req.path))throw new HostedError('请求体超过允许容量',413,'body_limit');
        admission.preflight(category,id);
        if(req.path==='/api/hosted/inquiry/stream'&&imagesEnabled){const q=options.budget.status(id,ip);if(q.remaining<=0||q.globalExhausted)throw new HostedError(q.globalExhausted?'今日体验额度已用完':'今日体验次数已用完',429,q.globalExhausted?'global_quota_exhausted':'quota_exhausted');}
        res.locals.trialId=id;res.locals.clientIp=ip;res.locals.roundExempt=exempt;
      }
    }catch(error){next(error);return;}
    next();
  });
  app.use((req,res,next)=>(req.path==='/api/hosted/usage'?usageJson:req.path==='/api/hosted/x-article-imports'?captureJson:req.path==='/api/hosted/translation-batches'?translationJson:req.path==='/api/hosted/inquiry/stream'&&imagesEnabled?imageJson:ordinaryJson)(req,res,next));
  function validateIdentity(id:unknown){if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new HostedError('体验标识无效');return id;}
  const identity=(req:express.Request)=>validateIdentity(req.get('x-trial-id'));
  const ipOf=(req:express.Request)=>{const saved=req.res?.locals.clientIp;if(typeof saved==='string')return saved;const resolved=admission.clientIp(req,true);if(!resolved)throw new HostedError('缺少可信客户端地址',403,'trusted_ip_required');return resolved;};
  const operationToken=(req:express.Request)=>hostedOperationToken(req.get('x-hosted-operation-token'));
  const emptyBody=(req:express.Request)=>{if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length)throw new HostedError('操作请求字段无效');};
  const hashOf=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const withDisconnect=async<T>(res:express.Response,run:(signal:AbortSignal)=>Promise<T>)=>{const c=new AbortController(),close=()=>{if(!res.writableEnded)c.abort(new Error('连接已停止'));};res.on('close',close);try{return await run(c.signal);}finally{res.off('close',close);}};
  async function guarded(category:AdmissionCategory,owner:string,operation:string,payload:unknown,run:(lease:AdmissionLease,signal?:AbortSignal)=>Promise<unknown>,signal?:AbortSignal){
    const key=`${owner}:${operation}`,hash=hashOf(payload);
    if(admission.operationState(key)==='expired')throw new HostedError('操作已过期，结果未知。请主动重新发起，不会自动重新发送。',409,'operation_expired');
    admission.beginOperation(key,hash,category);
    let lease:AdmissionLease;
    try{lease=admission.acquire(category,owner);}catch(error){admission.abandonOperation(key);throw error;}
    try{return await run(lease,signal);}
    finally{if(lease.hasWork())void lease.settle().finally(()=>admission.finishOperation(key,hash,category));else{lease.releaseNow();admission.finishOperation(key,hash,category);}}
  }
  if(options.webImports){
    for(const [path,x]of [['web-imports',false],['x-article-imports',true]] as const)app.post(`/api/hosted/${path}`,async(req,res,next)=>{try{
      const owner=identity(req),token=operationToken(req),op=hostedOperationId((req.body as {operationId?:unknown})?.operationId);
      try{const current=options.webImports!.status(owner,op,token);if(current.status==='reading')throw new HostedError('已有相同操作正在处理，不会再次发送',409,'operation_in_progress');res.json(current);return;}catch(error){if(!(error instanceof HostedError)||error.code!=='web_job_missing')throw error;}
      res.json(await guarded('capture',owner,res.locals.transportId,req.body,lease=>options.webImports!.start(owner,ipOf(req),token,req.body,x,work=>lease.track(work))));
    }catch(e){next(e);}});
    app.get('/api/hosted/web-imports/:op',(req,res,next)=>{try{res.json(options.webImports!.status(identity(req),String(req.params.op),operationToken(req)));}catch(e){next(e);}});
    app.get('/api/hosted/web-imports/:op/resources/:id',(req,res,next)=>{try{const r=options.webImports!.resource(identity(req),String(req.params.op),operationToken(req),String(req.params.id));res.set({'Content-Type':r.mime,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).send(r.bytes);}catch(e){next(e);}});
    for(const action of ['cancel','release'] as const)app.post(`/api/hosted/web-imports/:op/${action}`,(req,res,next)=>{try{emptyBody(req);if(action==='cancel')admission.noteCancelled();res.json(options.webImports![action](identity(req),String(req.params.op),operationToken(req)));}catch(e){next(e);}});
    app.post('/api/hosted/web-media/retry',async(req,res,next)=>{try{const owner=identity(req),op=hostedOperationId((req.body as {operationId?:unknown})?.operationId);res.json(await withDisconnect(res,signal=>guarded('capture',owner,res.locals.transportId,req.body,(lease,inner)=>options.webImports!.retry(owner,ipOf(req),operationToken(req),req.body,inner!,work=>lease.track(work)),signal)));}catch(e){next(e);}});
  }
  if(options.translations){
    app.post('/api/hosted/translation-batches',async(req,res,next)=>{try{
      const owner=identity(req),token=operationToken(req),replay=options.translations!.replay(owner,token,req.body);
      if(replay){res.json(replay);return;}
      const op=hostedOperationId((req.body as {operationId?:unknown})?.operationId);
      if(!res.locals.roundExempt)res.set('X-Hosted-Round-Token',admission.issueRound(owner));
      res.json(await withDisconnect(res,signal=>guarded('translation',owner,res.locals.transportId,req.body,(lease,inner)=>options.translations!.batch(owner,ipOf(req),token,req.body,inner!,work=>lease.track(work)),signal)));
    }catch(e){next(e);}});
    app.post('/api/hosted/translation-batches/:op/cancel',(req,res,next)=>{try{emptyBody(req);admission.noteCancelled();res.json(options.translations!.cancel(identity(req),String(req.params.op),operationToken(req)));}catch(e){next(e);}});
  }
  app.get('/api/hosted/capabilities',(req,res,next)=>{try{res.json({apiId:options.apiId||'unversioned',candidateId:options.candidateId||null,generation:admission.generation,...(options.fixtureMode?{fixtureMode:options.fixtureMode,transport:options.fixtureMode}:{}),model:HOSTED_MODEL,providerId:'deepseek',supportsImages:imagesEnabled,supportsWebImport:!!options.webImports,supportsXCapture:!!options.webImports,supportsWebMediaRetry:!!options.webImports,supportsTranslation:!!options.translations,supportsWebSearch:verificationAvailable,searchAvailable:verificationAvailable,searchProvider:'bocha',available:!!options.runner,quota:options.budget.status(identity(req),admission.clientIp(req,false)||'untrusted'),admission:{globalSlots:3,perIdSlots:1,translationSlots:2,captureSlots:2,conservative:true}});}catch(e){next(e);}});
  app.post('/api/hosted/inquiry/stream',async(req,res,next)=>{
    let settle:ReturnType<HostedBudget['reserve']>|undefined;
    let budget:ReturnType<typeof requestDeadline>|undefined;
    let sequence=0,finished=false,owned=false,operationKey='';
    const id=typeof req.body?.requestId==='string'?req.body.requestId:'';
    const emit=(event:Omit<InquiryEvent,'requestId'|'sequence'>)=>{if(!res.destroyed&&!finished)res.write(JSON.stringify({...event,requestId:id,sequence:++sequence})+'\n');};
    const cancel=new AbortController();
    const close=()=>{if(!res.writableEnded)cancel.abort(new Error('请求已停止'));};
    res.on('close',close);
    let lease:AdmissionLease|undefined;
    try{
      const request=parseHostedInquiry(req.body,{images:imagesEnabled});
      const trialId=identity(req),clientIp=ipOf(req),key=`${trialId}:${res.locals.transportId}`,hash=hashOf(request);
      operationKey=key;
      if(usesHostedSearch(request)&&!verificationAvailable)throw new HostedError('联网搜索服务暂未配置，请稍后重试',503,'search_unavailable');
      if(!options.runner)throw new HostedError('体验模型尚未配置',503,'model_unavailable');
      if(admission.operationState(key)==='expired')throw new HostedError('操作已过期，结果未知。请主动重新发起，不会自动重新发送。',409,'operation_expired');
      admission.beginOperation(key,hash,'inquiry');owned=true;
      try{lease=admission.acquire('inquiry',trialId);}catch(error){admission.abandonOperation(key);owned=false;throw error;}
      budget=requestDeadline(Math.min(60_000,options.timeoutMs??60_000),cancel.signal);
      settle=options.budget.reserve(trialId,clientIp,usesHostedSearch(request)?options.searchCostUsd??NaN:0,request.hostedImage?{input:MAX_INPUT_TOKENS+request.hostedImage.tokens,output:MAX_OUTPUT_TOKENS}:undefined);
      res.status(200).set({'Content-Type':'application/x-ndjson; charset=utf-8','X-Accel-Buffering':'no'});res.flushHeaders();
      emit({type:'progress',progress:'accepted',deadlineAt:budget.deadlineAt});
      const runner=usesHostedSearch(request)?options.verificationRunner!:options.runner;
      const pending=runner(request,budget.signal,delta=>{budget!.check();emit({type:'answer-delta',delta});},progress=>{budget!.check();emit({type:'progress',progress});},work=>lease!.track(work));
      lease.track(pending);
      const result=await budget.wait(pending);
      budget.check();
      settle(result.usage);
      budget.check();
      emit({type:'complete',response:result.response});finished=true;res.end();
    }catch(error){
      const diagnostic=(error as {schemaDiagnostic?:unknown})?.schemaDiagnostic;if(diagnostic)console.warn(JSON.stringify({event:'model_schema_invalid',diagnostic}));
      if(budget?.signal.aborted)admission.noteCancelled();
      const safe=error instanceof HostedError?error:new HostedError(budget?.signal.aborted?(cancel.signal.aborted?'请求已停止':'本次请求超时，请重试'):'模型服务失败，请重试',502,budget?.signal.aborted?'request_interrupted':'model_failed');
      if(res.headersSent){emit({type:'error',error:safe.message,...(safe.code==='search_failed'?{response:{answer:'',sources:[],evidenceStatus:'not-applicable' as const,mode:'live' as const,providerId:'deepseek' as const,providerName:'体验版默认模型',model:HOSTED_MODEL,search:{status:'failed' as const,completedSearches:0,failedSearches:1}}}:{})});finished=true;res.end();}else next(safe);
    }finally{settle?.();budget?.dispose();res.off('close',close);void lease?.settle().finally(()=>{if(owned&&operationKey)admission.finishOperation(operationKey,hashOf(req.body),'inquiry');});}
  });
  app.post('/api/hosted/usage',(req,res,next)=>{try{
    if(req.body&&typeof req.body==='object'&&!Array.isArray(req.body)&&req.body.schemaVersion===2){if(!options.statistics)throw new HostedError('统计暂不可用',503);options.statistics.acceptBatch(req.body);res.sendStatus(204);return;}
    let summary=req.body,id:string;const usageIp=admission.clientIp(req,false)||'untrusted';if(req.get('x-trial-id')){id=identity(req);}else{if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length!==2||!Object.keys(req.body).every(k=>['experienceId','summary'].includes(k)))throw new HostedError('统计传输格式无效');id=validateIdentity(req.body.experienceId);summary=req.body.summary;}if(!options.statistics)throw new HostedError('统计暂不可用',503);options.statistics.record(summary,id,usageIp);res.sendStatus(204);
  }catch(e){next(e);}});
  app.use((_req,res)=>{res.status(404).json({error:'接口不存在',code:'not_found'});});
  app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    const bodyTooLarge=!!error&&typeof error==='object'&&'type' in error&&error.type==='entity.too.large';
    const safe=error instanceof HostedError?error:error instanceof WebError?new HostedError(error.message,error.status,error.code):bodyTooLarge?new HostedError('请求体超过允许容量',413,'body_limit'):new HostedError('请求格式错误',400,'invalid_request');
    if(!res.headersSent){if(safe.retryAfter)res.set('Retry-After',String(safe.retryAfter));res.status(safe.status).json({error:safe.message,code:safe.code,...(safe.retryAfter?{retryAfter:safe.retryAfter}:{})});}
  });
  return app;
}
