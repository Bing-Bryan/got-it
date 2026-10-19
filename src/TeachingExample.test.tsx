import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readingPages,completeVerificationText,TeachingExample,TeachingVerification} from './TeachingExample';
import {homeReadingExamples} from './home-reading-examples';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.body.appendChild(document.createElement('div'));root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const saved=homeReadingExamples.find(example=>example.id==='verify')!;
const click=async(selector:string)=>act(async()=>host.querySelector<HTMLButtonElement>(selector)!.click());
it('preserves all answer characters across whole-sentence pages',()=>{
 for(const example of homeReadingExamples){const text=example.message.content;expect(readingPages(text).join('')).toBe(text);}
 expect(readingPages('第一句。\n\n第二句！第三句？Trailing text',6).join('')).toBe('第一句。\n\n第二句！第三句？Trailing text');
});
it('keeps the complete original answer and every detail reachable without mutating data or fetching',async()=>{
 const before=JSON.stringify(saved),fetchSpy=vi.spyOn(globalThis,'fetch');fetchSpy.mockClear();
 await act(async()=>root.render(<TeachingVerification message={saved.message}/>));
 await click('.teaching-process-toggle');let text='';
 do{ text+=host.querySelector('.teaching-verbatim')!.textContent;const next=host.querySelector<HTMLButtonElement>('[aria-label="完整回答下一页"]');if(!next||next.disabled)break;await act(async()=>next.click());}while(true);
 expect(text.replace(/\s+/g,'')).toBe(saved.message.content.replace(/\s+/g,''));
 expect(completeVerificationText(saved.message)).toContain(saved.message.content);
 await click('[data-detail=claims]');expect(host.querySelector('.teaching-verbatim')?.textContent).toContain(saved.message.verification!.claims[0].text);
 expect(JSON.stringify(saved)).toBe(before);expect(fetchSpy).not.toHaveBeenCalled();
});
it('uses source IDs and boundary controls for controlled multiple sources without changing the conclusion',async()=>{
 const sources=Array.from({length:3},(_,index)=>({...saved.message.sources![0],id:`source-${index+1}`}));const message={...saved.message,sources};
 await act(async()=>root.render(<TeachingVerification message={message}/>));const conclusion=host.querySelector('.verification-conclusion')?.textContent;
 expect(host.querySelector<HTMLButtonElement>('[aria-label="来源上一页"]')!.disabled).toBe(true);
 for(let i=0;i<sources.length;i++){
  expect(host.querySelector('.teaching-source-id')?.getAttribute('data-source-id')).toBe(sources[i].id);
  expect(host.querySelector('.teaching-pager [role=status]')?.textContent).toBe(`${i+1} / ${sources.length}`);
  expect(host.querySelector<HTMLAnchorElement>('.source-card-title a')?.href.split('#')[0]).toBe(sources[i].url.split('#')[0]);
  if(i<sources.length-1)await click('[aria-label="来源下一页"]');
 }
 expect(host.querySelector<HTMLButtonElement>('[aria-label="来源下一页"]')!.disabled).toBe(true);await click('.teaching-process-toggle');await click('.teaching-process-toggle');expect(host.querySelector('.verification-conclusion')?.textContent).toBe(conclusion);
 expect(host.querySelector('.teaching-source-id')?.getAttribute('data-source-id')).toBe(sources[0].id);
});
it('keeps failed and interrupted verification truthful even with an affirmative controlled summary',async()=>{
 for(const completion of ['complete','interrupted'] as const){
  const message={...saved.message,completion,search:{status:'failed' as const,completedSearches:0,failedSearches:1},verification:{...saved.message.verification!,verdict:'supported' as const,summary:'CONTROLLED SUCCESS'}};
  await act(async()=>root.render(<TeachingVerification key={completion} message={message}/>));expect(host.querySelector('.verification-conclusion')?.textContent).not.toContain('CONTROLLED SUCCESS');expect(host.querySelector('.verification-conclusion')?.textContent).toMatch(/失败|中断/);await click('.teaching-process-toggle');expect(host.querySelector('.teaching-state')?.textContent).toMatch(/失败|中断/);
 }
});
it('uses a static real highlight, no non-question heading, and resets presentation on feature changes',async()=>{
 await act(async()=>root.render(<TeachingExample key="verify" example={saved} prefix="how"/>));
 expect(host.querySelector('mark')?.classList.contains('is-emphasized')).toBe(true);expect(host.querySelector('mark')?.getAttribute('data-focus-stickies-highlight')).toBe('true');expect(host.querySelector('mark')?.hasAttribute('data-inquiry-id')).toBe(false);expect(host.querySelector('.start-real-note>h3')).toBeNull();
 await click('.teaching-process-toggle');await act(async()=>root.render(<TeachingExample key="ask" example={homeReadingExamples.find(example=>example.id==='ask')!} prefix="how"/>));await act(async()=>root.render(<TeachingExample key="verify" example={saved} prefix="how"/>));
 expect(host.querySelector('.teaching-process-toggle')?.getAttribute('aria-expanded')).toBe('false');expect(host.querySelector('.teaching-pane[data-active=true]')?.getAttribute('aria-label')).toBe('对应知识贴');
});
it('shows conclusion and source immediately and keeps focus when opening and returning from the optional process',async()=>{
 await act(async()=>root.render(<TeachingVerification message={saved.message}/>));
 expect(host.querySelector('[role=tablist]')).toBeNull();expect(host.querySelector('.verification-conclusion')).not.toBeNull();expect(host.querySelector('.source-reading-card')).not.toBeNull();
 const trigger=host.querySelector<HTMLButtonElement>('.teaching-process-toggle')!;trigger.focus();await act(async()=>trigger.click());expect(trigger.getAttribute('aria-expanded')).toBe('true');expect(document.activeElement).toBe(trigger);await act(async()=>trigger.click());expect(trigger.getAttribute('aria-expanded')).toBe('false');expect(document.activeElement).toBe(trigger);
});

it('keeps page position under unchanged slot measurements and remains complete after a real resize',async()=>{
 let height=340,notify=()=>{};vi.stubGlobal('innerWidth',390);
 vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){notify=callback;}observe(element:HTMLElement){Object.defineProperties(element,{clientWidth:{configurable:true,value:320},clientHeight:{configurable:true,get:()=>height}});}disconnect(){}});
 await act(async()=>root.render(<TeachingVerification message={saved.message}/>));await click('.teaching-process-toggle');
 const read=async()=>{let text='';do{text+=host.querySelector('.teaching-verbatim')!.textContent;const next=host.querySelector<HTMLButtonElement>('[aria-label="完整回答下一页"]');if(!next||next.disabled)break;await act(async()=>next.click());const position=host.querySelector('.teaching-pager [role=status]')?.textContent;await act(async()=>notify());expect(host.querySelector('.teaching-pager [role=status]')?.textContent).toBe(position);}while(true);return text;};
 expect((await read()).replace(/\s+/g,'')).toBe(saved.message.content.replace(/\s+/g,''));height=260;await act(async()=>notify());expect((await read()).replace(/\s+/g,'')).toBe(saved.message.content.replace(/\s+/g,''));
});
it('keeps each complete claim with its verdict and source IDs on the same page',async()=>{
 await act(async()=>root.render(<TeachingVerification message={saved.message}/>));await click('.teaching-process-toggle');await click('[data-detail=claims]');
 for(let index=0;index<saved.message.verification!.claims.length;index++){
  const claim=saved.message.verification!.claims[index];expect(host.querySelector('.teaching-claim')?.textContent).toBe(claim.text);expect(host.querySelector('.teaching-claim-verdict')?.textContent).toBeTruthy();expect(host.querySelector('.teaching-claim-sources')?.textContent).toContain(claim.sourceIds.join('、'));
  if(index<saved.message.verification!.claims.length-1)await click('[aria-label="逐项依据下一页"]');
 }
 expect(host.querySelector<HTMLButtonElement>('[aria-label="逐项依据下一页"]')?.disabled).toBe(true);
});
it('shows insufficient evidence immediately without presenting an unread excerpt as checked',async()=>{
 const message={...saved.message,content:'范围不一致，证据不足。',verification:{...saved.message.verification!,verdict:'insufficient' as const,summary:'范围不一致，证据不足。',reason:'未读到匹配的正文。',readingAdvice:'保留范围限制。'},sources:[{...saved.message.sources![0],retrievalStatus:'not-read' as const,excerptKind:'unverified' as const,excerpt:'',snippet:''}]};
 await act(async()=>root.render(<TeachingVerification message={message}/>));expect(host.querySelector('.verification-conclusion')?.textContent).toContain('证据不足');expect(host.querySelector('.source-reading-card')).not.toBeNull();expect(host.querySelector('.excerpt-label.verified')).toBeNull();
});
it('keeps the real partial scope visible beside the matched excerpt in the default overview',async()=>{
 await act(async()=>root.render(<TeachingVerification message={saved.message}/>));
 const overview=host.querySelector('[aria-label="查证概览"]')!;
 expect(overview.querySelector('.verification-limitation')).not.toBeNull();
 for(const source of saved.message.sources!)if(source.scope)expect(overview.textContent).toContain(source.scope);
 expect(overview.querySelector('.source-reading-card blockquote')?.textContent).toBe(saved.message.sources![0].excerpt);
 expect(host.querySelector('.teaching-process-toggle')?.getAttribute('aria-expanded')).toBe('false');
});
