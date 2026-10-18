import type { LibraryEntry, LibrarySummary, ReadingPosition } from './library-types';
import type { Workspace } from '../types';
import {renderMarkdown} from './markdown';
import { translatedRendering } from './translation-reading';
export const START_VIEW_KEY='got-it.session-view.v1';
export function initialReadingView(storage: Pick<Storage,'getItem'>|(()=>Pick<Storage,'getItem'>), navigationType?:string):'start'|'reading'{
  try{return navigationType==='reload'&&(typeof storage==='function'?storage():storage).getItem(START_VIEW_KEY)==='reading'?'reading':'start';}catch{return 'start';}
}
export function recentEntries(entries:readonly LibrarySummary[]){return [...entries].sort((a,b)=>b.lastOpenedAt.localeCompare(a.lastOpenedAt)||a.id.localeCompare(b.id));}
export function startExcerpt(workspace:Workspace,position:ReadingPosition){
  if(workspace.document.kind==='pdf')return {text:workspace.inquiries.find(i=>i.anchor.pdf?.page===position.pdfPage)?.anchor.quote??'',blockId:position.blockId,page:position.pdfPage??1};
  const root=document.createElement('div');root.innerHTML=translatedRendering(workspace).html;
  const blocks=[...root.querySelectorAll<HTMLElement>('[data-block-id]')];
  const saved=blocks.find(b=>b.dataset.blockId===position.blockId);
  const first=root.querySelector<HTMLElement>('p,li,blockquote');
  const block=saved??first;
  return {text:(block?.textContent??'').trim().slice(0,240),blockId:block?.dataset.blockId,page:undefined};
}
export function startNotes(workspace:Workspace,blockId?:string){return [...workspace.inquiries].sort((a,b)=>Number(b.anchor.blockId===blockId)-Number(a.anchor.blockId===blockId)||b.updatedAt.localeCompare(a.updatedAt)).slice(0,3);}
export function notePreview(inquiry:Workspace['inquiries'][number]){const content=[...inquiry.messages].reverse().find(m=>m.role==='assistant')?.content;if(!content)return inquiry.lastError??'尚无回答，回到原文后可主动继续。';const root=document.createElement('div');root.innerHTML=renderMarkdown(content).html;return (root.textContent??'').trim().slice(0,280);}
export function preferredStartEntry(activeId:string|null,entries:readonly LibrarySummary[]):string|undefined{return activeId??recentEntries(entries)[0]?.id;}

export function noteState(inquiry:Workspace['inquiries'][number]){const last=[...inquiry.messages].reverse().find(m=>m.role==='assistant');return inquiry.lastError||last?.completion==='interrupted'||last?.verification?.completion==='interrupted'||last?.search?.status==='failed'?'回答未完成':inquiry.status==='answering'?'回答中':undefined;}
