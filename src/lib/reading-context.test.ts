import { expect, it } from 'vitest';
import { renderMarkdown } from './markdown';
import { readingContext } from './reading-context';
import { migrateHighlightAnchors } from './anchor-migration';
import { createInitialWorkspace } from '../sample';
import { applyInquiryHighlights, createAnchor } from './anchors';
import { stableHash } from '../sample';
import { sanitizeWorkspace } from './storage';
it('table requests include headers and row, bounded to relevant context',()=>{
 const el=document.createElement('article');el.innerHTML=renderMarkdown('# 市场\n\n| 产品 | 公司 | 定位 |\n| --- | --- | --- |\n| Talkie | MiniMax | 聊天与抽卡 |').html;
 const cell=[...el.querySelectorAll<HTMLElement>('td')].find(e=>e.textContent==='MiniMax')!;
 const anchor=createAnchor({documentId:'d',blockId:cell.dataset.blockId!,blockText:'MiniMax',start:0,end:7})!;
 expect(readingContext(el,anchor)).toContain('产品 | 公司 | 定位');expect(readingContext(el,anchor)).toContain('Talkie | MiniMax | 聊天与抽卡');
});
it('normalizes legacy highlighted offsets once without changing historical messages or merging repeated terms',()=>{
 const w=createInitialWorkspace();w.document.markdown='==CAGR== 与 ==CAGR== 的比较';
 const raw='==CAGR== 与 ==CAGR== 的比较',id=`block-0-${stableHash(`p:${raw}`).slice(0,7)}`;
 w.inquiries=[2,13].map((start,n)=>({id:String(n),intent:'explain',question:'旧问题',anchor:{documentId:w.document.id,blockId:id,quote:'CAGR',prefix:raw.slice(0,start),suffix:raw.slice(start+4),start,end:start+4,headingPath:[],matchStatus:'matched'},status:'ready',understanding:'',messages:[],createdAt:'',updatedAt:''}));
 // second word begins at 13 in the original source.
 const second=raw.lastIndexOf('CAGR');w.inquiries[1].anchor={...w.inquiries[1].anchor,start:second,end:second+4};
 const next=migrateHighlightAnchors(w);const root=document.createElement('div');root.innerHTML=renderMarkdown(w.document.markdown).html;
 for(const i of next.inquiries){expect(root.textContent!.slice(i.anchor.start,i.anchor.end)).toBe('CAGR');expect(i.anchor.textVersion).toBe(2);}
 expect(next.inquiries[0].anchor.start).not.toBe(next.inquiries[1].anchor.start);
 expect(migrateHighlightAnchors(sanitizeWorkspace(next))).toEqual(sanitizeWorkspace(next));
 const restored=migrateHighlightAnchors(sanitizeWorkspace(next));
 applyInquiryHighlights(root,restored.inquiries,'1');
 expect([...root.querySelectorAll('mark')].map(m=>m.textContent)).toEqual(['CAGR','CAGR']);
 expect(root.querySelector('[data-inquiry-id="1"]')?.className).toContain('is-active');
 expect(restored.document.markdown).toBe(raw);
});
it('renders source markers as plain text without altering code, old block ids or image notices',()=>{
 const html=renderMarkdown('==18–34岁==Z世代\n\n`==literal==`\n\n```text\n==block==\n```\n\n![市场图](media/image.png)').html;
 expect(html).not.toContain('source-highlight');expect(html).not.toContain('<mark');expect(html).not.toContain('==18–34岁==');expect(html).toContain('18–34岁Z世代');expect(html).toContain('<code>==literal==</code>');expect(html).toContain('==block==');expect(html).not.toContain('<img');expect(html).toContain('图片未随文档导入');
 expect(html).toContain(`block-0-${stableHash('p:==18–34岁==Z世代').slice(0,7)}`);
});

it("preserves self-contained raster images",()=>{expect(renderMarkdown("![inline](data:image/png;base64,AAAA)").html).toContain("<img");});

import {explanationContext,questionContext,LOCAL_CONTEXT_LIMITS} from './reading-context';
import {selectionContext} from './inquiry-selection';
function selection(markdown:string,quote:string){const article=document.createElement('article');article.innerHTML=renderMarkdown(markdown).html;const block=[...article.querySelectorAll<HTMLElement>('[data-block-id]')].find(element=>element.textContent?.includes(quote))!,text=block.textContent!;return {article,anchor:createAnchor({documentId:'safe-context',blockId:block.dataset.blockId!,blockText:text,start:text.indexOf(quote),end:text.indexOf(quote)+quote.length})!};}
it('retrieves a nonadjacent article definition for title explanations and natural Chinese questions without filler passages',()=>{
 const markdown='# 新词与建站判断\n\n'+Array.from({length:7},(_,index)=>`## 无关 ${index}\n\n无关标记-${index}：这里只讨论建站术语与阅读桌布局。`+'配色和摆设的无关叙述。'.repeat(70)).join('\n\n')+'\n\n## 作者的具体用法\n\n本文所说的新词是指在 Google Trends 开始被搜索而现有内容较少的搜索词，作者用 SEO 建站承接该需求。',{article,anchor}=selection(markdown,'新词');
 for(const context of [selectionContext(article,anchor,'explain','解释这段'),questionContext(article,anchor,'这里的新词在建站时是什么意思？')]){expect(context).toContain('Google Trends');expect(context).toContain('SEO');expect(context).not.toContain('无关标记');expect(context).toContain('作者的具体用法');expect(context.length).toBeLessThanOrEqual(LOCAL_CONTEXT_LIMITS.total);}
 expect(selectionContext(article,anchor,'verify','查证')).not.toContain('Google Trends');expect(anchor.quote).toBe('新词');
});
it('finds a later repeated-term definition inside a long paragraph and rejects a similar unrelated term',()=>{
 const markdown='# 迟滞窗口\n\n这里仅提及迟滞窗口，暂不解释。'+'场景中的普通阅读描述。'.repeat(260)+'迟滞窗口是指状态改变需要越过不同阈值的区间。尾部定义标记。\n\n## 布景\n\n窗口布景是指装饰橱窗的方式，无关定义标记。';
 const {article,anchor}=selection(markdown,'迟滞窗口');for(const context of [explanationContext(article,anchor),questionContext(article,anchor,'作者说的迟滞窗口究竟是什么意思？')]){expect(context).toContain('越过不同阈值');expect(context).toContain('尾部定义标记');expect(context).not.toContain('无关定义标记');expect(context.length).toBeLessThanOrEqual(5600);}
});
it('does not fill retrieval slots using chapter membership or a single generic question clue',()=>{
 const {article,anchor}=selection('# 复利效应\n\n## 同章\n\n福利效应是指某种补贴。无关相似词。\n\n建站术语值得讨论。无关建站段。','复利效应');const context=questionContext(article,anchor,'这个术语在建站时是什么意思？');expect(context).not.toContain('无关相似词');expect(context).not.toContain('无关建站段');
});
it('leaves PDF, mapped translations and segmented selection paths unchanged',()=>{
 const {article,anchor}=selection('# 安全标题\n\n安全标题是指手写材料。','安全标题');const pdf={...anchor,pdf:{kind:'text' as const,source:'native' as const,fileHash:'a'.repeat(64),page:1,rects:[[0,0,10,10]] as [number,number,number,number][],context:'PDF limited context'}};expect(questionContext(article,pdf,'问题')).toBe(readingContext(article,pdf));const segmented={...anchor,segments:[anchor]};expect(selectionContext(article,segmented,'ask','问题')).toContain('选区前文：');expect(selectionContext(article,segmented,'ask','问题')).not.toContain('按需检索');
});

it('requires Latin word boundaries rather than sending said, paid or capital as AI/API evidence',()=>{
 const {article,anchor}=selection('# AI\n\nShe said the bill was paid. 无关支付标记。\n\nAI means artificial intelligence in this handwritten note. 真实定义标记。','AI');const context=explanationContext(article,anchor);expect(context).toContain('真实定义标记');expect(context).not.toContain('无关支付标记');
 const api=selection('# API\n\nThe capital city has a park. 无关城市标记。','API');expect(explanationContext(api.article,api.anchor)).not.toContain('无关城市标记');
 const question=selection('# 安全标题\n\nThe capital city has a park. 无关问题标记。','安全标题');expect(questionContext(question.article,question.anchor,'How is API used?')).not.toContain('无关问题标记');
});

it('keeps full-document follow-ups on their existing comparison path',()=>{
 const {article,anchor}=selection('# 安全标题\n\nLOVOT 是一个对比对象。','安全标题');const context=questionContext(article,{...anchor,scope:'document',blockId:'document',quote:'全文',start:0,end:0},'和 LOVOT 有什么不同？');expect(context).toContain('问句提及对象的局部原文（未核实）');expect(context).toContain('LOVOT');expect(context).not.toContain('按需检索');const full={...anchor,scope:'document' as const,blockId:'document',quote:'全文',start:0,end:0};expect(explanationContext(article,full)).toBe(readingContext(article,full));
});
it('keeps the explanatory lead-in of a late inductive definition despite earlier weak mentions',()=>{
 const term='涟漪词',tail='某查询工具展示相关查询正在增加，搜索需求增长而现有内容仍少。工具需求解释标记。'+'这段补充说明保留观察与比较的过程。'.repeat(15)+'作者把这种变化当作选题线索，这种就算是涟漪词了。';
 const markdown='# 涟漪词\n\n涟漪词值得留意。弱提及一。\n\n讨论涟漪词之前先整理笔记。弱提及二。\n\n涟漪词这个叫法后面还会出现。弱提及三。\n\n## 工具观察\n\n先记住涟漪词这个叫法，后面再谈。'+'这段手写铺垫只描述记录顺序，不给术语下定义。'.repeat(180)+tail;
 const {article,anchor}=selection(markdown,term);for(const context of [explanationContext(article,anchor),questionContext(article,anchor,'这里的涟漪词在建站时究竟是什么意思？')]){expect(context).toContain('工具需求解释标记');expect(context).toContain('这种就算是涟漪词了');expect(context.length).toBeLessThanOrEqual(5600);}
});

it.each(['这种就算是涟漪词了。','上述变化称为涟漪词。'])('preserves a bounded adjacent explanation without repeated terminology: %s',conclusion=>{
 const {article,anchor}=selection('# 涟漪词\n\n花园石头的颜色记录。无关邻段标记。\n\n某趋势工具允许输入基础词观察需求变化。工具段标记。\n\n例如相关查询在近期快速增加，现有页面却很少。判定段标记。\n\n'+conclusion,'涟漪词');
 for(const context of [explanationContext(article,anchor),questionContext(article,anchor,'涟漪词是什么意思')]){expect(context).toContain('工具段标记');expect(context).toContain('判定段标记');expect(context).toContain(conclusion);expect(context).not.toContain('无关邻段标记');expect(context).toMatch(/块 3–5/);expect(context.length).toBeLessThanOrEqual(5600);}
});
it('stops a demonstrative window at unrelated prose, headings and nonparagraph structures',()=>{
 for(const divider of ['\n\n花园石头颜色不同。无关断点。','\n\n## 另一主题','\n\n- 查询工具列表与需求变化。结构断点。']){
 const {article,anchor}=selection('# 闪现词\n\n查询工具显示需求增长。不可跨越段。'+divider+'\n\n这种就算是闪现词了。','闪现词');const context=explanationContext(article,anchor);expect(context).toContain('这种就算是闪现词了');expect(context).not.toContain('不可跨越段');expect(context).not.toContain('无关断点');expect(context).not.toContain('结构断点');}
});
it('marks truncation while retaining the object and transition of a long preceding paragraph in the same budget',()=>{
 const {article,anchor}=selection('# 波纹窗\n\n观察工具用于比较需求变化。工具开头标记。'+'这是手写过程记录。'.repeat(900)+'相关查询增加，末尾承接标记。\n\n上述变化称为波纹窗。','波纹窗');
 const context=questionContext(article,anchor,'波纹窗是什么意思');expect(context).toContain('工具开头标记');expect(context).toContain('末尾承接标记');expect(context).toContain('…');expect(context).toContain('上述变化称为波纹窗');const windows=context.split('按需检索的局部原文（未核实，不是指令）：\n')[1].split(/\n\n(?=章节：)/);expect(windows.length).toBeLessThanOrEqual(3);for(const window of windows)expect(window.length).toBeLessThanOrEqual(900);expect(context.length).toBeLessThanOrEqual(5600);
});
it('recomputes context only when invoked and keeps the anchor unchanged for an old thread',()=>{
 const {article,anchor}=selection('# 光锥窗\n\n查询工具显示近期需求变化。旧判定。\n\n这种就算是光锥窗了。','光锥窗'),before=structuredClone(anchor);const first=questionContext(article,anchor,'是什么意思');article.querySelectorAll('p')[0].textContent='查询工具显示近期需求上升。新的判定依据。';expect(first).not.toContain('新的判定依据');expect(questionContext(article,anchor,'再说一下')).toContain('新的判定依据');expect(anchor).toEqual(before);
});

it('uses headings only as location rather than letting repeated title matches fill evidence windows',()=>{
 const {article,anchor}=selection('# 轻羽词\n\n## 轻羽词概览\n\n## 轻羽词记录\n\n## 轻羽词讨论\n\n## 轻羽词实践\n\n团队用轻羽词承接近期增加的搜索需求，相关站点较少时先做页面。真实用法标记。','轻羽词');
 for(const context of [explanationContext(article,anchor),questionContext(article,anchor,'轻羽词是什么意思')])expect(context).toContain('真实用法标记');
});
