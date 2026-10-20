// @vitest-environment node
import {afterEach,describe,expect,it} from 'vitest';
import {mkdtempSync,readdirSync,rmSync,chmodSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {HostedResourceTickets} from './hosted-resource-tickets';
import {HostedWebImports} from './hosted-web-imports';import {WEB_LIMITS} from './web-fetch';
import {webFixture,WEB_URL} from './test-support/web-fixture';
const token='a'.repeat(64),other='b'.repeat(64),dirs:string[]=[];
afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
function state(){const dir=mkdtempSync(join(tmpdir(),'hosted-import-test-'));dirs.push(dir);return {dir,tickets:new HostedResourceTickets(join(dir,'state'))};}
async function ready(jobs:HostedWebImports,owner='owner',op='op'){for(let i=0;i<100;i++){const s=jobs.status(owner,op,token);if(s.status!=='reading')return s;await new Promise(r=>setTimeout(r,2));}throw new Error('job stuck');}
describe('hosted ephemeral import and signed resource boundary',()=>{
 it('survives signing-key restart, rejects forged/context-altered tickets and fails closed on invalid key permissions',()=>{
  const {dir,tickets}=state(),value={v:1 as const,documentId:'doc',contentVersion:'a'.repeat(64),mediaId:'media',sourceUrl:'https://example.org/image.png',extractorVersion:'static'};
  const ticket=tickets.sign(value);expect(new HostedResourceTickets(join(dir,'state')).verify(ticket)).toEqual(value);expect(()=>tickets.verify(ticket.slice(0,-5)+'xxxxx')).toThrow();
  const [payload,sig]=ticket.split('.'),forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(payload,'base64url').toString()),sourceUrl:'http://127.0.0.1/secret'})).toString('base64url')+'.'+sig;expect(()=>tickets.verify(forged)).toThrow();
  // Mode bits express privacy only on POSIX; Windows relies on directory ACLs (see private-storage.ts).
  if(process.platform!=='win32'){chmodSync(join(dir,'state/resource-signing.key'),0o644);expect(()=>new HostedResourceTickets(join(dir,'state'))).toThrow('invalid');}
 });
 it('reports each capture job terminal exactly once without changing the job result',async()=>{
  const {tickets}=state();let now=1000;const events:Array<{outcome:string;elapsed:number}>=[];
  const jobs=new HostedWebImports(tickets,{extractor:async()=>webFixture(),clock:()=>now,onTerminal:(outcome,startedAt,endedAt)=>{events.push({outcome,elapsed:endedAt-startedAt});}});
  await jobs.start('owner','ip',token,{url:WEB_URL,operationId:'success'});now+=12;expect((await ready(jobs,'owner','success')).status).toBe('ready');jobs.release('owner','success',token);
  const failing=new HostedWebImports(tickets,{extractor:async()=>{throw new Error('controlled failure');},clock:()=>now,onTerminal:(outcome,startedAt,endedAt)=>{events.push({outcome,elapsed:endedAt-startedAt});}});
  await failing.start('owner','ip',token,{url:WEB_URL,operationId:'failure'});now+=7;expect((await ready(failing,'owner','failure')).status).toBe('failed');
  let finish!:(value:Awaited<ReturnType<typeof webFixture>>)=>void;const pending=new Promise<Awaited<ReturnType<typeof webFixture>>>(resolve=>{finish=resolve;});
  const cancelling=new HostedWebImports(tickets,{extractor:async()=>pending,clock:()=>now,onTerminal:(outcome,startedAt,endedAt)=>{events.push({outcome,elapsed:endedAt-startedAt});}});
  await cancelling.start('owner','ip',token,{url:WEB_URL,operationId:'cancel'});now+=3;cancelling.cancel('owner','cancel',token);finish(await webFixture());await new Promise(resolve=>setTimeout(resolve,10));
  expect(events).toEqual([{outcome:'success',elapsed:12},{outcome:'failed',elapsed:7},{outcome:'cancelled',elapsed:3}]);
 });
 it('separates a capture deadline from ordinary failure and user cancellation',async()=>{
  const {tickets}=state();const events:string[]=[];
  const jobs=new HostedWebImports(tickets,{extractor:async()=>new Promise(()=>{}),deadlineMs:5,onTerminal:outcome=>events.push(outcome)});
  await jobs.start('owner','ip',token,{url:WEB_URL,operationId:'deadline'});
  for(let i=0;i<50&&jobs.status('owner','deadline',token).status==='reading';i++)await new Promise(resolve=>setTimeout(resolve,2));
  expect(jobs.status('owner','deadline',token).status).toBe('failed');
  expect(events).toEqual(['timedOut']);
 });
 it('classifies a signed media-retry deadline as timedOut without changing the ticket contract',async()=>{
  const {tickets}=state(),fixture=await webFixture();const doc=fixture.workspace.document;if(doc.kind!=='web')throw new Error();const media=doc.web.media[0];
  const ticket=tickets.sign({v:1,documentId:doc.id,contentVersion:doc.web.contentVersion,mediaId:media.id,sourceUrl:media.sourceUrl!,extractorVersion:doc.web.extractorVersion});
  const jobs=new HostedWebImports(tickets,{retryDeadlineMs:5,fetcher:async(_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))});
  await expect(jobs.retry('owner','ip',token,{operationId:'retry-deadline',ticket},new AbortController().signal)).rejects.toMatchObject({status:408,code:'web_timeout'});
  expect(jobs.memoryBytes).toBe(0);
 });
 it('keeps one immutable owner/token preview with hash-bound bytes, signed retry metadata and no content files',async()=>{
  const {dir,tickets}=state(),jobs=new HostedWebImports(tickets,{extractor:async()=>webFixture()});
  await jobs.start('owner','ip',token,{url:WEB_URL,operationId:'op'});const s=await ready(jobs);expect(s.status).toBe('ready');const doc=s.preview!.workspace.document;if(doc.kind!=='web')throw new Error();const media=doc.web.media[0];expect(jobs.resource('owner','op',token,media.resourceId!).mime).toBe('image/png');expect(s.preview!.retryTickets?.[media.id]).toBeTruthy();
  expect(()=>jobs.status('owner','op',other)).toThrow('不属于');expect(()=>jobs.status('other','op',token)).toThrow('不存在');expect(()=>jobs.resource('owner','op',token,'https://example.org/arbitrary')).toThrow();
  expect(readdirSync(join(dir,'state'))).toEqual(['resource-signing.key']);expect(readFileSync(join(dir,'state/resource-signing.key')).length).toBe(32);
  jobs.release('owner','op',token);expect(jobs.memoryBytes).toBe(0);expect(()=>jobs.status('owner','op',token)).toThrow();
 });
 it('does not revive a cancelled/expired candidate after late completion and retains reservations until extractor settles',async()=>{
  const {tickets}=state();let finish!:(v:Awaited<ReturnType<typeof webFixture>>)=>void,now=1000;const pending=new Promise<Awaited<ReturnType<typeof webFixture>>>(r=>finish=r);
  const jobs=new HostedWebImports(tickets,{extractor:async()=>pending,clock:()=>now,memoryLimit:WEB_LIMITS.totalBytes});
  await jobs.start('owner','ip',token,{url:WEB_URL,operationId:'op'});jobs.cancel('owner','op',token);expect(jobs.memoryBytes).toBe(WEB_LIMITS.totalBytes);
  await expect(jobs.start('other','ip',token,{url:WEB_URL,operationId:'next'})).rejects.toMatchObject({code:'web_memory_limit'});
  finish(await webFixture());await new Promise(r=>setTimeout(r,10));expect(jobs.status('owner','op',token).status).toBe('cancelled');expect(jobs.memoryBytes).toBe(0);
  await jobs.start('owner','ip',token,{url:WEB_URL,operationId:'new'});now+=WEB_LIMITS.previewMs+1;expect(()=>jobs.status('owner','new',token)).toThrow('过期');
 });
 it('rejects arbitrary capture fields, concurrency/memory overcommit and invalid retry tickets before fetching',async()=>{
  const {tickets}=state();let calls=0;const jobs=new HostedWebImports(tickets,{extractor:async()=>new Promise(()=>{}),fetcher:async()=>{calls++;throw new Error('must not fetch');},memoryLimit:WEB_LIMITS.totalBytes*2});
  await jobs.start('a','ip',token,{url:WEB_URL,operationId:'one'});await jobs.start('b','ip',token,{url:WEB_URL,operationId:'two'});expect(jobs.memoryBytes).toBe(WEB_LIMITS.totalBytes*2);
  await expect(jobs.start('c','ip',token,{url:WEB_URL,operationId:'three'})).rejects.toMatchObject({code:'web_memory_limit'});
  await expect(jobs.start('d','ip',token,{capture:{cookie:'PRIVATE'},operationId:'capture'},true)).rejects.toThrow();
  await expect(jobs.retry('a','ip',token,{operationId:'retry',ticket:'bad'},new AbortController().signal)).rejects.toMatchObject({code:'web_ticket_invalid'});expect(calls).toBe(0);
  jobs.cancel('a','one',token);jobs.cancel('b','two',token);
 });
 it('enforces sequential browser/IP daily network limits even after jobs are released',async()=>{
  const {tickets}=state(),data=await webFixture(),jobs=new HostedWebImports(tickets,{extractor:async()=>structuredClone(data)});
  for(let i=0;i<60;i++){const owner=i<30?'first':'second',op='operation-'+i;await jobs.start(owner,'same-ip',token,{url:WEB_URL,operationId:op});await ready(jobs,owner,op);jobs.release(owner,op,token);}
  await expect(jobs.start('first','new-ip',token,{url:WEB_URL,operationId:'browser-over'})).rejects.toMatchObject({code:'web_rate_limit'});
  await expect(jobs.start('fresh','same-ip',token,{url:WEB_URL,operationId:'ip-over'})).rejects.toMatchObject({code:'web_rate_limit'});
  expect(jobs.memoryBytes).toBe(0);
 });
 it('replaces an orphaned ready preview when the same input is retried, while a different input stays busy',async()=>{
  const {tickets}=state(),data=await webFixture(),jobs=new HostedWebImports(tickets,{extractor:async()=>structuredClone(data)});
  await jobs.start('owner','ip',token,{url:WEB_URL,operationId:'old'});expect((await ready(jobs,'owner','old')).status).toBe('ready');
  await jobs.start('owner','ip',token,{url:WEB_URL,operationId:'retry'});const retried=await ready(jobs,'owner','retry');
  expect(retried.operationId).toBe('retry');expect(retried.status).toBe('ready');expect(()=>jobs.status('owner','old',token)).toThrow('不存在');
  await expect(jobs.start('owner','ip',token,{url:'https://example.org/other',operationId:'other'})).rejects.toMatchObject({code:'web_busy'});
 });
 it('only retries signed public original media, explicitly disables proxy and returns verified bytes without modifying original',async()=>{
  const {tickets}=state(),fixture=await webFixture();const doc=fixture.workspace.document;if(doc.kind!=='web')throw new Error();const media=doc.web.media[0],image=fixture.resources.get(media.resourceId!)!;let fetched=0;
  const ticket=tickets.sign({v:1,documentId:doc.id,contentVersion:doc.web.contentVersion,mediaId:media.id,sourceUrl:media.sourceUrl!,extractorVersion:doc.web.extractorVersion});
  const jobs=new HostedWebImports(tickets,{fetcher:async(url,options)=>{fetched++;expect(options.disableProxy).toBe(true);expect(options.resolver).toBeTypeOf('function');return {url,type:image.mime,bytes:image.bytes};}});
  const result=await jobs.retry('owner','ip',token,{operationId:'retry',ticket},new AbortController().signal);expect(result.documentId).toBe(doc.id);expect(result.media.resourceId).toBe(media.resourceId);expect(Buffer.from(result.resource.base64,'base64').equals(image.bytes)).toBe(true);expect(fetched).toBe(1);expect(jobs.memoryBytes).toBe(0);
 });
});

it.each([undefined,false,true])('uses the same server-owned proxy policy for article/media extraction and signed retry (opt-in %s)',async allowLocalWebProxy=>{
 const {tickets}=state(),fixture=await webFixture(),doc=fixture.workspace.document;if(doc.kind!=='web')throw Error();const media=doc.web.media[0],image=fixture.resources.get(media.resourceId!)!;
 const requests:Array<{url:string;options:Parameters<NonNullable<import('./hosted-web-imports').HostedWebOptions['fetcher']>>[1]}>=[];
 const {WEB_HTML}=await import('./test-support/web-fixture');
 const jobs=new HostedWebImports(tickets,{allowLocalWebProxy,fetcher:async(url,options)=>{requests.push({url,options});return url.endsWith('image.png')?{url,type:image.mime,bytes:image.bytes}:{url,type:'text/html',bytes:Buffer.from(WEB_HTML)};}});
 await jobs.start('owner','ip',token,{url:WEB_URL,operationId:'op'});const result=await ready(jobs);expect(result.status).toBe('ready');const imported=result.preview!.workspace.document;if(imported.kind!=='web')throw Error();const importedMedia=imported.web.media[0];
 await jobs.retry('owner','ip',token,{operationId:'retry',ticket:result.preview!.retryTickets![importedMedia.id]},new AbortController().signal);
 expect(requests.map(r=>r.options.maxBytes)).toEqual([WEB_LIMITS.htmlBytes,WEB_LIMITS.imageBytes,WEB_LIMITS.imageBytes]);
 for(const {options} of requests){
  if(allowLocalWebProxy){expect(options).not.toHaveProperty('disableProxy');expect(options).not.toHaveProperty('resolver');}
  else {expect(options.disableProxy).toBe(true);expect(options.resolver).toBeTypeOf('function');}
  expect(options.signal).toBeInstanceOf(AbortSignal);expect(options.budget).toEqual(expect.objectContaining({requests:expect.any(Number),bytes:expect.any(Number)}));expect(options.validateUrl).toBeTypeOf('function');
 }
 // A browser cannot choose or override the server's transport policy.
 await expect(jobs.start('other','ip',token,{url:WEB_URL,operationId:'bad',allowLocalWebProxy:true})).rejects.toThrow('字段无效');
 await expect(jobs.retry('owner','ip',token,{operationId:'bad-retry',ticket:result.preview!.retryTickets![importedMedia.id],disableProxy:false},new AbortController().signal)).rejects.toThrow('请求无效');
});
