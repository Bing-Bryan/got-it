import {useMemo,useRef,useState,type ReactNode} from 'react';
import {Bookmark,Lightbulb,Link,MessageCircle,Plus,Search,ShieldCheck} from 'lucide-react';
import brandIcon from './assets/got-it-icon.svg';
import {HOSTED} from './lib/runtime-mode';
import {HostedSamples,HostedStorageControls} from './HostedControls';
import {ReadingLibraryStatus} from './ReadingLibraryView';
import type {useReadingLibrary} from './useReadingLibrary';
import type {Workspace} from './types';
import {INTENT_META,STATUS_META} from './types';
import {SAMPLE_MARKDOWN} from './sample';
import {recentEntries,startExcerpt,startNotes,notePreview,noteState} from './lib/reading-start-page';
import {searchLibraryNames} from './lib/library-name-search';
import {normalizedBookmarkText,type ReadingBookmark} from './lib/bookmark-types';
import {useStartBookmarks} from './useStartBookmarks';
import './reading-start-page.css';
type Library=ReturnType<typeof useReadingLibrary>;
const demos=[
 {id:'explain',Icon:Lightbulb,label:INTENT_META.explain.label,before:'报告估计这一市场十年增长到 548 亿美元，',quote:'CAGR 约为 20%',after:'。',answer:'CAGR 是复合年增长率，表示每年平均按同一比例增长。按 84 亿到 548 亿美元、10 年计算，约为 20.6%，和原文的“约 20%”一致。'},
 {id:'verify',Icon:ShieldCheck,label:INTENT_META.verify.label,before:'报告称 ',quote:'67% 的 35 岁以下成人',after:'曾与 AI 伴侣互动。',answer:'分开说明是否真的搜索、引文是否对上、证据是否支持原句。没找到就直说没找到。'},
 {id:'ask',Icon:MessageCircle,label:'问一问',before:'',quote:'增加树荫、长椅和缓行路口',after:'，可能吸引人们停留更久。',answer:'原文只给出可能的机制，没有给出计数。要判断是否真的更久，需要改造前后的停留观察或对照街道的数据。'}
];
export function ReadingStartPage({library,workspace,onFile,onContinue,onNote,onBookmarks,onLocateBookmark,bookmarkVersion=0,connectionControl,covered=false}:{library:Library;workspace:Workspace;onFile:()=>void;onContinue:()=>void;onNote:(id:string)=>void;onBookmarks:()=>void;onLocateBookmark?:(bookmark:ReadingBookmark)=>Promise<void>;bookmarkVersion?:number;connectionControl?:ReactNode;covered?:boolean}){
 const [selected,setSelected]=useState('explain'),[url,setUrl]=useState(''),[query,setQuery]=useState(''),[tab,setTab]=useState<'materials'|'bookmarks'>('materials'),[libraryOpen,setLibraryOpen]=useState(false),[marginOpen,setMarginOpen]=useState(false),[locating,setLocating]=useState(''),[locateError,setLocateError]=useState('');
 const header=useRef<HTMLElement>(null),entry=library.entry,disabled=library.busy||!library.ready;
 const unavailable=!!library.check&&['missing','permission','unreadable','reselect'].includes(library.check.status);
 const excerpt=useMemo(()=>entry?startExcerpt(workspace,entry.position):{text:'',blockId:undefined,page:undefined},[workspace,entry?.position]);
 const notes=useMemo(()=>startNotes(workspace,excerpt.blockId),[workspace,excerpt.blockId]);
 const entries=query.trim()?searchLibraryNames(library.list.entries,query):recentEntries(library.list.entries);
 const bookmarks=useStartBookmarks(library.ready,bookmarkVersion,entry?.id);
 const visibleBookmarks=useMemo(()=>{const q=normalizedBookmarkText(query);return (bookmarks.page?.bookmarks??[]).filter(b=>!q||normalizedBookmarkText(b.excerpt+' '+b.sourceTitle).includes(q));},[bookmarks.page,query]);
 function changeTab(next:typeof tab){setTab(next);setQuery('');setLocateError('');}
 function selectDemo(id:string){setSelected(id);setMarginOpen(true);}
 function privacy(){header.current?.querySelector<HTMLElement>('.hosted-storage>summary')?.click();}
 async function locate(bookmark:ReadingBookmark){if(!onLocateBookmark)return;setLocating(bookmark.id);setLocateError('');try{await onLocateBookmark(bookmark);}catch(e){setLocateError(e instanceof Error?e.message:'无法定位原文，收藏仍保留。');}finally{setLocating('');}}
 const samples=HOSTED?<HostedSamples compact onOpen={library.importFile}/>:<div className="start-local-sample"><button type="button" disabled={disabled} onClick={()=>void library.importFile(new File([SAMPLE_MARKDOWN],'陪伴类AI产品分析·示例.md',{type:'text/markdown'}),true)}>陪伴类 AI 产品分析报告 · 示例</button><small>内置示例 · 数据仅作练习材料</small></div>;
 return <main className="reading-start-page" tabIndex={-1} inert={covered} aria-hidden={covered||undefined} aria-label="起始页">
  <header className="start-header" ref={header}>
   <button type="button" className="start-home-brand" aria-label="回到起始页" onClick={()=>document.querySelector<HTMLElement>('.reading-start-page')?.focus()}><img src={brandIcon} alt=""/><strong>got it</strong></button>
   <div className="start-header-actions">
    <a className="start-header-link" href="https://github.com/Bing-Bryan/got-it" target="_blank" rel="noreferrer noopener" aria-label="在 GitHub 查看 got it 源码" title="在 GitHub 查看 got it 源码">
     <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
     <span>GitHub</span>
    </a>
    {HOSTED?<HostedStorageControls save={()=>library.saveNow()} onRestore={onFile}/>:connectionControl}
   </div>
  </header>
  {!library.ready?<div className="start-loading"><p role="status">{library.error?'阅读库暂时无法打开':'正在打开阅读库…'}</p><ReadingLibraryStatus startPage hideHostedControls library={library} onImport={onFile}/></div>:
   <div className={`start-layout ${entry?'start-layout--returning':'start-layout--empty'}`}>
    <section className="start-center" aria-label="开始阅读"><div className="start-center-content">
     <ReadingLibraryStatus startPage hideHostedControls library={library} onImport={onFile}/>
     <section className="start-product-intro"><div className="start-eyebrow">阅读本地 MD、PDF 与公开网页</div><h1 className="start-title">原文不动，<br/>弄懂的过程留在原句旁。</h1>
      <ul className="start-ways" aria-label="三种理解方式">{demos.map(({id,Icon,label,before,quote,after})=><li key={id} className={`start-way ${!entry?'start-way--interactive':''} ${!entry&&selected===id?'selected':''}`} role={!entry?'button':undefined} tabIndex={!entry?0:undefined} aria-pressed={!entry?selected===id:undefined} aria-controls={!entry?`intro-note-${id}`:undefined} onClick={!entry?()=>selectDemo(id):undefined} onKeyDown={!entry?event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectDemo(id);}}:undefined}><span className="start-way-action"><Icon size={14} aria-hidden="true"/>{label}</span><span className="start-way-line">{before}<mark>{quote}</mark>{after}</span></li>)}</ul>
      {!entry?<div className="start-demo-note">演示内容：点一行，看右侧页边对应的知识贴。不会请求模型。</div>:null}
     </section>
     <section className="start-add" aria-label="加入材料"><b>{entry?'加入新材料':'放进手头的材料开始读'}</b><div className="start-inputs"><div className="start-file-row"><button type="button" className="start-primary" disabled={disabled} onClick={onFile}><Plus size={16} aria-hidden="true"/>选择本地文件</button><small>Markdown 或 PDF，原文件不会被修改</small></div><form onSubmit={event=>{event.preventDefault();library.showWebImport(url);void library.readWebArticle(url);}}><label className="start-url-field"><Link size={16} aria-hidden="true"/><input aria-label="网页链接" type="url" required autoComplete="off" value={url} onChange={e=>setUrl(e.target.value)} placeholder="粘贴公开网页或 X 文章链接" disabled={disabled}/></label><button type="submit" disabled={disabled||!url.trim()}>读取</button></form></div><div className="start-auxiliary">{HOSTED?<><span>材料与成果只保存在这个浏览器</span><span>每天有提问额度，打开和阅读不占用</span><button type="button" className="start-text-button" onClick={privacy}>发送范围</button></>:<><span>阅读库保存在本机</span><span>提问经本机 Codex 连接发给模型服务</span></>}</div></section>
    </div></section>
    <aside className={`start-side start-library-panel ${libraryOpen?'is-open':''}`} aria-label="阅读库与收藏">
     <button type="button" className="start-aux-toggle" aria-expanded={libraryOpen} aria-controls="start-library-content" onClick={()=>setLibraryOpen(v=>!v)}>阅读库与收藏<span>{libraryOpen?'收起':'展开'}</span></button>
     <div className="start-aux-content" id="start-library-content"><div className="start-library-head"><div className="start-tabs" role="tablist" aria-label="阅读库分类" onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'materials':event.key==='End'?'bookmarks':tab==='materials'?'bookmarks':'materials';changeTab(next);event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();}}}>{(['materials','bookmarks'] as const).map(value=><button type="button" role="tab" key={value} data-tab={value} id={`start-tab-${value}`} tabIndex={tab===value?0:-1} aria-selected={tab===value} aria-controls="start-library-results" className={value==='bookmarks'?'start-bookmarks':''} onClick={()=>changeTab(value)}>{value==='materials'?'材料':'收藏'}<span>{value==='materials'?library.list.entries.length:bookmarks.page?.total??'…'}</span></button>)}</div><label className="start-search"><Search size={14} aria-hidden="true"/><input type="search" aria-label={tab==='materials'?'按材料名称搜索阅读库':'搜索已加载收藏的原句或来源'} placeholder={tab==='materials'?'按材料名称搜索':'搜索收藏的原句或来源'} maxLength={1000} value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
      <div className="start-library-body" role="tabpanel" id="start-library-results" aria-labelledby={`start-tab-${tab}`}>
       {tab==='materials'?<><div className="start-group-label">{entry?'最近打开':'阅读库'}</div><div className="start-library-rows">{entries.map(e=><button type="button" className="start-library-row" key={e.id} aria-current={e.id===entry?.id?'true':undefined} disabled={disabled} onClick={()=>void library.open(e.id)}><span>{e.kind==='pdf'?'PDF':e.kind==='web'?'网页':'MD'}</span><b title={e.filename}>{e.filename}</b><small>{e.id===entry?.id?<em>在读 · </em>:null}{new Date(e.lastOpenedAt).toLocaleDateString()}</small></button>)}</div>{!entries.length?<p className="start-empty">{query?'没有匹配的文件名称':entry?'其余材料会显示在这里。':'阅读库还是空的。从中间加入第一份材料，或先打开下面的样例。'}</p>:null}{!entry?<section className="start-samples" aria-label="公开样例"><div className="start-group-label">{HOSTED?'公开样例':'示例 · 1 篇'}</div>{samples}</section>:null}</>:<>
        {bookmarks.error?<p role="alert" className="start-error">{bookmarks.error}<button type="button" onClick={bookmarks.reload}>重新读取</button></p>:null}{locateError?<p role="alert" className="start-error">{locateError}</p>:null}{bookmarks.page?.warnings.map((w,i)=><p role="alert" key={i}>{w}</p>)}{bookmarks.loading?<p role="status">正在读取收藏…</p>:null}
        {!bookmarks.loading&&!bookmarks.error&&!visibleBookmarks.length?<p className="start-empty">{query?'没有匹配的已加载收藏。':'还没有收藏。阅读时选中原文，点收藏即可保存原句。'}</p>:null}
        <div className="start-bookmark-rows">{visibleBookmarks.map(b=><button type="button" className="start-bookmark-row" key={b.id} disabled={disabled||!!locating||!onLocateBookmark} onClick={()=>void locate(b)}><q>{b.excerpt}</q><small title={b.sourceTitle}>{b.sourceTitle} · {new Date(b.createdAt).toLocaleDateString()}</small></button>)}</div>
        {bookmarks.page&&bookmarks.page.total>50?<p className="start-small">仅显示并搜索最近50条收藏；其余请在“管理全部收藏”查看。</p>:null}
       </>}
      </div>
      {tab==='bookmarks'?<footer className="start-library-footer"><button type="button" className="start-text-button" disabled={disabled} onClick={onBookmarks}><Bookmark size={13} aria-hidden="true"/>管理全部收藏</button></footer>:entry?<details className="start-samples start-library-footer"><summary>公开样例</summary><div className="start-samples-body">{samples}</div></details>:null}
     </div>
    </aside>
    <aside className={`start-side start-margin ${marginOpen?'is-open':''}`} aria-label="页边知识贴">
     <button type="button" className="start-aux-toggle" aria-expanded={marginOpen} aria-controls="start-margin-content" onClick={()=>setMarginOpen(v=>!v)}>{entry?'上次读到与知识贴':'页边演示知识贴'}<span>{marginOpen?'收起':'展开'}</span></button>
     <div className="start-aux-content" id="start-margin-content">{entry?<>
      <div className="start-margin-head"><h2 id="start-resume-heading">上次读到</h2><time>{new Date(entry.lastOpenedAt).toLocaleDateString()}</time></div>
      <section className="start-resume-section" aria-labelledby="start-resume-heading"><h3 className="start-document-title" title={workspace.document.filename}>{workspace.document.filename}</h3><div className="start-eyebrow">{workspace.document.kind==='pdf'?'PDF':workspace.document.kind==='web'?'网页':'Markdown'} · {workspace.readingSide==='translated'?'译文':'原文'}</div>
       {unavailable?<p role="status">{library.check?.message}。可重试读取或添加其他材料。</p>:<>{excerpt.page?<p className="start-small">第 {excerpt.page} 页</p>:null}{excerpt.text?<blockquote className="start-excerpt">{excerpt.text}</blockquote>:<p className="start-small">回到保存的阅读位置继续。</p>}<div className="start-resume"><button type="button" className="start-primary" disabled={disabled} onClick={onContinue}>回到那一段</button><small>知识贴还在原句旁，不会重新请求</small></div></>}
      </section><div className="start-notes-head">这一段的知识贴 <span>{unavailable?0:notes.length}</span></div><div className="start-note-list">{!unavailable&&notes.length?notes.map(note=><button type="button" key={note.id} className="start-sticky start-saved-note" onClick={()=>onNote(note.id)}><b>{INTENT_META[note.intent].label}</b><span className="start-anchor">{note.anchor.quote.slice(0,140)}</span><small>{noteState(note)??STATUS_META[note.status].label}</small><p>{notePreview(note)}</p></button>):<p className="start-empty">{unavailable?'先恢复材料读取，再查看对应原文与知识贴。':'这一段还没有知识贴。回到原文选中一句，就能开始。'}</p>}</div>
     </>:<><div className="start-margin-head"><h2>页边的知识贴</h2><span>演示</span></div><div className="start-note-list">{demos.map(({id,Icon,label,quote,answer})=><button type="button" id={`intro-note-${id}`} key={id} aria-pressed={selected===id} className={`start-sticky ${selected===id?'selected':''}`} onClick={()=>selectDemo(id)}><span className="start-sticky-top"><Icon size={14} aria-hidden="true"/>{label}<small>演示，{id==='verify'?'非真实查证':'非模型生成'}</small></span><span className="start-anchor">{quote}</span>{id==='verify'?<span className="start-example">已搜索 3 篇资料 · 1 处与原句对应，<em>但统计口径是“听说过”，不是“互动过”</em></span>:id==='ask'?<span className="start-question">我的问题：有实际的停留时长数据吗？</span>:null}<p>{answer}</p></button>)}</div></>}
     </div>
    </aside>
   </div>}
 </main>;
}
