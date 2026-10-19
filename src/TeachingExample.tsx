import {useMemo,useState,useRef,useLayoutEffect,type ReactNode} from 'react';
import {AssistantMessage} from './AssistantMessage';
import {SourceCard} from './SourceCard';
import {verificationBrief,VerificationSummary} from './VerificationAnswer';
import type {HomeReadingExample} from './home-reading-examples';
import type {ThreadMessage} from './types';
import {VERDICT_LABELS} from './lib/verification';

/** Keep every character and split only at sentence boundaries, never truncate an answer. */
export function readingPages(text:string,limit=130):string[]{
 const sentences=text.match(/[^。！？]*[。！？]+|[^。！？]+$/g)??[''];const pages:string[]=[];
 for(const sentence of sentences){if(pages.length&&pages.at(-1)!.length+sentence.length<=limit)pages[pages.length-1]+=sentence;else pages.push(sentence);}
 return pages.length?pages:[''];
}
export function exampleTitle(example:HomeReadingExample){if(example.id!=='ask'||!example.question)return example.title;const end=example.question.indexOf('？');return end<0?example.question:example.question.slice(0,end+1);}
function Pager({index,total,onChange,label}:{index:number;total:number;onChange:(index:number)=>void;label:string}){return <nav className="teaching-pager" aria-label={label}><button type="button" disabled={index===0} onClick={()=>onChange(index-1)} aria-label={`${label}上一页`}>上一页</button><span role="status">{index+1} / {total}</span><button type="button" disabled={index===total-1} onClick={()=>onChange(index+1)} aria-label={`${label}下一页`}>下一页</button></nav>;}
function TextPages({text,label,render}:{text:string;label:string;render?:(text:string)=>ReactNode}){
 const ref=useRef<HTMLDivElement>(null),[limit,setLimit]=useState(()=>window.innerWidth<=760?180:500),[page,setPage]=useState(0);
 useLayoutEffect(()=>{const element=ref.current;if(!element||typeof ResizeObserver==='undefined')return;const measure=()=>{if(window.innerHeight<=480){setLimit(Number.MAX_SAFE_INTEGER);return;}const style=getComputedStyle(element),font=parseFloat(style.fontSize)||14,line=parseFloat(style.lineHeight)||font*1.8;const capacity=Math.floor(element.clientWidth/font)*Math.floor(Math.max(0,element.clientHeight-48)/line)*.85;if(capacity>0)setLimit(Math.max(100,Math.min(window.innerWidth<=760?200:550,Math.floor(capacity))));};const observer=new ResizeObserver(measure);observer.observe(element);measure();return()=>observer.disconnect();},[]);
 const pages=useMemo(()=>readingPages(text,limit),[text,limit]),current=Math.min(page,pages.length-1);useLayoutEffect(()=>setPage(0),[text,limit]);
 return <div ref={ref} className="teaching-pages"><div className="teaching-page-scroll" tabIndex={0} aria-label={label}>{render?render(pages[current]):<p className="teaching-verbatim">{pages[current].trimStart()}</p>}</div>{pages.length>1?<Pager index={current} total={pages.length} onChange={setPage} label={label}/>:null}</div>;
}
export function completeVerificationText(message:ThreadMessage,limitation=''){
 const normalize=(text:string)=>text.replace(/[\s。！？；]+/g,'');const parts=[message.content];for(const text of [message.verification?.summary,message.verification?.reason,message.verification?.readingAdvice,limitation])if(text&&!normalize(parts.join(' ')).includes(normalize(text)))parts.push(text);return parts.filter(Boolean).join('\n\n');
}
export function TeachingVerification({message,failure}:{message:ThreadMessage;failure?:string}){
 const [process,setProcess]=useState(false),[source,setSource]=useState(0),[detail,setDetail]=useState('answer'),[claim,setClaim]=useState(0);
 const brief=verificationBrief(message,failure),v=message.verification,sources=message.sources??[];
 const detailText=completeVerificationText(message,brief.limitation),claims=v?.claims??[];
 function toggleProcess(){setProcess(value=>!value);setSource(0);setDetail('answer');setClaim(0);}
 return <div className="teaching-verification" data-message-id={message.id}>
 <div id="teaching-verification-page" className="teaching-verification-page" role="region" aria-label={process?'完整核对过程':'查证概览'}>
 {process?<>{!brief.complete?<p className="teaching-state" role="status">{brief.conclusion}</p>:null}<div className="teaching-detail-picker" role="group" aria-label="依据内容"><button type="button" aria-pressed={detail==='answer'} data-detail="answer" onClick={()=>setDetail('answer')}>完整回答</button>{claims.length?<button type="button" aria-pressed={detail==='claims'} data-detail="claims" onClick={()=>{setDetail('claims');setClaim(0);}}>逐项依据</button>:null}</div>{detail==='answer'?<TextPages key="answer" label="完整回答" text={detailText}/>:<><div className="teaching-page-scroll" tabIndex={0} aria-label="当前逐项依据"><p className="teaching-verbatim teaching-claim">{claims[claim].text}</p><p className="teaching-claim-verdict">{VERDICT_LABELS[claims[claim].verdict]}</p><p className="teaching-claim-sources">来源：{claims[claim].sourceIds.join('、')||'无'}</p></div><Pager index={claim} total={claims.length} onChange={setClaim} label="逐项依据"/></>}</>:<>
  <VerificationSummary conclusion={brief.conclusion} limitation={brief.limitation}/>
  <div className="teaching-page-scroll teaching-overview-source" tabIndex={0} aria-label="当前来源">{sources.length?<>{sources.length>1?<div className="teaching-source-id" data-source-id={sources[source].id} title={sources[source].id} aria-label={`来源 ${sources[source].id.replace(/^source-/,'')}（${sources[source].id}）`}>来源 {sources[source].id.replace(/^source-/,'')}</div>:null}<SourceCard key={sources[source].id} source={sources[source]}/></>:<p>没有保存的来源。</p>}</div>
  {sources.length>1?<Pager index={source} total={sources.length} onChange={setSource} label="来源"/>:null}
 </>}
 </div><button type="button" className="teaching-process-toggle" aria-expanded={process} aria-controls="teaching-verification-page" onClick={toggleProcess}>{process?'返回概览':'查看完整核对过程'}</button></div>;
}
export function TeachingExample({example,prefix}:{example:HomeReadingExample;prefix:string}){
 const [surface,setSurface]=useState('answer');return <div role="tabpanel" id={`${prefix}-demo`} aria-labelledby={`${prefix}-${example.id}`} className="teaching-example">
 <div className="teaching-surface-switch" role="group" aria-label="阅读区域"><button type="button" aria-pressed={surface==='source'} onClick={()=>setSurface('source')}>原文</button><button type="button" aria-pressed={surface==='answer'} onClick={()=>setSurface('answer')}>回答</button></div>
 <div className="start-compact-demo start-real-example"><article className="start-demo-source teaching-pane" data-active={surface==='source'}><div className="start-overline">原文选区</div><a className="start-article-source" href={example.articlePath} target="_blank" rel="noreferrer noopener">{example.articleTitle}</a><div className="teaching-source-scroll" tabIndex={0} aria-label="原文选区内容"><p>{example.before}<mark data-focus-stickies-highlight="true" className="focus-stickies-highlight is-emphasized">{example.quote}</mark>{example.after}</p></div></article>
 <aside className="start-demo-result teaching-pane" data-active={surface==='answer'} aria-label="对应知识贴"><div className="start-real-note">{example.id==='ask'?<div className="current-question"><small>我的问题</small><h2>{exampleTitle(example)}</h2></div>:null}{example.id==='verify'?<TeachingVerification message={example.message}/>:<div className="teaching-page-scroll" tabIndex={0} aria-label="回答内容"><AssistantMessage message={example.message}/></div>}</div></aside></div></div>;
}
