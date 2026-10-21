/** Drag selections that stop inside a word grow to that word's edges before anchoring; they never shrink or cross blocks.
 * A selection lying wholly inside one word is a deliberate sub-word pick (one character, part of a name) and stays as is. */
type WordSegmenter={segment(input:string):Iterable<{segment:string;index:number;isWordLike?:boolean}>};
const EXCLUDED='code, pre, kbd, samp, td, th, math, .katex';
let cached:WordSegmenter|null|undefined;
function defaultSegmenter():WordSegmenter|null{
 if(cached!==undefined)return cached;
 const Segmenter=(Intl as unknown as {Segmenter?:new(locale:string,options:{granularity:'word'})=>WordSegmenter}).Segmenter;
 cached=Segmenter?new Segmenter('zh',{granularity:'word'}):null;
 return cached;
}
/** Word segment strictly containing `offset` inside one text node, or null when the offset already sits on an edge. */
function wordAround(text:string,offset:number,segmenter:WordSegmenter):{start:number;end:number}|null{
 if(offset<=0||offset>=text.length)return null;
 for(const part of segmenter.segment(text)){
  const end=part.index+part.segment.length;
  if(part.index<offset&&offset<end)return part.isWordLike===false?null:{start:part.index,end};
  if(part.index>=offset)break;
 }
 return null;
}
/** True when [start,end) lies within a single word-like segment, e.g. one character of 推导. */
function insideOneWord(text:string,start:number,end:number,segmenter:WordSegmenter):boolean{
 for(const part of segmenter.segment(text)){
  const partEnd=part.index+part.segment.length;
  if(part.index<=start&&end<=partEnd)return part.isWordLike!==false;
  if(part.index>start)break;
 }
 return false;
}
function snappable(node:Node,root:HTMLElement):node is Text{
 return node.nodeType===Node.TEXT_NODE&&root.contains(node)&&!node.parentElement?.closest(EXCLUDED);
}
export function snapRangeToWords(range:Range,root:HTMLElement,segmenter:WordSegmenter|null=defaultSegmenter()):Range|null{
 if(!segmenter||range.collapsed)return null;
 let start=range.startOffset,end=range.endOffset;
 const head=snappable(range.startContainer,root)?wordAround(range.startContainer.data,start,segmenter):null;
 const tail=snappable(range.endContainer,root)?wordAround(range.endContainer.data,end,segmenter):null;
 if(range.startContainer===range.endContainer&&snappable(range.startContainer,root)&&insideOneWord(range.startContainer.data,start,end,segmenter))return null;
 if(head)start=head.start;
 if(tail)end=tail.end;
 if(start===range.startOffset&&end===range.endOffset)return null;
 const snapped=range.cloneRange();snapped.setStart(range.startContainer,start);snapped.setEnd(range.endContainer,end);
 return snapped;
}
/** Replaces the live selection with its word-snapped range, keeping the drag direction; returns whether anything changed. */
export function snapSelectionToWords(selection:Selection,root:HTMLElement,segmenter?:WordSegmenter|null):boolean{
 if(selection.rangeCount!==1||selection.isCollapsed)return false;
 const range=selection.getRangeAt(0);
 const snapped=snapRangeToWords(range,root,segmenter===undefined?defaultSegmenter():segmenter);
 if(!snapped)return false;
 const backward=selection.anchorNode===range.endContainer&&selection.anchorOffset===range.endOffset&&!(selection.focusNode===range.endContainer&&selection.focusOffset===range.endOffset);
 if(backward)selection.setBaseAndExtent(snapped.endContainer,snapped.endOffset,snapped.startContainer,snapped.startOffset);
 else selection.setBaseAndExtent(snapped.startContainer,snapped.startOffset,snapped.endContainer,snapped.endOffset);
 return true;
}
