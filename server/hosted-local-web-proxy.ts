/** Server-only opt-in for a local preview. Public hosted deployments never inherit the desktop proxy path. */
export function hostedLocalWebProxyEnabled(environment:NodeJS.ProcessEnv=process.env):boolean {
 const flag=environment.HOSTED_LOCAL_WEB_PROXY;
 if(flag===undefined||flag===''||flag==='0')return false;
 if(flag!=='1')throw new Error('HOSTED_LOCAL_WEB_PROXY must be 0 or 1');
 let origin:URL;
 try {origin=new URL(environment.HOSTED_ORIGIN??'');}catch {throw new Error('HOSTED_LOCAL_WEB_PROXY requires an exact HTTP loopback frontend origin');}
 if(origin.origin!==environment.HOSTED_ORIGIN||origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw new Error('HOSTED_LOCAL_WEB_PROXY requires an exact HTTP loopback frontend origin');
 return true;
}
