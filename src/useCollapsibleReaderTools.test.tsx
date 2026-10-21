import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isScrollKey, nextCollapsed, useCollapsibleReaderTools, type CollapseTracker } from './useCollapsibleReaderTools';
const tracker=():CollapseTracker=>({last:0,upward:0,settleUntil:0});
const view=(scrollTop:number)=>({scrollTop,clientHeight:600});
it('folds only after reading down past a quarter screen and unfolds after a deliberate upward scroll or at the top',()=>{const t=tracker();expect(nextCollapsed(t,view(100),false,0)).toBeNull();expect(nextCollapsed(t,view(160),false,0)).toBe(true);expect(nextCollapsed(t,view(150),true,1000)).toBeNull();expect(nextCollapsed(t,view(130),true,1000)).toBe(false);const top=tracker();top.last=400;expect(nextCollapsed(top,view(4),true,0)).toBe(false);});
it('never folds for programmatic scrolls such as restoring a saved position, but still unfolds',()=>{const t=tracker();expect(nextCollapsed(t,view(281),false,0,false)).toBeNull();const up={...tracker(),last:500};expect(nextCollapsed(up,view(460),true,0,false)).toBe(false);});
it('ignores the clamped scroll echo right after a toggle so the bottom of an article does not flicker',()=>{const t={...tracker(),last:900,settleUntil:500};expect(nextCollapsed(t,view(780),true,100)).toBeNull();expect(t.last).toBe(780);expect(t.upward).toBe(0);expect(nextCollapsed(t,view(780),true,600)).toBeNull();});
let host:HTMLDivElement,root:Root,narrow=true,api:ReturnType<typeof useCollapsibleReaderTools>;
let foldable=true;
function Harness({enabled,resetKey}:{enabled:boolean;resetKey:string}){api=useCollapsibleReaderTools({enabled,resetKey,canFold:()=>foldable});return <p data-collapsed={String(api.collapsed)}/>;}
const collapsed=()=>host.querySelector('p')!.dataset.collapsed;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;narrow=true;foldable=true;vi.stubGlobal('matchMedia',vi.fn(()=>({get matches(){return narrow;},addEventListener:vi.fn(),removeEventListener:vi.fn()})));vi.spyOn(performance,'now').mockReturnValue(10_000);host=document.createElement('div');root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals();vi.restoreAllMocks();});
async function render(enabled:boolean,resetKey='doc-1'){await act(async()=>root.render(<Harness enabled={enabled} resetKey={resetKey}/>));}
async function scroll(y:number){await act(async()=>{api.noteUserScroll();api.onScroll(view(y));});}
async function restore(y:number){await act(async()=>api.onScroll(view(y)));}
it('folds on a narrow screen and reopens when an attention state appears or the document changes',async()=>{await render(true);await scroll(200);expect(collapsed()).toBe('true');await render(false);expect(collapsed()).toBe('false');await render(true);expect(collapsed()).toBe('false');vi.mocked(performance.now).mockReturnValue(20_000);await scroll(400);expect(collapsed()).toBe('true');await render(true,'doc-2');expect(collapsed()).toBe('false');});
it('keeps the tools open when a saved reading position is restored without reader input',async()=>{await render(true);await restore(281);expect(collapsed()).toBe('false');await scroll(320);expect(collapsed()).toBe('true');});
it('never folds while disabled or on a wide screen, and expand() always reopens',async()=>{await render(false);await scroll(300);expect(collapsed()).toBe('false');narrow=false;await act(async()=>root.unmount());root=createRoot(host);await render(true);await scroll(300);expect(collapsed()).toBe('false');narrow=true;await act(async()=>root.unmount());root=createRoot(host);await render(true);await scroll(300);expect(collapsed()).toBe('true');await act(async()=>api.expand());expect(collapsed()).toBe('false');});
it('does not fold while focus, an open disclosure or an alert sits in the row',async()=>{foldable=false;await render(true);await scroll(300);expect(collapsed()).toBe('false');foldable=true;vi.mocked(performance.now).mockReturnValue(20_000);await scroll(400);expect(collapsed()).toBe('true');});
it('counts only scrolling keys outside text fields as reader scrolling',()=>{const input=document.createElement('input');expect(isScrollKey({key:'PageDown',target:document.body})).toBe(true);expect(isScrollKey({key:' ',target:document.body})).toBe(true);expect(isScrollKey({key:'Enter',target:document.body})).toBe(false);expect(isScrollKey({key:'ArrowDown',target:input})).toBe(false);});
