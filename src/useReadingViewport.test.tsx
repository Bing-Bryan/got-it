import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReadingViewport } from './useReadingViewport';

let host: HTMLDivElement, root: Root;
let viewport: EventTarget & {height:number;offsetTop:number;scale:number};
let narrow = true;
const reveal = vi.fn();
function Harness() {
  const frame = useRef<HTMLDivElement>(null);
  useReadingViewport(frame);
  return <div ref={frame}><form className="question-composer"><textarea defaultValue="未发送草稿"/><button>发送</button></form></div>;
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  narrow = true;
  viewport = Object.assign(new EventTarget(), {height:844,offsetTop:0,scale:1});
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerHeight',844);
  vi.stubGlobal('matchMedia',()=>({matches:narrow}));
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>setTimeout(()=>cb(0),0));
  vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  HTMLElement.prototype.scrollIntoView = reveal;
  reveal.mockClear();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const mount=()=>act(async()=>root.render(<Harness/>));
const resize=async()=>act(async()=>{viewport.dispatchEvent(new Event('resize'));await new Promise(r=>setTimeout(r,5));});
it('keeps a focused draft mounted and reveals its whole composer after visual-only keyboard shrink',async()=>{
 await mount();const frame=host.firstElementChild as HTMLElement,input=host.querySelector('textarea')!;
 input.focus();viewport.height=400;await resize();
 expect(frame.style.getPropertyValue('--reading-viewport-height')).toBe('400px');
 expect(frame.style.getPropertyValue('--reading-viewport-bottom')).toBe('444px');
 expect(frame.dataset.keyboardVisible).toBe('true');expect(reveal).toHaveBeenCalled();
 expect(host.querySelector('textarea')).toBe(input);expect(input.value).toBe('未发送草稿');expect(document.activeElement).toBe(input);
 viewport.height=844;await resize();expect(frame.dataset.keyboardVisible).toBe('false');expect(frame.style.getPropertyValue('--reading-viewport-bottom')).toBe('0px');
});
it('accounts for viewport panning once and leaves pinch zoom and desktop layout alone',async()=>{
 await mount();const frame=host.firstElementChild as HTMLElement;
 viewport.height=400;viewport.offsetTop=80;await resize();
 expect(frame.style.getPropertyValue('--reading-viewport-top')).toBe('80px');
 expect(frame.style.getPropertyValue('--reading-viewport-bottom')).toBe('364px');
 viewport.scale=1.5;await resize();expect(frame.style.length).toBe(0);expect(frame.dataset.keyboardVisible).toBeUndefined();
 viewport.scale=1;narrow=false;await resize();expect(frame.style.length).toBe(0);
});
it('scroll updates geometry without moving focus or scrolling the composer, and cleans listeners on unmount',async()=>{
 await mount();const frame=host.firstElementChild as HTMLElement;
 viewport.height=400;viewport.offsetTop=40;viewport.dispatchEvent(new Event('scroll'));
 expect(frame.style.getPropertyValue('--reading-viewport-top')).toBe('40px');expect(reveal).not.toHaveBeenCalled();
 await act(async()=>root.render(null));expect(frame.style.length).toBe(0);
 viewport.dispatchEvent(new Event('resize'));expect(frame.style.length).toBe(0);
});
it('uses existing CSS when the visual viewport API is unavailable',async()=>{
 vi.stubGlobal('visualViewport',undefined);await mount();expect((host.firstElementChild as HTMLElement).style.length).toBe(0);
});
it('cancels a queued reveal when pinch starts and skips reveal after the input loses focus',async()=>{
 await mount();const input=host.querySelector('textarea')!;
 input.focus();viewport.height=400;viewport.dispatchEvent(new Event('resize'));
 viewport.scale=1.5;viewport.dispatchEvent(new Event('resize'));
 await new Promise(r=>setTimeout(r,5));expect(reveal).not.toHaveBeenCalled();
 viewport.scale=1;viewport.dispatchEvent(new Event('resize'));input.blur();
 await new Promise(r=>setTimeout(r,5));expect(reveal).not.toHaveBeenCalled();
 input.focus();viewport.dispatchEvent(new Event('resize'));viewport.height=844;viewport.dispatchEvent(new Event('resize'));
 await new Promise(r=>setTimeout(r,5));expect(reveal).not.toHaveBeenCalled();
});
