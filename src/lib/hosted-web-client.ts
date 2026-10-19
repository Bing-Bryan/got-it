import {hostedTransportId,releaseHostedTransport} from './hosted-operation-id';
import {clearHostedGeneration,hostedGeneration,HOSTED,trialId} from './runtime-mode';

/** Per-operation capability; intentionally memory-only, never a URL, workspace or backup field. */
const tokens=new Map<string,string>();
const controllers=new Map<string,AbortController>();
function token(id:string){let value=tokens.get(id);if(!value){value=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');tokens.set(id,value);}return value;}
export function cancelHostedOperation(id:string){controllers.get(id)?.abort(new DOMException('操作已停止','AbortError'));}
export async function hostedOperationFetch(path:string,id:string,body?:unknown,parent?:AbortSignal,headers:Record<string,string>={}):Promise<Response>{
 const controller=new AbortController();controllers.set(id,controller);
 try{
  const generation=HOSTED?await hostedGeneration():undefined;
  const response=await fetch('/api/hosted'+path,{method:body===undefined?'GET':'POST',headers:{'X-Trial-Id':trialId(),'X-Hosted-Operation-Id':hostedTransportId(id),...(generation?{'X-Hosted-Generation':generation}:{}),'X-Hosted-Operation-Token':token(id),...headers,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:parent?AbortSignal.any([parent,controller.signal]):controller.signal});
  if(!response.ok){const result=await response.json().catch(()=>({}));if(result.code==='operation_stale'||result.code==='upgrade_required')clearHostedGeneration();throw Object.assign(new Error(result.error||'托管操作失败，请重试。'),{status:response.status,code:result.code,roundToken:response.headers.get('X-Hosted-Round-Token')||undefined});}
  return response;
 }finally{if(controllers.get(id)===controller)controllers.delete(id);}
}
export async function hostedOperationRequest<T>(path:string,id:string,body?:unknown,headers?:Record<string,string>):Promise<T>{const response=await hostedOperationFetch(path,id,body,undefined,headers);const value=await response.json() as T;const roundToken=response.headers.get('X-Hosted-Round-Token');return roundToken&&value&&typeof value==='object'?{...value,roundToken} as T:value;}
export function releaseHostedOperation(id:string){tokens.delete(id);controllers.delete(id);releaseHostedTransport(id);}
