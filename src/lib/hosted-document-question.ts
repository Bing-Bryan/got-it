import type {InquiryRequest} from '../types';
import {documentQuestionContext, type DocumentSection} from './document-question';
import {HOSTED_INPUT_LIMIT, hostedInputBytes, hostedPrompt} from './hosted-prompt';

/** Use the same materials and instructions the hosted parser will send to the model.
 * The hosted transport deliberately omits the private filename and previous result.
 * Only document context is selected; the user's question, quote and sent history stay intact.
 */
export function hostedDocumentQuestionContext(sections:DocumentSection[], request:InquiryRequest, notice='') {
  const wireRequest:InquiryRequest = {...request, documentTitle:'', previous:undefined,
    intent:request.intent==='why'?'explain':request.intent,
    history:request.history?.slice(-8).map(({role,content})=>({role,content})) ?? [],
  };
  const fits = (context:string) => hostedInputBytes(hostedPrompt({...wireRequest,context})) <= HOSTED_INPUT_LIMIT;
  if (!fits('')) throw new Error('问题、原文或追问历史超过体验版输入上限，请缩短问题或新建提问。');
  return documentQuestionContext(sections,request.question,notice,{fits});
}
