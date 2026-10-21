import {useEffect,useRef,type RefObject} from 'react';
import {buildFragments,edgeFade,edgeGeometry,fragmentY,selectionCandidate,selectionState,EDGE_EN,EDGE_ZH,EDGE_SIZE,type EdgeFragment,type EdgeGeometry,type EdgeRect} from './lib/start-edge-texture';

type Props={surfaceRef:RefObject<HTMLElement|null>;paused:boolean;enabled?:boolean};
export function StartEdgeTexture({surfaceRef,paused,enabled=true}:Props){
 const canvasRef=useRef<HTMLCanvasElement>(null),pausedRef=useRef(paused),scheduleRef=useRef<(()=>void)|null>(null);
 pausedRef.current=paused;
 useEffect(()=>{scheduleRef.current?.();},[paused]);
 useEffect(()=>{
  const surface=surfaceRef.current,canvas=canvasRef.current;
  if(canvas)canvas.hidden=true;
  if(!surface||!canvas||!enabled)return;
  const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let disposed=false,visible=true,fontsRequested=false,raf=0,last=0,lastDraw=0,time=0,nextPick=1.2,g:EdgeGeometry|null=null,ctx:CanvasRenderingContext2D|null=null,fragments:EdgeFragment[]=[],picks:{fragment:EdgeFragment;start:number}[]=[];
  let font='serif',ink='#272729',accent='#5058d4';
  function draw(){
   if(!g||!ctx)return;
   const context=ctx,geometry=g;
   context.clearRect(0,0,geometry.width,geometry.height);
   context.textAlign='center';context.textBaseline='middle';context.font=`400 ${EDGE_SIZE}px ${font}`;
   // Clip every drawing operation, including selection backgrounds and glyph overhang.
   context.save();context.beginPath();context.rect(0,geometry.headerBottom,geometry.leftEnd,geometry.height-geometry.headerBottom);context.rect(geometry.rightStart,geometry.headerBottom,geometry.width-geometry.rightStart,geometry.height-geometry.headerBottom);context.clip();
   for(const r of geometry.excluded)context.clearRect(r.left,r.top,r.width,r.bottom-r.top);
   for(const f of fragments){
    const y=fragmentY(f,media?.matches?0:time,geometry.height);
    if(y<geometry.headerBottom||y>geometry.height)continue;
    const pick=media?.matches?undefined:picks.find(p=>p.fragment===f),state=pick?selectionState(time-pick.start,f.chars.length):null;
    if(state&&state.upto>0){
     const end=state.upto>=f.chars.length?f.x1:f.chars[state.upto-1].x+f.chars[state.upto-1].width/2;
     context.fillStyle=accent;context.globalAlpha=.16*1.4*state.opacity*edgeFade((f.x0+end)/2,y,geometry);
     context.fillRect(f.x0-1.5,y-EDGE_SIZE*.75,end-f.x0+3,EDGE_SIZE*1.5);
    }
    for(let j=0;j<f.chars.length;j++){
     const c=f.chars[j],fade=edgeFade(c.x,y,geometry);if(fade<=0)continue;
     const wave=.5+.5*Math.sin(time*1.1-y*.018-c.x*.01+c.phase*.35),flick=.82+.18*Math.sin(time*2.3+c.phase);
     const alpha=.45*f.opacity*fade*(.35+.65*wave)*flick;
     context.fillStyle=state&&j<state.upto?accent:ink;
     context.globalAlpha=state&&j<state.upto?alpha+(Math.min(.85,(alpha+.25*fade)*1.5)-alpha)*state.opacity:alpha;
     context.fillText(c.text,c.x,y);
    }
   }
   // Clear excluded regions after drawing so partial glyphs/backgrounds cannot enter them.
   for(const r of geometry.excluded)context.clearRect(r.left,r.top,r.width,r.bottom-r.top);
   context.restore();context.globalAlpha=1;
  }
  function loop(now:number){
   raf=0;
   if(!lastDraw||now-lastDraw>=1000/30){
    time+=Math.min(.1,(now-last)/1000);last=now;lastDraw=now;
    picks=picks.filter(p=>selectionState(time-p.start,p.fragment.chars.length));
    if(g&&time>=nextPick){
     if(picks.length<2){const candidates=fragments.filter(f=>selectionCandidate(f,fragmentY(f,time,g!.height),g!)&&!picks.some(p=>p.fragment===f));if(candidates.length)picks.push({fragment:candidates[Math.floor(Math.random()*candidates.length)],start:time});}
     nextPick=time+1.8+Math.random()*2.2;
    }
    draw();
   }
   raf=requestAnimationFrame(loop);
  }
  function schedule(){
   cancelAnimationFrame(raf);raf=0;
   if(disposed)return;
   if(media?.matches){time=0;nextPick=1.2;picks=[];draw();}
   const running=!!g&&!pausedRef.current&&!document.hidden&&visible&&!media?.matches;
   canvas!.dataset.animating=String(running);
   if(running){last=performance.now();lastDraw=0;raf=requestAnimationFrame(loop);}
  }
  function measure(){
   if(disposed)return;
   const bounds=surface!.getBoundingClientRect(),cards=surface!.querySelectorAll<HTMLElement>('.start-feature-card'),shell=surface!.querySelector<HTMLElement>('.start-shell'),header=surface!.querySelector<HTMLElement>('.start-header');
   function rect(element:Element):EdgeRect{const r=element.getBoundingClientRect();return {left:r.left-bounds.left, right:r.right-bounds.left,top:r.top-bounds.top+surface!.scrollTop,bottom:r.bottom-bounds.top+surface!.scrollTop,width:r.width};}
   const width=surface!.clientWidth,height=Math.max(surface!.clientHeight,shell?.scrollHeight??0),exclusions=[...surface!.querySelectorAll('.start-title,.start-intro,.start-imports,.start-resume,.start-sample-prompt,.start-feature:nth-child(2)')].map(rect);
   g=cards.length===3?edgeGeometry(width,height,rect(cards[0]),rect(cards[2]),header?rect(header).bottom:76,exclusions):null;
   canvas!.hidden=!g;
   if(g){
    ctx??=canvas!.getContext('2d');if(!ctx){g=null;canvas!.hidden=true;schedule();return;}
    const style=getComputedStyle(surface!);font=style.getPropertyValue('--reading-font').trim()||'serif';ink=style.getPropertyValue('--ink').trim()||ink;accent=style.getPropertyValue('--accent').trim()||accent;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    canvas!.width=Math.round(width*dpr);canvas!.height=Math.round(height*dpr);canvas!.style.width=`${width}px`;canvas!.style.height=`${height}px`;ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.font=`400 ${EDGE_SIZE}px ${font}`;
    fragments=buildFragments(g,text=>ctx!.measureText(text).width);picks=[];draw();
    if(!fontsRequested){
     fontsRequested=true;
     // Existing self-hosted faces only; narrow layouts never request decorative glyphs.
     document.fonts?.load(`400 ${EDGE_SIZE}px "Noto Serif SC Variable"`,EDGE_ZH.join('')).catch(()=>{});
     document.fonts?.load(`400 ${EDGE_SIZE}px "Source Serif 4 Variable"`,EDGE_EN.join('')).catch(()=>{});
    }
   }else if(ctx)ctx.clearRect(0,0,canvas!.width,canvas!.height);
   schedule();
  }
  scheduleRef.current=schedule;
  const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
  for(const element of [surface,surface.querySelector('.start-shell'),surface.querySelector('.start-feature-grid')])if(element)resize?.observe(element);
  const intersection=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;schedule();});intersection?.observe(surface);
  document.addEventListener('visibilitychange',schedule);window.addEventListener('resize',measure);media?.addEventListener('change',schedule);
  document.fonts?.addEventListener('loadingdone',measure);
  // Re-read --ink/--accent when the appearance switches; canvas text does not follow CSS on its own.
  const scheme=typeof MutationObserver==='undefined'?null:new MutationObserver(measure);scheme?.observe(document.documentElement,{attributes:true,attributeFilter:['data-color-scheme']});
  measure();
  return ()=>{disposed=true;scheduleRef.current=null;cancelAnimationFrame(raf);resize?.disconnect();scheme?.disconnect();intersection?.disconnect();document.removeEventListener('visibilitychange',schedule);window.removeEventListener('resize',measure);media?.removeEventListener('change',schedule);document.fonts?.removeEventListener('loadingdone',measure);};
 },[surfaceRef,enabled]);
 return <canvas ref={canvasRef} className="start-edge-texture" aria-hidden="true" hidden style={{pointerEvents:'none',userSelect:'none'}}/>;
}
