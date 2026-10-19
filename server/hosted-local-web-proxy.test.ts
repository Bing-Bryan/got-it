// @vitest-environment node
import {expect,it} from 'vitest';
import {hostedLocalWebProxyEnabled} from './hosted-local-web-proxy';
it('keeps hosted proxy routing disabled unless the server explicitly opts in',()=>{
 expect(hostedLocalWebProxyEnabled({})).toBe(false);
 expect(hostedLocalWebProxyEnabled({HOSTED_ORIGIN:'https://reader.example',HTTPS_PROXY:'http://127.0.0.1:7897'})).toBe(false);
 expect(hostedLocalWebProxyEnabled({HOSTED_LOCAL_WEB_PROXY:'0',HOSTED_ORIGIN:'https://reader.example'})).toBe(false);
 expect(()=>hostedLocalWebProxyEnabled({HOSTED_LOCAL_WEB_PROXY:'true',HOSTED_ORIGIN:'http://127.0.0.1:5174'})).toThrow('0 or 1');
});
it.each(['http://127.0.0.1:55177','http://localhost:55177','http://[::1]:55177'])('allows the explicit local-preview flag only for exact HTTP loopback origin %s',origin=>{
 expect(hostedLocalWebProxyEnabled({HOSTED_LOCAL_WEB_PROXY:'1',HOSTED_ORIGIN:origin})).toBe(true);
});
it.each([undefined,'','https://reader.example','http://reader.example','https://127.0.0.1:55177','http://192.168.1.2:55177','http://127.0.0.1.example:55177','http://127.0.0.1:55177/','http://user@127.0.0.1:55177','http://127.0.0.1:55177/path','http://127.0.0.1:55177?proxy=1','http://127.0.0.1:55177#preview'])('rejects opt-in outside an exact loopback preview before server startup: %s',origin=>{
 expect(()=>hostedLocalWebProxyEnabled({HOSTED_LOCAL_WEB_PROXY:'1',HOSTED_ORIGIN:origin})).toThrow('exact HTTP loopback');
});
