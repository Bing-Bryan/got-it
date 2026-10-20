import {expect,it,vi} from 'vitest';
vi.mock('./runtime-mode',()=>({HOSTED:true,trialId:()=> '123e4567-e89b-42d3-a456-426614174000',hostedGeneration:async()=>'11111111-1111-4111-8111-111111111111',clearHostedGeneration:()=>{}}));
import type {InquiryRequest} from '../types';
import {hostedDocumentQuestionContext} from './hosted-document-question';
import {documentQuestionContext} from './document-question';
import {readInquiryStream} from './inquiry-stream';
import {hostedPrompt,parseHostedInquiry} from '../../server/hosted-model';
import {MAX_INPUT_TOKENS} from '../../server/hosted-budget';

const request = (extra:Partial<InquiryRequest>={}):InquiryRequest => ({requestId:'doc-budget',providerId:'deepseek',intent:'ask',readingScope:'document',quote:'全文',context:'',documentTitle:'PRIVATE_FILENAME.md',question:'scion是啥女',history:[],...extra});
const cases = [
  ['short English','Scion is the incremental build planner for this repository.'],
  ['long English','Ordinary repository background and deployment notes. '.repeat(500)+'\nScion is the incremental build planner for this repository.'],
  ['long Chinese','普通背景说明与构建历史。'.repeat(2500)+'\nScion 是本文构建图的增量规划工具。'],
  ['escaped JSON','"quoted" \\ path <tag>\n'.repeat(1500)+'\nScion is the incremental build planner.'],
] as const;

it.each(cases)('fits the actual hosted transport and parser for %s, retaining the late question term',async(_name,text)=>{
  const original=request({history:[{role:'user',content:'前面提到的 "tool" <保持原样> \\ 是哪个？'},{role:'assistant',content:'前轮背景，仅供理解代词。'}]});
  const sections=[{label:'Growing our monorepo',text}];
  const prepared=hostedDocumentQuestionContext(sections,original);
  expect(prepared.context.toLowerCase()).toContain('scion');
  if(text.length>16000)expect(prepared.notice).toContain('相关片段');
  const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{
    const wire=JSON.parse(String(init?.body));
    expect(wire.question).toBe(original.question);expect(wire.quote).toBe(original.quote);expect(wire.history).toEqual(original.history);
    expect(JSON.stringify(wire)).not.toContain('PRIVATE_FILENAME');
    const parsed=parseHostedInquiry(wire);
    // Independent byte measurement over the actual server-built model prompt.
    expect(Buffer.byteLength(hostedPrompt(parsed),'utf8')+128).toBeLessThanOrEqual(MAX_INPUT_TOKENS);
    return new Response(JSON.stringify({requestId:original.requestId,sequence:1,type:'complete',response:{answer:'controlled fixture',sources:[]}})+'\n');
  });
  await readInquiryStream({...original,context:prepared.context},vi.fn(),undefined,fetcher);
  expect(fetcher).toHaveBeenCalledOnce();
  if(text.length<100)expect(prepared.context).toContain(text);
});

it.each([
  {question:'超长问题'.repeat(2500)},
  {history:[{role:'assistant' as const,content:'超长追问历史'.repeat(2500)}]},
  {quote:'完整原始选区'.repeat(2500)},
])('rejects oversized fixed materials before any transport or model call',async(extra)=>{
  const original=request(extra),snapshot=structuredClone(original),fetcher=vi.fn();
  const attempt=async()=>{
    const prepared=hostedDocumentQuestionContext([{label:'文章',text:'Scion is a build planner.'}],original);
    await readInquiryStream({...original,context:prepared.context},vi.fn(),undefined,fetcher);
  };
  await expect(attempt()).rejects.toThrow('输入上限');
  expect(fetcher).not.toHaveBeenCalled();expect(original).toEqual(snapshot);
  expect(()=>parseHostedInquiry({requestId:original.requestId,intent:'ask',readingScope:'document',quote:original.quote,context:'',question:original.question,history:original.history})).toThrow(expect.objectContaining({code:'input_limit'}));
});

it('keeps the local 16000-character behavior while fitting hosted Chinese and escaping overhead',()=>{
  const sections=[{label:'结构',text:'中文引用"内容"与反斜线\\和<tag>。'.repeat(800)+'Scion 定义在文尾。'}];
  const local=documentQuestionContext(sections,'Scion');
  const hosted=hostedDocumentQuestionContext(sections,request());
  expect(local.context.length).toBeLessThanOrEqual(16000);expect(local.context.length).toBeGreaterThan(8000);
  expect(hosted.context.toLowerCase()).toContain('scion');expect(hosted.context.length).toBeLessThan(local.context.length);
});

it('retains a tail term across a window boundary without oversized labels consuming the context',()=>{
  const sections=[{label:'庞大文章标题'.repeat(600),text:'x'.repeat(24078)+'Scion means the incremental build planner.'}];
  const result=hostedDocumentQuestionContext(sections,request());
  expect(result.context).toContain('Scion means the incremental build planner.');
  const actual=parseHostedInquiry({requestId:'tail-window',intent:'ask',readingScope:'document',quote:'全文',context:result.context,question:'Scion 是什么？',history:[]});
  expect(Buffer.byteLength(hostedPrompt(actual),'utf8')+128).toBeLessThanOrEqual(MAX_INPUT_TOKENS);
});

it('uses a smaller relevant window when history leaves room for a definition but not a whole chunk',()=>{
  const original=request({question:'Scion 是什么？',history:[{role:'user',content:'中'.repeat(1450)}]});
  const text='中'.repeat(8000)+'Scion means a delegated AI assistant.'+'中'.repeat(764);
  const result=hostedDocumentQuestionContext([{label:'背景',text}],original);
  expect(result.context).toContain('Scion means a delegated AI assistant.');
  const parsed=parseHostedInquiry({requestId:original.requestId,intent:'ask',readingScope:'document',quote:original.quote,context:result.context,question:original.question,history:original.history});
  expect(parsed.history).toEqual(original.history);
  expect(Buffer.byteLength(hostedPrompt(parsed),'utf8')+128).toBeLessThanOrEqual(MAX_INPUT_TOKENS);
});
