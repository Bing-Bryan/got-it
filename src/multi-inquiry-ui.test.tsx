import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {afterEach,expect,it,vi} from 'vitest';
import App from './App';import {createInitialWorkspace} from './sample';import {TEST_MODELS} from '../server/test-support/model-catalog';import type {InquiryRequest,Workspace} from './types';
const {api,stream}=vi.hoisted(()=>({api:vi.fn(),stream:vi.fn()}));vi.mock('./lib/library-client',()=>({libraryRequest:api,libraryBinary:vi.fn()}));vi.mock('./lib/inquiry-stream',async original=>({...await original<typeof import('./lib/inquiry-stream')>(),readInquiryStream:stream}));
let root:Root,host:HTMLDivElement;afterEach(async()=>{await act(async()=>root?.unmount());host?.remove();localStorage.clear();window.getSelection()?.removeAllRanges();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function setup(huge=false,secondDocument=false){(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();HTMLElement.prototype.scrollIntoView=vi.fn();HTMLElement.prototype.scrollTo=vi.fn();vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({models:TEST_MODELS,providers:[{id:'codex',name:'Codex',availability:'connected',supportsWebSearch:true}]})})));const workspace=createInitialWorkspace();workspace.document={id:'safe-ui-multi',filename:'safe-ui.md',kind:'markdown',contentHash:'safehash',importedAt:'2026',isDemo:false,markdown:'# Heading\n\n'+(huge?'A'.repeat(20001):'FIRST COMPLETE SOURCE.')+'\n\n## Middle heading\n\nLAST COMPLETE SOURCE.\n\nUNRELATED SENTINEL '+('distant text '.repeat(1000))};let current={id:'safe-entry',version:1,revisionId:'safe-revision',source:null,workspace,position:{ratio:0},history:[],updatedAt:'2026',lastOpenedAt:'2026',creationKey:'fixture'};
 const other={...structuredClone(current),id:'safe-other',workspace:{...structuredClone(workspace),document:{...workspace.document,id:'safe-other-doc',filename:'other-safe.md',markdown:'# Other document\n\nOTHER DOCUMENT SENTINEL.'}}};
 api.mockReset().mockImplementation(async(path='',body)=>{if(path==='/entries/safe-other/activate'){current=other;return current;}if(!path)return{entries:[...(secondDocument?[{id:other.id,version:1,filename:'other-safe.md',path:null,lastOpenedAt:'2026',historyCount:0}]:[]),{id:current.id,version:current.version,filename:current.workspace.document.filename,path:null,lastOpenedAt:'2026',historyCount:0}],activeId:current.id,warnings:[],nativePicker:false};if(path==='/recoveries')return[];if(path.startsWith('/bookmarks?'))return{bookmarks:[],total:0,revision:0,warnings:[]};if(path==='/bookmarks/lookup')return{bookmark:null};if(path.endsWith('/check'))return{status:'unlinked',message:'safe fixture'};if(path.endsWith('/save')){current={...current,workspace:body.workspace,version:current.version+1};}return current;});
 stream.mockReset().mockImplementation(async(request:InquiryRequest,emit)=>emit({type:'complete',requestId:request.requestId,sequence:1,response:{answer:'Controlled transport fixture answer',sources:[],evidenceStatus:'not-applicable',mode:'live',providerId:'codex',providerName:'Controlled test'}}));host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<App/>));await act(async()=>new Promise(r=>setTimeout(r,25)));return()=>current.workspace as Workspace;
}
async function select(){await act(async()=>{const p=host.querySelectorAll('.markdown-article p'),range=document.createRange();range.setStart(p[0],0);range.setEnd(p[1],p[1].childNodes.length);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);p[0].dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));await new Promise(r=>setTimeout(r,25));});}
it.each(['explain','verify','ask'] as const)('sends complete multi-block %s only after explicit activation and persists every block',async intent=>{const getWorkspace=await setup();expect(stream).not.toHaveBeenCalled();await select();expect(stream).not.toHaveBeenCalled();if(intent==='ask'){await act(async()=>host.querySelector<HTMLButtonElement>('.selection-actions .question-input-trigger')!.click());expect(stream).not.toHaveBeenCalled();await act(async()=>{const t=host.querySelector('.selection-toolbar textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(t,'How do the first and last rules connect?');t.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>host.querySelector('.selection-toolbar form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}else await act(async()=>host.querySelector<HTMLButtonElement>(`.selection-actions [data-intent=${intent}]`)!.click());expect(stream).toHaveBeenCalledOnce();const request=stream.mock.calls[0][0] as InquiryRequest;expect(request.quote).toBe('FIRST COMPLETE SOURCE.\nMiddle heading\nLAST COMPLETE SOURCE.');expect(request.context).not.toContain('UNRELATED SENTINEL');expect(request.context.length).toBeLessThan(6000);if(intent!=='ask')expect(request.question).not.toContain('FIRST COMPLETE SOURCE');expect(host.querySelector('.selection-toolbar')).toBeNull();expect(host.querySelectorAll('mark[data-inquiry-id]')).toHaveLength(3);await vi.waitFor(async()=>{await act(async()=>{});expect(getWorkspace().inquiries[0]?.anchor.segments).toHaveLength(3);},{timeout:1200,interval:20});});
it('rejects an oversized complete range before any request or inquiry is created',async()=>{await setup(true);await select();await act(async()=>host.querySelector<HTMLButtonElement>('.selection-actions [data-intent=explain]')!.click());expect(stream).not.toHaveBeenCalled();expect(host.textContent).toContain('20000');expect(host.querySelector('.selection-toolbar')).not.toBeNull();expect(host.querySelectorAll('mark[data-inquiry-id]')).toHaveLength(0);});

it('keeps the selected text only in the accessible name and never renders a quote row, including ask input mode',async()=>{await setup();await select();const surface=host.querySelector('.selection-understanding')!;expect(surface.querySelector(':scope > .selection-quote')).toBeNull();expect(surface.getAttribute('role')).toBe('group');expect(surface.getAttribute('aria-label')).toMatch(/^选中的原文：FIRST COMPLETE SOURCE\./);expect(surface.querySelector('.selection-operation-row > .selection-bookmark-container .bookmark-icon')).not.toBeNull();expect(surface.querySelector('.selection-actions [data-intent=explain]')).not.toBeNull();expect(host.querySelector('.selection-toolbar > .selection-bookmark-container')).toBeNull();expect(surface.querySelector('.bookmark-icon')?.textContent).toBe('');expect(stream).not.toHaveBeenCalled();await act(async()=>host.querySelector<HTMLButtonElement>('.selection-actions .question-input-trigger')!.click());expect(host.querySelector('.selection-toolbar .selection-quote')).toBeNull();expect(host.querySelector('.selection-toolbar textarea')).not.toBeNull();expect(surface.getAttribute('aria-label')).toMatch(/^选中的原文：FIRST COMPLETE SOURCE\./);expect(stream).not.toHaveBeenCalled();});


it('follows the selection while the reader scrolls and hides when it leaves view',async()=>{
 await setup();
 let rect={left:100,top:300,right:200,bottom:340,width:100,height:40} as DOMRect;
 Object.defineProperty(Range.prototype,'getBoundingClientRect',{configurable:true,value:()=>rect});
 Object.defineProperty(Range.prototype,'getClientRects',{configurable:true,value:()=>[rect]});
 try{
  await select();
  const toolbar=host.querySelector<HTMLElement>('.selection-toolbar')!;
  const scroller=host.querySelector<HTMLElement>('.reader-scroll')!;
  const wait=()=>act(async()=>{scroller.dispatchEvent(new Event('scroll'));await new Promise(r=>setTimeout(r,180));});
  expect(parseFloat(toolbar.style.top)).toBe(352);
  scroller.scrollTop=100;
  rect={...rect,top:200,bottom:240};
  await act(async()=>{scroller.dispatchEvent(new Event('scroll'));});
  expect(parseFloat(toolbar.style.top)).toBe(252);
  rect={...rect,top:150,bottom:190};
  await wait();
  expect(parseFloat(toolbar.style.top)).toBe(202);
  rect={...rect,top:-100,bottom:-60};
  await wait();
  expect(toolbar.style.visibility).toBe('hidden');
  rect={...rect,top:150,bottom:190};
  await wait();
  expect(toolbar.style.visibility).toBe('visible');
  expect(parseFloat(toolbar.style.top)).toBe(202);
  await act(async()=>{host.querySelector<HTMLButtonElement>('.selection-actions .question-input-trigger')!.click();window.getSelection()?.removeAllRanges();});
  rect={...rect,top:210,bottom:250};
  await wait();
  expect(parseFloat(toolbar.style.top)).toBe(262);
  const input=host.querySelector<HTMLTextAreaElement>('.selection-toolbar textarea')!;
  await act(async()=>input.focus());
  rect={...rect,top:-100,bottom:-60};
  await wait();
  expect(toolbar.style.visibility).toBe('hidden');
  expect(document.activeElement).not.toBe(input);
 }finally{delete (Range.prototype as any).getBoundingClientRect;delete (Range.prototype as any).getClientRects;}
});

it('ignores a deliberately late completion after switching documents and clears the unsent document draft',async()=>{
 await setup(false,true);let emitLate!:(event:unknown)=>void;let finish!:()=>void;
 stream.mockImplementation((_request,emit)=>{emitLate=emit;return new Promise<void>(r=>finish=r);});
 await select();await act(async()=>host.querySelector<HTMLButtonElement>('.selection-actions [data-intent=explain]')!.click());expect(stream).toHaveBeenCalledTimes(1);
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label^="切换文件："]')!.click());await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('.library-open')].find(e=>e.textContent==='other-safe.md')!.click());
 expect(host.querySelector('.markdown-article')?.textContent).toContain('OTHER DOCUMENT SENTINEL');expect(host.querySelector('.selection-toolbar')).toBeNull();
 await act(async()=>{emitLate({type:'complete',response:{answer:'LATE OLD DOCUMENT',sources:[],evidenceStatus:'not-applicable',mode:'live',providerId:'codex'}});finish();});
 expect(host.textContent).not.toContain('LATE OLD DOCUMENT');expect(host.querySelector('.markdown-article')?.textContent).toContain('OTHER DOCUMENT SENTINEL');expect(stream).toHaveBeenCalledTimes(1);
});
