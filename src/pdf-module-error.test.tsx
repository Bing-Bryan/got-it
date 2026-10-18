import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PdfReaderBoundary,reloadAfterPreserving} from './PdfReaderBoundary';
import {createInitialWorkspace} from './sample';
import {TEST_MODELS} from '../server/test-support/model-catalog';
import App from './App';
const {api}=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('./lib/library-client',()=>({libraryRequest:api,libraryBinary:vi.fn()}));
vi.mock('./PdfOutline',()=>({default:()=>null}));
vi.mock('./PdfReader',async()=>{throw new TypeError('Failed to fetch dynamically imported module: http://127.0.0.1:5175/src/PdfReader.tsx');});
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});localStorage.clear();sessionStorage.clear();vi.spyOn(console,'error').mockImplementation(()=>{});host=document.body.appendChild(document.createElement('div'));root=createRoot(host);HTMLElement.prototype.scrollTo=vi.fn();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
function Fails({message}:{message:string}):never{throw Error(message);}
it('keeps real App navigation alive after the reported lazy rejection and can switch to Markdown',async()=>{
 const original=createInitialWorkspace(),pdf={...original,document:{kind:'pdf' as const,id:'safe-pdf',filename:'safe.pdf',contentHash:'a'.repeat(64),importedAt:'2026',isDemo:false,pdf:{resourceId:'a'.repeat(64),pages:[{view:[0,0,100,100] as [number,number,number,number],rotation:0}]}}},md={...original,document:{kind:'markdown' as const,id:'safe-md',filename:'safe.md',contentHash:'safe',importedAt:'2026',isDemo:false,markdown:'# Safe Markdown\n\nSaved original text.'}};
 const entries=[pdf,md].map((workspace,i)=>({id:i?'md':'pdf',version:1,revisionId:'revision',workspace,source:null,position:{ratio:.7,pdfPage:4},history:[],lastOpenedAt:'2026',updatedAt:'2026',creationKey:'safe'}));let active='pdf';
 api.mockImplementation(async(path='',body)=>{if(!path)return{entries:entries.map(e=>({id:e.id,filename:e.workspace.document.filename,lastOpenedAt:'2026',path:null,historyCount:0})),activeId:active,warnings:[],nativePicker:false};if(path==='/recoveries')return[];if(path.startsWith('/bookmarks?'))return{bookmarks:[],total:0,revision:0,warnings:[]};if(path.endsWith('/check'))return{status:'unlinked'};const e=entries.find(e=>path.startsWith('/entries/'+e.id));if(!e)throw Error(path);if(path.endsWith('/activate'))active=e.id;if(path.endsWith('/save')){expect(body.position.pdfPage).toBe(4);}return e;});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({models:TEST_MODELS,providers:[{id:'codex',name:'Codex',availability:'connected'}]})));
 await act(async()=>root.render(<App/>));await act(async()=>host.querySelector<HTMLButtonElement>('.start-resume button')!.click());
 expect(host.querySelector('.pdf-module-error')?.textContent).toContain('PDF 阅读模块未能加载');expect(host.querySelector('.left-sidebar')).not.toBeNull();expect(host.querySelector('.reader-toolbar')).not.toBeNull();expect(host.querySelector('.start-brand')).not.toBeNull();
 await act(async()=>host.querySelector<HTMLButtonElement>('.library-current')!.click());await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('.library-open')].find(b=>b.textContent==='safe.md')!.click());expect(host.querySelector('.pdf-module-error')).toBeNull();expect(host.querySelector('.markdown-article')?.textContent).toContain('Saved original text.');
});
it('distinguishes other PDF rendering failures and keeps failed recovery visible without reloading',async()=>{const reload=vi.fn(),preserve=vi.fn().mockResolvedValue(false);await act(async()=>root.render(<PdfReaderBoundary onReload={()=>reloadAfterPreserving(preserve,reload)}><Fails message="Unexpected PDF rendering failure"/></PdfReaderBoundary>));expect(host.textContent).toContain('PDF 阅读区域出现错误');expect(host.textContent).not.toContain('模块下载');await act(async()=>host.querySelector<HTMLButtonElement>('.pdf-module-error button')!.click());expect(preserve).toHaveBeenCalledOnce();expect(reload).not.toHaveBeenCalled();expect(host.textContent).toContain('当前阅读进度尚未保存');});
it('reloads only after preservation resolves successfully and propagates save errors',async()=>{const events:string[]=[],reload=vi.fn(()=>events.push('reload'));await reloadAfterPreserving(async()=>{events.push('saved');return true;},reload);expect(events).toEqual(['saved','reload']);reload.mockClear();await expect(reloadAfterPreserving(async()=>{throw Error('Injected write failure');},reload)).rejects.toThrow('Injected write failure');expect(reload).not.toHaveBeenCalled();});
