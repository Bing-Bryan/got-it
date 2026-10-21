import {act,useRef} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {StartEdgeTexture} from './StartEdgeTexture';
let root:Root,host:HTMLDivElement,width=1440,reduced=false,visibility:(()=>void)|undefined,resize:(()=>void)|undefined,intersection:((entries:{isIntersecting:boolean}[])=>void)|undefined;
const context={clearRect:vi.fn(),setTransform:vi.fn(),measureText:()=>({width:5}),save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),rect:vi.fn(),clip:vi.fn(),fillRect:vi.fn(),fillText:vi.fn()};
let frames:Map<number,FrameRequestCallback>,next=0;
function Harness({paused=false,enabled=true}:{paused?:boolean;enabled?:boolean}){const ref=useRef<HTMLElement>(null);return <main ref={ref}><StartEdgeTexture surfaceRef={ref} paused={paused} enabled={enabled}/><div className="start-shell"><header className="start-header"/><div className="start-feature-grid">{[0,1,2].map(i=><div className="start-feature" key={i}><article className="start-feature-card"/></div>)}</div></div></main>;}
beforeEach(()=>{
 vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});width=1440;reduced=false;frames=new Map();host=document.body.appendChild(document.createElement('div'));root=createRoot(host);
 vi.stubGlobal('requestAnimationFrame',vi.fn((cb:FrameRequestCallback)=>{frames.set(++next,cb);return next;}));vi.stubGlobal('cancelAnimationFrame',vi.fn((id:number)=>frames.delete(id)));
 vi.stubGlobal('matchMedia',()=>({get matches(){return reduced;},addEventListener:(_:string,cb:()=>void)=>{visibility=cb;},removeEventListener:vi.fn()}));
 vi.stubGlobal('ResizeObserver',class{constructor(cb:()=>void){resize=cb;}observe(){}disconnect(){}});
 vi.stubGlobal('IntersectionObserver',class{constructor(cb:(entries:{isIntersecting:boolean}[])=>void){intersection=cb;}observe(){}disconnect(){}});
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(function(this:HTMLCanvasElement){return this.classList.contains('start-edge-texture')?context as unknown as CanvasRenderingContext2D:null;});
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(()=>width);vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(900);
 vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(this:Element){const index=[...host.querySelectorAll(this.classList.contains('start-feature')?'.start-feature':'.start-feature-card')].indexOf(this);const left=index<0?0:160+index*390,top=this.classList.contains('start-header')?0:index<0?0:500,w=index<0?width:340,h=this.classList.contains('start-header')?76:900-top;return {left,right:left+w,top,bottom:top+h,width:w,height:h,x:left,y:top,toJSON(){}};});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function render(paused=false){await act(async()=>root.render(<Harness paused={paused}/>));}
it('is decorative and stops its only pending frame for dialogs, hidden pages, offscreen and unmount',async()=>{
 await render();const canvas=host.querySelector('canvas')!;expect(canvas.getAttribute('aria-hidden')).toBe('true');expect(canvas.style.pointerEvents).toBe('none');expect(canvas.style.userSelect).toBe('none');expect(canvas.hidden).toBe(false);expect(frames.size).toBe(1);
 await render(true);expect(frames.size).toBe(0);await render(false);expect(frames.size).toBe(1);
 intersection?.([{isIntersecting:false}]);expect(frames.size).toBe(0);intersection?.([{isIntersecting:true}]);expect(frames.size).toBe(1);
 vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));expect(frames.size).toBe(0);
});
it('draws one static image for reduced motion and responds to preference changes',async()=>{
 reduced=true;await render();expect(frames.size).toBe(0);expect(context.fillText).toHaveBeenCalled();reduced=false;visibility?.();expect(frames.size).toBe(1);reduced=true;visibility?.();expect(frames.size).toBe(0);
});
it('does not obtain a drawing context or animate below the gutter threshold and recovers on resize',async()=>{
 width=1024;await render();expect(host.querySelector('canvas')!.hidden).toBe(true);expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();expect(frames.size).toBe(0);width=1440;resize?.();expect(host.querySelector('canvas')!.hidden).toBe(false);expect(frames.size).toBe(1);
});
it('does not call network, storage or produce a real selection and is removed when leaving home',async()=>{
 const fetch=vi.spyOn(window,'fetch');const storage=vi.spyOn(Storage.prototype,'setItem');await render();expect(fetch).not.toHaveBeenCalled();expect(storage).not.toHaveBeenCalled();expect(window.getSelection()?.toString()).toBe('');await act(async()=>root.render(<main className="reader-column"/>));expect(host.querySelector('canvas')).toBeNull();expect(frames.size).toBe(0);
});

it('starts when initialization finishes even when the surface dimensions do not change',async()=>{
 await act(async()=>root.render(<Harness enabled={false}/>));expect(frames.size).toBe(0);expect(host.querySelector('canvas')!.hidden).toBe(true);
 await act(async()=>root.render(<Harness enabled/>));expect(frames.size).toBe(1);expect(host.querySelector('canvas')!.hidden).toBe(false);
});
it('limits drawing to about 30fps while retaining only one pending animation callback',async()=>{
 await render();const initial=context.fillText.mock.calls.length,now=performance.now();
 function step(at:number){const [id,callback]=frames.entries().next().value!;frames.delete(id);callback(at);}
 step(now+1);const first=context.fillText.mock.calls.length;expect(first).toBeGreaterThan(initial);step(now+10);expect(context.fillText.mock.calls.length).toBe(first);step(now+36);expect(context.fillText.mock.calls.length).toBeGreaterThan(first);expect(frames.size).toBe(1);
});

it('resets the selection clock together with motion time after toggling reduced motion',async()=>{
 await render();let now=performance.now();
 function advance(count:number){for(let i=0;i<count;i++){const [id,callback]=frames.entries().next().value!;frames.delete(id);now+=40;callback(now);}}
 advance(180);reduced=true;visibility?.();reduced=false;visibility?.();context.fillRect.mockClear();
 advance(45);expect(context.fillRect).toHaveBeenCalled();
});
