import {hostedTransportId} from './hosted-operation-id';
import {copySearch} from './evidence';
import type {SearchTrace} from '../types';
import {HOSTED,hostedGeneration,clearHostedGeneration,trialId} from './runtime-mode';
import {noteAnswerComplete,track} from './hosted-usage';
import {librarySession} from "./library-session";
import {HOSTED_IMAGE_MAX_BYTES} from './pdf-data';
import {imagePngTarget} from './image-actions';
import { requestDeadline } from "./request-deadline";
import type { InquiryEvent, InquiryRequest, InquiryResponse, ThreadMessage } from "../types";

export class InquiryStreamError extends Error {constructor(message:string,public search?:SearchTrace){super(message);}}
export const PROGRESS_LABELS = { accepted: "请求已接受，正在处理", "search-started": "正在搜索资料", "search-completed": "已收到搜索结果，正在整理", "checking-sources": "正在核对引用文字" };
function base64(bytes:Uint8Array){let out='';for(let i=0;i<bytes.length;i+=32768)out+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(out);}
async function hostedCrop(entryId:string,cropId:string):Promise<string>{
  // Loaded lazily: a static import would create a module cycle through the library client.
  const {libraryBinary}=await import('./library-client');
  const blob=await (await libraryBinary(`/entries/${entryId}/resources/${cropId}`)).blob();
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(bytes.length>HOSTED_IMAGE_MAX_BYTES)throw new Error('所选区域图片过大，请缩小范围后重新框选。');
  return base64(bytes);
}
async function hostedWebImage(entryId:string,revisionId:string,resourceId:string):Promise<string>{
  const {libraryBinary}=await import('./library-client');
  const blob=await (await libraryBinary(`/entries/${entryId}/web-resources/${revisionId}/${resourceId}`)).blob();
  let bitmap:ImageBitmap;
  try{bitmap=await createImageBitmap(blob);}catch{throw new Error('这张图片暂时无法读取，请刷新后重试。');}
  try{
    const target=imagePngTarget(bitmap.width,bitmap.height);
    if(!target)throw new Error('这张图片尺寸无效，暂时不能发送。');
    if(typeof document==='undefined')throw new Error('当前环境无法转换图片。');
    const canvas=document.createElement('canvas');canvas.width=target.width;canvas.height=target.height;
    const context=canvas.getContext('2d');if(!context)throw new Error('当前浏览器无法转换图片。');
    context.drawImage(bitmap,0,0,target.width,target.height);
    if(typeof canvas.toBlob!=='function')throw new Error('当前浏览器无法转换图片。');
    const png=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!png||png.size>HOSTED_IMAGE_MAX_BYTES)throw new Error('这张图片转换后仍然过大，暂时不能发送。');
    return base64(new Uint8Array(await png.arrayBuffer()));
  }finally{bitmap.close?.();}
}
export async function readInquiryStream(request: InquiryRequest, onEvent: (event: InquiryEvent) => void, signal?: AbortSignal, fetcher = fetch): Promise<void> {
  // Hosted requests carry the stored image itself; the server has no reading library.
  const hostedImage=HOSTED&&request.image?(request.image.kind==="web-media"?await hostedWebImage(request.image.entryId,request.image.revisionId,request.image.resourceId):await hostedCrop(request.image.entryId,request.image.cropId)):undefined;
  const hostedBody=HOSTED?{...(hostedImage?{image:{data:hostedImage,...(request.image?.kind==="web-media"?{kind:"web-image"}:{})}}:{}),requestId:request.requestId,intent:request.intent==='why'?'explain':request.intent,quote:request.quote,context:request.context,question:request.question,history:request.history?.slice(-8).map(m=>({role:m.role,content:m.content})),...(request.scope?{scope:request.scope}:{}),...(request.round?{round:request.round}:{}),...(request.parentMessageId?{parentMessageId:request.parentMessageId}:{}),...(request.readingScope?{readingScope:request.readingScope}:{}),...(request.explanationMode==='local'||request.explanationMode==='web'?{explanationMode:request.explanationMode}:{})}:undefined;
  const budget = requestDeadline(30_000, signal);
  const resumed = () => { try { budget.check(); } catch { /* abort settles the active read */ } };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", resumed);
  if (typeof window !== "undefined") window.addEventListener("pageshow", resumed);
  try {
  const generation=HOSTED?await hostedGeneration():undefined;
  const response = await budget.wait(fetcher(HOSTED?"/api/hosted/inquiry/stream":"/api/inquiries/stream", { method: "POST", headers: { "Content-Type": "application/json", ...(HOSTED?{"X-Trial-Id":trialId(),"X-Hosted-Operation-Id":hostedTransportId(request.requestId ?? ''),...(generation?{"X-Hosted-Generation":generation}:{})}:{}), ...(!HOSTED && request.image ? {"X-Got-It-Session":await budget.wait(librarySession())} : {}) }, body: JSON.stringify(hostedBody??request), signal: budget.signal }));
  if (!response.ok) {
    let detail = "";
    try { const body = await budget.wait(response.json()); if (typeof body.error === "string") detail = body.error.slice(0, 300); if (body.code === 'operation_stale' || body.code === 'upgrade_required') clearHostedGeneration(); throw Object.assign(new Error(detail || `请求失败（HTTP ${response.status}），请重试。`), {code: body.code, status: response.status}); } catch (error) { if (error instanceof Error && (error as {code?:string}).code) throw error; }
    throw new Error(detail || `请求失败（HTTP ${response.status}），请重试。`);
  }
  if (!response.body) throw new Error("响应没有内容，请重试。");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", sequence = 0, complete = false;
  const line = (input: string) => {
    if (!input.trim() || complete) return;
    const e = JSON.parse(input) as InquiryEvent;
    if (e.requestId !== request.requestId || !Number.isSafeInteger(e.sequence) || e.sequence <= sequence) return;
    budget.check();
    sequence = e.sequence;
    if (e.type === "progress" && e.progress === "accepted") {
      budget.reset(typeof e.deadlineAt === "number" && Number.isFinite(e.deadlineAt) ? e.deadlineAt + 1000 : Date.now() + (request.operation === "verify" || request.intent === "verify" ? 241_000 : 121_000));
    }
    if (e.type === "error") {
      const search=HOSTED?copySearch(e.response?.search):undefined;
      if(search?.status==='failed')track('search-failed');
      throw search?new InquiryStreamError(e.error||'请求中断，请重试。',search):new Error(e.error||'请求中断，请重试。');
    }
    if (!["answer-delta", "progress", "preliminary", "source-update", "complete"].includes(e.type)) return;
    if (e.type === "complete" && !e.response) throw new Error("完成事件缺少结果。");
    if (e.type === "answer-delta" && typeof e.delta !== "string") throw new Error("正文增量格式错误。");
    complete = e.type === "complete";
    if(e.progress==='search-completed')track('search-complete');
    if(e.type==='complete'){
      noteAnswerComplete(request.requestId);
      if(request.intent==='verify')track('verify-complete');
      if(e.response?.sources.some(source=>source.retrievalStatus==='matched'))track('source-check-complete');
      if(e.response?.sources.some(source=>source.retrievalStatus&&source.retrievalStatus!=='matched'))track('source-check-failed');
    }
    onEvent(e);
  };
  try {
    while (true) {
      const { done, value } = await budget.wait(reader.read());
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 512 * 1024) throw new Error("响应超过读取限制。");
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) { line(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
      if (complete) break;
      if (done) { if (buffer.trim()) line(buffer); break; }
    }
    if (!complete) throw new Error("连接已中断，本轮未完成；已收到的内容已保留。");
  } finally { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
  } catch (error) {
    if (budget.signal.aborted) throw budget.signal.reason;
    throw error;
  } finally {
    budget.dispose();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", resumed);
    if (typeof window !== "undefined") window.removeEventListener("pageshow", resumed);
  }
}
export function responseMessage(id: string, request: InquiryRequest, response: InquiryResponse, complete: boolean): ThreadMessage {
  return { id, role: "assistant", createdAt: new Date().toISOString(), content: response.answer, sources: response.sources, search: response.search,
    evidenceStatus: response.evidenceStatus, verification: response.verification, timings: response.timings,
    providerId: response.providerId, providerName: response.providerName, mode: response.mode, model: response.model, modelConfig: response.modelConfig ?? request.modelConfig,
    requestId: request.requestId, completion: complete ? "complete" : "provisional", operation: request.operation, explanationMode: request.explanationMode, scope: request.scope, round: request.round, parentMessageId: request.parentMessageId };
}
export function interruptMessage(message: ThreadMessage): ThreadMessage {
  if (message.completion !== "provisional" && message.verification?.completion !== "provisional") return message;
  return { ...message, completion: "interrupted", evidenceStatus: message.verification ? "partial" : message.evidenceStatus,
    verification: message.verification ? { ...message.verification, completion: "interrupted", verdict: "incomplete", summary: "本轮已中断，以下为尚未完成核对的结果。", readingAdvice: "不要把暂定结果当作确认结论；可重试本轮。" } : undefined };
}

export interface InquiryAdapter {read:typeof readInquiryStream}
export const inquiryAdapter:InquiryAdapter={read:readInquiryStream};
