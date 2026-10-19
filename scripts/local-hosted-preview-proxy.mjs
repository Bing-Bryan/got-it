/** Only for a frontend and API both bound to loopback; never trust client identity headers. */
export function localHostedPreviewProxy(apiPort) {
  return {target:`http://127.0.0.1:${apiPort}`,changeOrigin:false,configure(proxy){
    proxy.on('proxyReq',request=>{
      request.removeHeader('x-forwarded-for');
      request.setHeader('x-gotit-client-ip','127.0.0.1');
    });
  }};
}

/** Admission probe: malformed fields are rejected before URL/network/model work. */
export async function probeLocalHostedImport(origin) {
  const trialId=crypto.randomUUID();
  const capability=await fetch(`${origin}/api/hosted/capabilities`,{headers:{Origin:origin,'X-Trial-Id':trialId},signal:AbortSignal.timeout(5000)});
  if(!capability.ok)throw new Error('Local preview import admission probe could not read capabilities');
  const {generation}=await capability.json();
  if(typeof generation!=='string'||!generation)throw new Error('Local preview import admission probe has no generation');
  const response=await fetch(`${origin}/api/hosted/web-imports`,{
    method:'POST',signal:AbortSignal.timeout(5000),
    headers:{Origin:origin,'Content-Type':'application/json','X-Trial-Id':trialId,'X-Hosted-Generation':generation,'X-Hosted-Operation-Id':`${Date.now()}_${crypto.randomUUID()}`,'X-Hosted-Operation-Token':(crypto.randomUUID()+crypto.randomUUID()).replaceAll('-',''),'X-Gotit-Client-Ip':'untrusted-probe-value','X-Forwarded-For':'198.51.100.77'},
    body:JSON.stringify({operationId:`preview-probe-${crypto.randomUUID()}`,url:'not-a-url',invalidPreviewProbe:true}),
  });
  const body=await response.json();
  if(response.status!==400||body.code!=='invalid_request'||body.error!=='网页读取请求字段无效')throw new Error(`Local preview import admission probe failed (${response.status}, ${typeof body.code==='string'?body.code:'unexpected response'})`);
}
