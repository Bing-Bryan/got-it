import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clampMarkdownWidth, MARKDOWN_WIDTH_KEY, useMarkdownWidth } from './useMarkdownWidth';
let host: HTMLDivElement, root: Root;
function Harness() {
 const article = useRef<HTMLElement>(null), control = useMarkdownWidth(article);
 return <><article ref={article}/><output>{control.width ?? "recommended"}</output><span role="status">{control.error}</span><button onClick={()=>control.change(100)}>wide</button><button onClick={()=>control.change(null)}>reset</button><button onClick={()=>control.change(NaN)}>invalid</button></>;
}
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;localStorage.removeItem(MARKDOWN_WIDTH_KEY);host=document.createElement('div');root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());vi.restoreAllMocks();localStorage.removeItem(MARKDOWN_WIDTH_KEY);});
async function mount(){await act(async()=>root.render(<Harness/>));}
async function click(index:number){await act(async()=>host.querySelectorAll('button')[index].click());}
it('restores a valid preference and constrains values',async()=>{localStorage.setItem(MARKDOWN_WIDTH_KEY,'65');await mount();expect(host.querySelector('output')!.textContent).toBe('65');expect(clampMarkdownWidth(20)).toBe(50);expect(clampMarkdownWidth(140)).toBe(100);});
it('stores changes and resets without changing document data',async()=>{await mount();await click(0);expect(localStorage.getItem(MARKDOWN_WIDTH_KEY)).toBe('100');await click(1);expect(localStorage.getItem(MARKDOWN_WIDTH_KEY)).toBeNull();await click(2);expect(host.querySelector('output')!.textContent).toBe('recommended');});
it('ignores invalid storage and tolerates blocked writes',async()=>{localStorage.setItem(MARKDOWN_WIDTH_KEY,'broken');await mount();expect(host.querySelector('output')!.textContent).toBe('recommended');vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});await click(0);expect(host.querySelector('output')!.textContent).toBe('100');});

it.each(['50','65','80','100'])('retains explicit legacy %s percent preferences without writing a new default',async value=>{
 localStorage.setItem(MARKDOWN_WIDTH_KEY,value);await mount();expect(host.querySelector('output')!.textContent).toBe(value);expect(localStorage.getItem(MARKDOWN_WIDTH_KEY)).toBe(value);
});
it('does not write a recommendation and reports failed reset without overwriting the old preference',async()=>{
 await mount();expect(localStorage.getItem(MARKDOWN_WIDTH_KEY)).toBeNull();await click(0);vi.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw Error('blocked');});await click(1);expect(host.querySelector('output')!.textContent).toBe('recommended');expect(host.querySelector('[role=status]')!.textContent).toContain('仅本次生效');expect(localStorage.getItem(MARKDOWN_WIDTH_KEY)).toBe('100');
});
it('falls back clearly when preferences cannot be read',async()=>{
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked');});await mount();expect(host.querySelector('output')!.textContent).toBe('recommended');expect(host.querySelector('[role=status]')!.textContent).toContain('无法读取');
});
