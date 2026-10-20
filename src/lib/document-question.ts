import type { Anchor, DocumentSnapshot } from '../types';
export const DOCUMENT_CONTEXT_LIMIT = 16_000;
export interface DocumentSection { label: string; text: string }
export function documentAnchor(document: DocumentSnapshot): Anchor {
  return { scope:'document',textVersion:2,documentId:document.id,blockId:'document',headingPath:[],quote:'全文',prefix:'',suffix:'',start:0,end:0,matchStatus:'matched' };
}
export function markdownSections(article: HTMLElement | null): DocumentSection[] {
  if (!article) return [];
  let label = '开头';
  return [...article.children].flatMap(node => {
    if (/^H[1-6]$/.test(node.tagName)) label = node.textContent?.trim() || label;
    const text = (node.textContent ?? '').trim();
    return text ? [{label,text}] : [];
  });
}
export function documentQuestionContext(sections: DocumentSection[], question: string, notice = '', budget?: { fits: (context:string)=>boolean }) {
  const fits = (context:string) => context.length <= DOCUMENT_CONTEXT_LIMIT && (!budget || budget.fits(context));
  const usable = sections.filter(s => s.text.trim());
  if (!usable.length) throw new Error('本文没有可供提问的文字，请选择具体内容或换一份文档。');
  const full = usable.map(s => `【${s.label}】\n${s.text}`).join('\n\n');
  const fullPrefix = `参考范围：完整可用文字。${notice}\n`;
  if (fits(fullPrefix + full)) return { context: fullPrefix + full, notice };
  const tokens = (question.toLowerCase().match(/[a-z0-9][a-z0-9.-]+|[\u3400-\u9fff]+/g) ?? []).flatMap(t => /[\u3400-\u9fff]/.test(t) ? Array.from({length:Math.max(0,t.length-1)},(_,i)=>t.slice(i,i+2)) : [t]);
  const terms = [...new Set(tokens)].filter(t => !['什么','怎么','哪些','这个','那个','文章','全文','是否','可以'].includes(t)).slice(0,64);
  const chunkSize = budget ? 400 : 1200;
  // Hosted windows overlap so a term crossing a chunk boundary still gets ranked.
  const step = budget ? 320 : chunkSize;
  const chunks = usable.flatMap(section => Array.from({length:Math.ceil(section.text.length/step)},(_,i)=>({label:budget ? section.label.slice(0,80) : section.label,text:section.text.slice(i*step,i*step+chunkSize)})));
  const outline = [...new Set(usable.map(s=>s.label))].join(' / ').slice(0,budget ? 180 : 1200);
  const prefix = `参考范围：长文相关片段，并非全文覆盖。${notice}\n文章结构：${outline}\n`;
  const ranked = chunks.map((s,index)=>({index,score:terms.reduce((sum,t)=>sum+(s.text.toLowerCase().includes(t)?1:0)+(s.label.toLowerCase().includes(t)?2:0),0)})).sort((a,b)=>b.score-a.score||a.index-b.index);
  const selected = new Set<number>(); let remaining = DOCUMENT_CONTEXT_LIMIT - prefix.length;
  const candidates = budget ? [...ranked.map(r=>r.index),0,1] : [...[0,1].filter(i=>i<chunks.length),...ranked.map(r=>r.index)];
  const render = (indices:Set<number>, replacement?:{index:number;text:string}) => prefix + [...indices].sort((a,b)=>a-b).map(i=>`【${chunks[i].label}】\n${replacement?.index===i ? replacement.text : chunks[i].text}`).join('\n\n');
  for (const index of candidates) {
    if (index >= chunks.length) continue;
    if (selected.has(index)) continue;
    const s=chunks[index], size=s.text.length+s.label.length+6;
    if (!budget && size>remaining) continue;
    if (budget && !fits(render(new Set([...selected,index])))) {
      // History can leave room for a definition but not an entire window. Shrink
      // only this contextual excerpt around the matching term, never user fields.
      const lower=s.text.toLowerCase(), term=terms.find(t=>lower.includes(t)), hit=term ? lower.indexOf(term) : 0;
      const excerpt=(length:number)=>{
        const start=Math.max(0,Math.min(s.text.length-length,hit-Math.floor(length/3)));
        return `${start ? '…' : ''}${s.text.slice(start,start+length)}${start+length<s.text.length ? '…' : ''}`;
      };
      let low=Math.min(s.text.length,Math.max(48,term?.length ?? 0)),high=s.text.length-1,best='';
      while(low<=high){
        const mid=Math.floor((low+high)/2),text=excerpt(mid);
        if(fits(render(new Set([...selected,index]),{index,text}))){best=text;low=mid+1;}else high=mid-1;
      }
      if(!best)continue;
      chunks[index]={...s,text:best};
    }
    selected.add(index); remaining-=size;
  }
  if (budget && !selected.size) throw new Error('问题或追问历史较长，已没有足够空间提供相关原文，请缩短问题或新建提问。');
  const context = render(selected);
  return {context:context.slice(0,DOCUMENT_CONTEXT_LIMIT),notice:['基于文章结构与相关片段作答。',notice].filter(Boolean).join(' ')};
}
