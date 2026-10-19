/** Selected at build time; the default remains the local application. */
export const HOSTED = import.meta.env?.VITE_GOT_IT_MODE === 'hosted';
export function trialId(): string {
  const key='got-it.trial-id.v1';
  let id=localStorage.getItem(key); // Random quota identifier, never included in a backup.
  if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;
}
export interface HostedCapabilities {model:string;providerId:'deepseek';generation?:string;supportsImages:boolean;supportsWebSearch:boolean;searchProvider?:'bocha';searchAvailable?:boolean;available:boolean;quota:{remaining:number;browserLimit:number;ipLimit:number;resetAt:string|number;globalExhausted:boolean}}
let cachedGeneration:string|undefined;
export function clearHostedGeneration(){cachedGeneration=undefined;}
export async function hostedGeneration(){if(cachedGeneration)return cachedGeneration;try{const caps=await hostedCapabilities();if(caps.generation)cachedGeneration=caps.generation;}catch{/* The server rejects a missing generation; do not block local reading. */}return cachedGeneration;}
export async function hostedCapabilities():Promise<HostedCapabilities>{const r=await fetch('/api/hosted/capabilities',{headers:{'X-Trial-Id':trialId()}});if(!r.ok)throw new Error('体验服务暂时无法连接');const caps=await r.json() as HostedCapabilities;if(caps.generation)cachedGeneration=caps.generation;return caps;}
