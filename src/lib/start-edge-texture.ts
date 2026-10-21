// Decorative phrases are fixed; never derive these from a reader's library.
export const EDGE_ZH = ['年复合增长率','平均每年的增速','并不代表每一年','作者据此推断','市场将再扩大一倍','名义值还是实际值','扣除通胀后','原句只说','短期效果','未证明能长期','有依据吗','这个推断','站不站得住','过去五年','查找来源','解释一下','问一问'];
export const EDGE_EN = ['compound annual growth','CAGR ≈ 31%','source?','cited','not supported','partially supported','nominal vs. real','since 2019','the report claims','per year','evidence','why?','in the long run','short-term effect','explain','footnote 3'];
export const EDGE_SIZE = 7;
export const EDGE_ROW = 13;
export interface EdgeRect {left:number;top:number;right:number;bottom:number; width:number}
export interface EdgeGeometry {width:number;height:number;leftEnd:number;rightStart:number;headerBottom:number;excluded:EdgeRect[]}
const clamp = (n:number) => Math.max(0,Math.min(1,n));
export function edgeGeometry(width:number,height:number,left:EdgeRect,right:EdgeRect,headerBottom:number,excluded:EdgeRect[]=[]):EdgeGeometry|null {
 if(width<=0||height<=0||left.left<120||width-right.right<120)return null;
 return {width,height,leftEnd:left.left+left.width/5,rightStart:right.right-right.width/5,headerBottom,excluded};
}
export function edgeFactor(x:number,g:EdgeGeometry){return clamp(x<=g.width/2?1-x/g.leftEnd:1-(g.width-x)/(g.width-g.rightStart));}
export function edgeFade(x:number,y:number,g:EdgeGeometry){
 if(g.excluded.some(r=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom))return 0;
 return Math.pow(edgeFactor(x,g),.55)*Math.min(clamp((y-g.headerBottom)/110),clamp((g.height-y)/80));
}
export function selectionState(elapsed:number,length:number){
 if(elapsed<0||elapsed>=3.5)return null;
 return {upto:elapsed<.6?Math.ceil(elapsed/.6*length):length,opacity:elapsed<2.6?1:1-(elapsed-2.6)/.9};
}
export interface EdgeChar {text:string;x:number;width:number;phase:number}
export interface EdgeFragment {y:number;x0:number;x1:number;english:boolean;chars:EdgeChar[];opacity:number}
export function fragmentY(f:EdgeFragment,time:number,height:number){const span=height*2;return ((f.y-time*4+20)%span+span)%span-20;}
export function selectionCandidate(f:EdgeFragment,y:number,g:EdgeGeometry){return y>g.headerBottom+70&&y<g.height-120&&f.chars.length>=3&&edgeFactor((f.x0+f.x1)/2,g)>.35&&f.chars.every(c=>edgeFade(c.x,y,g)>0);}
export function seededRandom(seed=3){return ()=>{seed|=0;seed=(seed+0x6d2b79f5)|0;let x=Math.imul(seed^(seed>>>15),1|seed);x=(x+Math.imul(x^(x>>>7),61|x))^x;return ((x^(x>>>14))>>>0)/4294967296;};}
export function buildFragments(g:EdgeGeometry,measure:(text:string,english:boolean)=>number):EdgeFragment[]{
 const random=seededRandom(),fragments:EdgeFragment[]=[];
 for(const [start,end] of [[0,g.leftEnd],[g.rightStart,g.width]])for(let y=8;y<g.height*2;y+=EDGE_ROW){
  let x=start+4+random()*30;
  while(x<end-20){
   if(random()<.35){x+=14+random()*30;continue;}
   const english=random()<.45,phrases=english?EDGE_EN:EDGE_ZH,text=phrases[Math.floor(random()*phrases.length)],chars:EdgeChar[]=[];let cx=x;
   for(const char of text){const width=measure(char,english);chars.push({text:char,x:cx+width/2,width,phase:random()*6.28});cx+=width+(english?.2:.4);}
   if(cx>end-2)break;
   fragments.push({y,x0:x,x1:cx,english,chars,opacity:.6+random()*.4});x=cx+8+random()*16;
  }
 }
 return fragments;
}
