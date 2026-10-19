import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('./runtime-mode',()=>({HOSTED:true,trialId:()=> '123e4567-e89b-42d3-a456-426614174000'}));
import {FEATURE_KEYS,flushUsage,noteAnswerComplete,noteAiStarted,noteMaterial,installUsage,noteCount,noteResultSaved,pendingBatches,setUsageEnabled,track,usageEnabled} from './hosted-usage';

beforeEach(()=>{localStorage.clear();sessionStorage.clear();setUsageEnabled(false);setUsageEnabled(true);vi.restoreAllMocks();});

it('keeps a closed preference and does not send after it is turned off', async () => {
  setUsageEnabled(false);
  noteCount('answer_complete');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await flushUsage();
  expect(usageEnabled()).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  expect(pendingBatches()).toEqual([]);
});

it('does not upload body, url, or identity fields', async () => {
  const fetcher = vi.fn().mockResolvedValue({status: 204, json: async () => ({})});
  vi.stubGlobal('fetch', fetcher);
  noteAnswerComplete('operation-1');
  await flushUsage();
  const call = fetcher.mock.calls.at(-1);
  expect(call).toBeTruthy();
  const body = JSON.parse(call![1].body);
  expect(body.schemaVersion).toBe(2);
  expect(body.batchId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(Object.keys(body).sort()).toEqual(['batchId','channel','counts','createdAt','discarded','funnel','material','reach','schemaVersion']);
  expect(JSON.stringify(body)).not.toContain('operation-1');
  expect(JSON.stringify(body)).not.toMatch(/filename|https?:\/\/|"quote"/);
});

it('acks a batch once and keeps the same id when the response is lost', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({status: 503, json: async () => ({})}).mockResolvedValueOnce({status: 204, json: async () => ({})});
  vi.stubGlobal('fetch', fetcher);
  noteCount('bookmark_saved');
  await flushUsage();
  const first = fetcher.mock.calls[0][1].body;
  await flushUsage();
  expect(fetcher.mock.calls[1][1].body).toBe(first);
  expect(pendingBatches()).toEqual([]);
});

it('discards unknown feature keys instead of leaking arbitrary text', () => {
  track('SECRET_FILENAME.pdf' as never);
  expect(localStorage.getItem('got-it.usage.v1')).not.toContain('SECRET');
});

it('keeps the feature whitelist available for the legacy protocol', async () => {
  const server = await import('../../server/hosted-statistics');
  expect(FEATURE_KEYS).toEqual(server.FEATURE_KEYS);
});

it('does not count a saved old answer as this round', () => {
  noteResultSaved('old-operation');
  expect(pendingBatches().some(batch => batch.counts.result_saved > 0)).toBe(false);
});


it('seals payloads across a lost ACK and preserves new events in a different batch', async()=>{
 const requests:any[]=[];let accepted=0;const seen=new Set<string>();let lose=true;
 vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{const b=JSON.parse(options.body);requests.push(b);if(!seen.has(b.batchId)){seen.add(b.batchId);accepted+=b.counts.bookmark_saved;}if(lose){lose=false;throw Error('ACK lost');}return {status:204};}));
 noteCount('bookmark_saved');await flushUsage();const first=JSON.stringify(requests[0]);
 noteCount('bookmark_saved');await flushUsage();
 expect(JSON.stringify(requests[1])).toBe(first);expect(accepted).toBe(2);expect(pendingBatches()).toEqual([]);
});

it('keeps events emitted while the previous batch is in flight',async()=>{
 let resolve!:(v:any)=>void;const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValue({status:204});vi.stubGlobal('fetch',fetcher);
 noteCount('bookmark_saved');const sending=flushUsage();await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());
 noteCount('bookmark_saved');resolve({status:204});await sending;
 expect(pendingBatches().reduce((n,b)=>n+b.counts.bookmark_saved,0)).toBe(1);
 await flushUsage();expect(fetcher).toHaveBeenCalledTimes(2);
});

it('does not send queued material batches or restore enabled preference after disabling in flight',async()=>{
 let resolve!:(v:any)=>void;const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(r=>resolve=r));vi.stubGlobal('fetch',fetcher);
 noteCount('bookmark_saved','markdown');noteCount('bookmark_saved','pdf');const sending=flushUsage();await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());setUsageEnabled(false);resolve({status:204});await sending;
 expect(fetcher).toHaveBeenCalledOnce();expect(usageEnabled()).toBe(false);expect(pendingBatches()).toEqual([]);
});

it('extends one visit on reinstall and counts a later idle visit separately',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('offline')));
 const stop=installUsage();noteMaterial('markdown');await flushUsage();stop();
 const first=pendingBatches().reduce((n,b)=>n+b.reach.visit_started,0);
 const stopAgain=installUsage();noteMaterial('markdown');await flushUsage();stopAgain();
 expect(pendingBatches().reduce((n,b)=>n+b.reach.visit_started,0)).toBe(first);
 const real=Date.now();vi.spyOn(Date,'now').mockReturnValue(real+31*60_000);noteMaterial('markdown');
 expect(pendingBatches().reduce((n,b)=>n+b.reach.visit_started,0)).toBe(first+1);
});

it('does not join completed operation A to saved operation B',()=>{
 noteMaterial('markdown');noteAiStarted('A');noteAnswerComplete('A');noteAiStarted('B');noteResultSaved('B');
 expect(pendingBatches().reduce((n,b)=>n+b.funnel.result_saved,0)).toBe(0);
 noteAnswerComplete('B');noteResultSaved('B');
 expect(pendingBatches().reduce((n,b)=>n+b.funnel.result_saved,0)).toBe(1);
});

it('keeps event-specific import attribution from replacing the current reading material',()=>{
 noteMaterial('pdf');noteCount('import_started','web');noteCount('import_failed','web');noteAiStarted('pdf-answer');noteAnswerComplete('pdf-answer');
 expect(pendingBatches().filter(b=>b.material==='web').reduce((n,b)=>n+b.counts.import_failed,0)).toBe(1);
 expect(pendingBatches().filter(b=>b.material==='pdf').reduce((n,b)=>n+b.counts.answer_complete,0)).toBe(1);
});
it('uses bounded jittered retries without changing the wire batch',async()=>{
 const fetcher=vi.fn().mockResolvedValue({status:503});vi.stubGlobal('fetch',fetcher);vi.spyOn(Math,'random').mockReturnValue(.5);let clock=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>clock);
 noteCount('bookmark_saved');await flushUsage(true);const wire=fetcher.mock.calls[0][1].body;
 await flushUsage(true);expect(fetcher).toHaveBeenCalledOnce();
 for(const seconds of [1,5,30,120,300,300]){clock+=seconds*1000;await flushUsage(true);expect(fetcher.mock.calls.at(-1)![1].body).toBe(wire);}
 expect(fetcher).toHaveBeenCalledTimes(7);expect(JSON.parse(wire)).not.toHaveProperty('delivery');
});

it('bounds offline overflow to 100 batches and carries the discarded count forward',()=>{
 vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));let clock=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>clock);
 for(let n=0;n<110;n++){clock+=31*60_000;noteCount('bookmark_saved','markdown');}
 const batches=pendingBatches();expect(batches.length).toBeLessThanOrEqual(100);expect(batches.reduce((n,b)=>n+b.discarded,0)).toBeGreaterThan(0);expect(new TextEncoder().encode(JSON.stringify(batches)).length).toBeLessThan(256*1024);
});
