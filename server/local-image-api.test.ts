// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from './index';
import { ReadingLibrary } from './reading-library';
import { webFixture } from './test-support/web-fixture';
import type { InquiryRequest } from '../src/types';

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});

async function setup() {
  const dir=await mkdtemp(join(tmpdir(),'got-it-image-api-'));dirs.push(dir);
  const library=new ReadingLibrary(join(dir,'data')),fixture=await webFixture();
  const entry=await library.addWeb(fixture.workspace,fixture.resources,randomUUID());
  let received:Buffer|undefined,calls=0;
  const providerService={answer:async(_request:InquiryRequest,options:{image?:Buffer})=>{calls++;received=options.image;return{answer:'ok',sources:[],evidenceStatus:'not-applicable',mode:'live',providerId:'codex',providerName:'Codex'};}};
  const app=createApp({library,providerService:providerService as never,distPath:join(dir,'missing')});
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const port=(server.address() as {port:number}).port,base=`http://127.0.0.1:${port}`;
  const session=await (await fetch(base+'/api/library/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json() as {token:string};
  if(entry.workspace.document.kind!=='web')throw Error();
  const media=entry.workspace.document.web.media.find(m=>m.status==='saved')!;
  return {library,entry,media,base,token:session.token,received:()=>received,calls:()=>calls,close:()=>new Promise<void>(resolve=>server.close(()=>resolve()))};
}

it('converts a selected web image into PNG for the local provider and rejects forged media',async()=>{
 const s=await setup();
 try{
  const body={providerId:'codex',intent:'explain',quote:'Diagram',context:'图片说明：Diagram',question:'这张图说明什么？',history:[],image:{kind:'web-media',entryId:s.entry.id,revisionId:s.entry.revisionId,mediaId:s.media.id,resourceId:s.media.resourceId}};
  const response=await fetch(s.base+'/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json','X-Got-It-Session':s.token},body:JSON.stringify(body)});
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({answer:'ok'});
  expect(s.calls()).toBe(1);expect(s.received()?.subarray(0,8)).toEqual(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const png=s.received()!;expect(png.readUInt32BE(16)).toBe(16);expect(png.readUInt32BE(20)).toBe(8);
  for(const image of [
    {...body.image,mediaId:'missing'},
    {...body.image,revisionId:randomUUID()},
    {...body.image,resourceId:'c'.repeat(64)},
    {...body.image,entryId:randomUUID()},
  ]){
    const bad=await fetch(s.base+'/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json','X-Got-It-Session':s.token},body:JSON.stringify({...body,image})});
    expect(bad.status).toBe(400);expect((await bad.json()).error).toContain('网页图片');
  }
  expect(s.calls()).toBe(1);
 }finally{await s.close();}
});

it('rejects a web image request without a library session or for another provider',async()=>{
 const s=await setup();
 try{
  const image={kind:'web-media',entryId:s.entry.id,revisionId:s.entry.revisionId,mediaId:s.media.id,resourceId:s.media.resourceId};
  const body={providerId:'codex',intent:'explain',quote:'Diagram',context:'',question:'看图。',history:[],image};
  const noSession=await fetch(s.base+'/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  expect(noSession.status).toBe(401);expect(s.calls()).toBe(0);
  const wrong=await fetch(s.base+'/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json','X-Got-It-Session':s.token},body:JSON.stringify({...body,providerId:'deepseek'})});
  expect(wrong.status).toBe(400);expect(s.calls()).toBe(0);
 }finally{await s.close();}
});
