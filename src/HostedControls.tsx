import {ChevronDown,Download,Upload} from 'lucide-react';
import {markSampleFile,type HostedSample} from './lib/hosted-sample-data';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {browserBackup,browserStorageStatus,sha256,storeSampleImages} from './lib/browser-library';
import {hostedCapabilities,type HostedCapabilities} from './lib/runtime-mode';
import {FEATURE_KEYS,usageDegraded,usageEnabled,setUsageEnabled,track} from './lib/hosted-usage';
export function HostedSettings(){
  const [cap,setCap]=useState<HostedCapabilities|null>(null),[error,setError]=useState('');
  useEffect(()=>{let current=true;hostedCapabilities().then(c=>{if(current)setCap(c);}).catch(()=>{if(current)setError('额度暂时无法读取');});return()=>{current=false;};},[]);
  return <div className="hosted-settings"><strong>体验版默认模型 · {cap?.model??'deepseek-flash'}</strong><p role="status">{error||(!cap?'正在读取额度…':cap.available===false?'体验服务暂时不可用':cap.quota.globalExhausted?'今日体验额度已用完':`今日剩余 ${cap.quota.remaining} / ${cap.quota.browserLimit} 次`)}{cap?` · 重置时间 ${new Date(cap.quota.resetAt).toLocaleString()}`:''}</p></div>;
}
export function HostedUsageSettings(){
  const [enabled,setEnabled]=useState(usageEnabled),[statisticsUnavailable,setStatisticsUnavailable]=useState(usageDegraded);
  useEffect(()=>{const update=()=>setStatisticsUnavailable(usageDegraded());window.addEventListener('got-it-usage-status',update);return()=>window.removeEventListener('got-it-usage-status',update);},[]);
  return <div className="hosted-usage-settings">
    <label><input type="checkbox" checked={enabled} onChange={event=>{const next=event.target.checked;setEnabled(next);setUsageEnabled(next);}}/>启用匿名使用统计</label>
    {enabled&&statisticsUnavailable?<p role="status">使用统计暂不可用，不影响阅读与保存。</p>:null}
    <details className="hosted-inline-details"><summary className="disclosure-summary"><span>统计内容与保存边界</span><ChevronDown size={13} className="disclosure-chevron" aria-hidden="true"/></summary>
      <p>统计按不可变批次上报，不再于当天首次离页后停止。每批只含协议版本、随机批次号、首次创建时间、推广短码（direct / xiaohongshu / x / wechat / other，未知记为 other）、材料类别（sample / markdown / pdf / web / x / none）、固定事件计数、单次访问漏斗增量和固定丢弃数。</p>
      <p>事件只区分导入开始、成功、打开已有材料、失败、取消，翻译开始、批次保存、全部完成、部分完成、失败、取消，以及回答真实完成、该轮知识贴实际保存、原文收藏。回答完成不等于知识贴已保存，原文收藏也不代替知识贴保存。教学演示不计为模型使用。</p>
      <p>不发送正文、文件名、完整链接、选区、问题、回答、IP、体验标识或访问轨迹。服务端只保存按日汇总，以及最长 48 小时的批次送达凭据（批次号哈希和到期时间，不含内容）。关闭统计会清除待发批次；已经汇总的数字无法按人删除。统计可能漏报，也不能识别机器人，不代表精确访客数或次日留存。费用告警只覆盖本站模型与搜索预算，不包含云主机或其他密钥消费。</p>
      <p>数据不会跨浏览器或设备出现。清除网站数据可能丢失成果，请下载完整备份。</p>
    </details>
  </div>;
}
/** Native disclosure stays keyboard accessible; its floating body never grows the reader row. */
export function HostedDisclosure({label,className='',children,onOpen}:{label:string;className?:string;children:ReactNode;onOpen?:()=>void}) {
  const ref=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node)&&ref.current)ref.current.open=false;};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&ref.current?.open){event.stopPropagation();ref.current.open=false;ref.current.querySelector('summary')?.focus();}};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};
  },[]);
  return <details ref={ref} onToggle={event=>{if(event.currentTarget.open)onOpen?.();}} className={`hosted-disclosure ${className}`}><summary className="disclosure-summary"><span>{label}</span><ChevronDown size={13} className="disclosure-chevron" aria-hidden="true"/></summary><div className="hosted-disclosure-panel">{children}</div></details>;
}
export function HostedSendDisclosure(){return <p className="hosted-send-disclosure">提问会将选区、主动选择的图片、有限上下文与追问历史发给托管服务及模型服务商；联网时，有界查询还会发给博查。服务端不保存正文或回答。</p>;}
export function HostedStorageControls({save,onRestore,children,hideSendDetails=false}:{hideSendDetails?:boolean;save:()=>Promise<void>;onRestore:()=>void;children?:ReactNode}){const [refresh,setRefresh]=useState(0);return <HostedDisclosure label="保存与隐私" className="hosted-storage" onOpen={()=>setRefresh(value=>value+1)}><HostedStorageContent save={save} onRestore={onRestore} refresh={refresh} hideSendDetails={hideSendDetails}/>{children}</HostedDisclosure>;}
export function HostedStorageContent({save,onRestore,refresh=0,presentation='full',hideSendDetails=false}:{hideSendDetails?:boolean;save:()=>Promise<void>;onRestore:()=>void;refresh?:number;presentation?:'full'|'backup'}){const [state,setState]=useState<{persistent:boolean;usage?:number;quota?:number}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);useEffect(()=>{if(presentation==='full')void browserStorageStatus().then(setState);},[refresh,presentation]);async function backup(){setBusy(true);setError('');try{await save();const content=await browserBackup(),url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='got-it-'+new Date().toISOString().slice(0,10)+'.gotit';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);track('backup');if(presentation==='full')setState(await browserStorageStatus());}catch(e){setError(e instanceof Error?e.message:'备份失败');}finally{setBusy(false);}}return <>
  <p>材料与成果仅保存在当前浏览器，不会跨设备或浏览器同步。</p>
  <p>清除网站数据可能丢失成果，请定期下载完整备份。</p>
  <div className="hosted-backup-actions">
    <button className="secondary-action" type="button" disabled={busy} onClick={()=>void backup()}><Download size={14} aria-hidden="true"/>下载完整备份</button>
    <button className="secondary-action" type="button" disabled={busy} onClick={onRestore}><Upload size={14} aria-hidden="true"/>恢复备份</button>
  </div>
  {error?<p role="alert">{error}</p>:null}
  {presentation==='full'?<><details className="hosted-inline-details hosted-storage-details"><summary className="disclosure-summary"><span>存储详情</span><ChevronDown size={13} className="disclosure-chevron" aria-hidden="true"/></summary>
    <p>{state?state.persistent?'已获持久存储':'未获持久存储，请定期备份':'正在读取存储状态…'}{state?.usage!==undefined?` · 已用${state.usage<104857.6?'少于 0.1 MB':`约 ${(state.usage/1048576).toFixed(1)} MB`}`:''}</p>
  </details>
  {!hideSendDetails?<div className="hosted-privacy-details"><strong>发送与隐私</strong><HostedSendDisclosure/><p>对网页图片主动解释或提问时只发送该图；查找来源仍发送有界查询。主动全文译中会把全部可翻译正文分批发送给托管服务与模型服务商，原文保留。</p></div>:null}</>:null}
  <HostedUsageSettings/>
 </>;}
export function HostedSamples({onOpen,compact=false,query="",disabled=false}:{onOpen:(file:File)=>Promise<void>;compact?:boolean;query?:string;disabled?:boolean}){const [samples,setSamples]=useState<HostedSample[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[attempt,setAttempt]=useState(0);const mounted=useRef(true),download=useRef<AbortController|null>(null);useEffect(()=>{mounted.current=true;setLoaded(false);setError('');fetch('/hosted-samples/manifest.json').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(v=>{if(mounted.current)setSamples((Array.isArray(v)?v:v.samples??[]).filter((s:HostedSample)=>s.status!=='pending'));}).catch(()=>{if(mounted.current)setError('公开样例尚未准备完成，可先添加自己的 Markdown 或 PDF。');}).finally(()=>{if(mounted.current)setLoaded(true);});return()=>{mounted.current=false;download.current?.abort();};},[attempt]);async function open(s:HostedSample){if(busy||disabled||!mounted.current)return;const controller=new AbortController();download.current?.abort();download.current=controller;const active=()=>mounted.current&&!controller.signal.aborted;setBusy(true);setError('');try{if(!s.url.startsWith('/hosted-samples/'))throw new Error('样例地址无效');const r=await fetch(s.url,{signal:controller.signal});if(!active())return;if(!r.ok)throw new Error('样例暂时无法读取');const bytes=new Uint8Array(await r.arrayBuffer());if(!active())return;if(await sha256(bytes)!==s.sha256)throw new Error('样例版本校验失败，请刷新后重试');if(s.kind==='markdown'){const markdown=new TextDecoder().decode(bytes),urls=[...new Set([...markdown.matchAll(/!\[[^\]]*\]\((\/hosted-samples\/[^)\s]+)\)/g)].map(m=>m[1]))];const images=await Promise.all(urls.map(async url=>{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw new Error('样例图片未能完整保存，请重试');const type=r.headers.get('content-type')?.split(';')[0]??'';if(!/^image\/(jpeg|png|webp)$/.test(type))throw new Error('样例图片格式无效');return {url,bytes:new Uint8Array(await r.arrayBuffer()),type};}));if(!active())return;await storeSampleImages(s.sha256,images);}
 if(!active())return;await onOpen(markSampleFile(new File([bytes],s.filename,{type:s.kind==='pdf'?'application/pdf':'text/markdown'}),s));}catch(e){if(active())setError(e instanceof Error?e.message:'样例打开失败');}finally{if(active())setBusy(false);}}return <section className="hosted-samples">{!compact?<><h2>开始阅读</h2><p>添加自己的 Markdown / PDF，或打开公开样例。选区提问只在你主动发送后执行。</p></>:null}<HostedSampleList showMetadata={!compact} samples={samples.filter(sample=>sample.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))} busy={busy||disabled} onOpen={open}/>{!loaded?<p role="status">正在加载公开样例…</p>:!error&&!samples.some(sample=>sample.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))?<p role="status">{query.trim()?"没有匹配的公开样例":"暂无公开样例"}</p>:null}{error?<div role="alert"><p>{error}</p><button type="button" disabled={busy||disabled} onClick={()=>setAttempt(value=>value+1)}>重试加载样例</button></div>:null}</section>;}
export function HostedSampleList({samples,busy,onOpen,showMetadata=true}:{samples:HostedSample[];busy:boolean;onOpen:(sample:HostedSample)=>Promise<void>;showMetadata?:boolean}){return <>{samples.map(s=><div key={s.id}><button type="button" disabled={busy} onClick={()=>void onOpen(s)}>{s.title}</button>{showMetadata?<small>{s.author}{s.source?<> · <a href={s.source} target="_blank" rel="noreferrer">来源</a></>:null} · {s.license} · {s.modified}</small>:null}</div>)}</>;}

export function HostedSampleAttribution({hash}:{hash:string}){const [sample,setSample]=useState<HostedSample|null>(null);useEffect(()=>{let active=true;setSample(null);void fetch('/hosted-samples/manifest.json').then(r=>r.json()).then(v=>{if(active)setSample((Array.isArray(v)?v:v.samples??[]).find((s:HostedSample)=>s.sha256===hash)??null);}).catch(()=>{});return()=>{active=false;};},[hash]);return sample?<HostedDisclosure label="来源与许可" className="hosted-sample-attribution"><p>只读样例 · {sample.author}{sample.source?<> · <a href={sample.source} target="_blank" rel="noreferrer">来源</a></>:null} · {sample.license} · {sample.modified} · 原文版本 {sample.sha256.slice(0,12)}</p></HostedDisclosure>:null;}
