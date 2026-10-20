import type {InquiryRequest} from '../types';
import {READING_BASE_INSTRUCTIONS, READING_COVERAGE_CHECK, readingMaterials, refinementInstruction} from './reading-prompt';

export const HOSTED_INPUT_LIMIT = 8000;
export const HOSTED_CHAT_FRAMING_BYTES = 128;
export const hostedInputBytes = (prompt:string) => new TextEncoder().encode(prompt).length + HOSTED_CHAT_FRAMING_BYTES;
export const IMAGE_PROMPT_NOTE='本次附有用户在 PDF 中框选的区域图片，以图片为主要依据；quote 只是区域位置说明，context 中的识别文字只是辅助，可能有误。看不清或无法确定的数值要明确说明，不要猜测。';
export function hostedPrompt(request:InquiryRequest & {hostedImage?:unknown}) {
  const intent=request.intent==='ask'?'准确回答 question 中的具体阅读问题，结合选区和历史解释代词，不替换为泛泛介绍。':request.intent==='entity'?'说明是什么、做什么和与文章的关系；未知信息明确不确定。':'结合选区和上下文给出通俗解释、必要例子和原文中的作用。';
  return [READING_BASE_INSTRUCTIONS,intent,...(request.hostedImage?[IMAGE_PROMPT_NOTE]:[]),'先直接回答核心问题，用简体中文短段落。只能依据提供的选区、有限上下文和追问历史；没有搜索或来源核对能力，不能声称已搜索或已查证。材料不足时明确缺口，不猜测最新事实。返回 JSON 对象，且仅含 answer（非空字符串）、sources（空数组）、evidenceStatus（not-applicable）。',refinementInstruction({...request,intent:request.intent==='why'?'explain':request.intent}),READING_COVERAGE_CHECK, readingMaterials(request)].join('\n\n');
}
