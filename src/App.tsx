import { ActionAvailability } from "./ActionAvailability";
import { actionUnavailable, type ActionUnavailable } from "./lib/action-availability";
import {readerSaveStatus} from "./lib/reader-save-status";
import {PdfReaderBoundary,reloadAfterPreserving} from './PdfReaderBoundary';
import {InquiryStreamError} from './lib/inquiry-stream';
import {loadSampleImages,setBrowserLibraryNamespace} from './lib/browser-library';
import {HOSTED,hostedCapabilities} from './lib/runtime-mode';
import {HostedSettings} from './HostedControls';
import {installUsage,track,markMaterial,noteAiStarted} from './lib/hosted-usage';
import {revealBookmarkRanges} from './lib/bookmark-navigation';
import {currentHeadingIndex,scrolledToEnd} from './lib/current-heading';
import {snapSelectionToWords} from './lib/selection-snap';
import { useCollapsibleReaderTools, isScrollKey } from './useCollapsibleReaderTools';
import { useAlignedReaderHeaders } from './useAlignedReaderHeaders';
import { readerToolsNeedAttention } from './lib/reader-tools-attention';
import { selectionContext,selectionRequestError } from './lib/inquiry-selection';
import { DocumentBookmarks } from './DocumentBookmarks';
import { useDocumentBookmarks } from './useDocumentBookmarks';
import { createBookmarkDraft, bookmarkDomRanges, type BookmarkDraft } from './lib/bookmark-selection';
import { imageAnchorElement, imageSearchText } from './lib/image-actions';
import { applyBookmarkHighlights } from './lib/bookmark-highlights';
import { bookmarkQuote, bookmarkSegments, bookmarkPosition, type BookmarkCreate, type BookmarkResult } from './lib/bookmark-types';
import { translatedBookmarkDisplays } from './lib/translated-bookmarks';
import { useBookmarkFeedback } from './useBookmarkFeedback';
import { BookmarkAction } from './BookmarkAction';
import { BookmarksView } from './BookmarksView';
import type { ReadingBookmark } from './lib/bookmark-types';
import { WebTranslationControls } from "./WebTranslationControls";
import { ColorSchemeMenu } from "./ColorSchemeMenu";
import { translatedRendering, canonicalTranslationDraft, selectedQuote, translationContext } from "./lib/translation-reading";
import brandIcon from "./assets/got-it-icon.svg";
import { useResponsiveDrawer } from "./useResponsiveDrawer";
import { useReadingViewport } from "./useReadingViewport";
import { documentAnchor, documentQuestionContext, markdownSections } from "./lib/document-question";
import { hostedDocumentQuestionContext } from "./lib/hosted-document-question";
import { MarkdownWidthControls } from "./MarkdownWidthControls";
import { useMarkdownWidth } from "./useMarkdownWidth";
import { renderedReadingMinutes } from "./lib/reading-time";
import { selectionToolbarPlacement } from "./lib/selection-toolbar-placement";
import { SelectionActions } from "./SelectionActions";
import { QuestionComposer } from "./QuestionComposer";
import PdfOutline from "./PdfOutline";
import type { PdfOutlineItem } from "./lib/pdf-outline";
import { revealReadingTarget, focusReadingTarget } from "./lib/reading-navigation";
import { useSidebar } from "./useSidebar";
import { useResultPanel } from "./useResultPanel";
import { AssistantMessage } from "./AssistantMessage";
export { AssistantMessage } from "./AssistantMessage";

async function waitForShare(predicate: () => boolean, timeout = 12_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) return false;
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
  }
  return true;
}
import { PanelResizeHandle } from "./PanelResizeHandle";
import { CodexLogin } from "./CodexLogin";
import { useSaveStatus } from "./useSaveStatus";
import { capturePosition, restorePosition, useReadingLibrary } from "./useReadingLibrary";
import { loadShareArticles, loadShareManifest, shareTokenFromLocation } from "./lib/share-reading";
import { ReadingLibraryNavigation, ReadingLibraryStatus } from "./ReadingLibraryView";
import { readDocumentFile } from "./lib/reading-document";
import { migrateHighlightAnchors } from "./lib/anchor-migration";
import { readingContext, questionContext } from "./lib/reading-context";
import { anchorGroup, inquiryCategoryStatus, intentHistory, sameAnchor, categoryIntent, rememberInquiry, preferredInquiry } from "./lib/inquiry-tabs";
import { modelConfig, resolveModelConfig, supportsConfig, type CodexModel, type ModelConfig } from "./lib/model-routing";
import { loadModelCatalog } from "./lib/model-catalog";
import { interruptMessage, PROGRESS_LABELS, readInquiryStream, responseMessage } from "./lib/inquiry-stream";
import { NEW_INQUIRY_INTENTS } from "./types";
import {
  Bookmark,
  BookMarked,
  BookOpenText,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  FileText,
  Lightbulb,
  Link2,
  LoaderCircle,
  PanelRightOpen,
  PanelRightClose,
  PanelLeftOpen,
  Pin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  Waypoints,
  X,
} from "lucide-react";
import {
  lazy, Suspense,
  useCallback,
  useLayoutEffect,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
} from "react";
import {
  INTENT_META,
  type Inquiry,
  type InquiryIntent,
  type ActiveInquiryIntent,
  type InquiryRequest,
  type InquiryResponse,
  type ProviderId,
  type ProviderStatus,
  type SelectionDraft,
  type ThreadMessage,
  type Workspace,
} from "./types";
import { createPlaceholderWorkspace } from "./sample";
import {WebImportDialog} from "./WebImportDialog";
import {ReadingStartPage} from "./ReadingStartPage";
import {initialReadingView,START_VIEW_KEY} from "./lib/reading-start-page";
import { REFINEMENTS, canCompleteInquiry, type Refinement } from "./lib/learning";
import { loadWebMedia } from "./lib/web-media";
import { WebMediaRetry } from "./WebMediaRetry";
import { WebImageViewer } from "./WebImageViewer";
import { WebImageActions } from "./WebImageActions";
import {
  applyInquiryHighlights,
  emphasizeInquiryHighlight,
  findInquiryHighlight,
  createAnchorFromSelection,
} from "./lib/anchors";
import { loadWorkspace, saveWorkspace, restoreWorkspace, copyContextHistory } from "./lib/storage";

const FALLBACK_PROVIDERS: ProviderStatus[] = HOSTED?[{id:"deepseek",name:"DeepSeek",description:"选区解释与提问",availability:"checking",supportsWebSearch:false,localOnly:false}]:[
  {
    id: "codex",
    name: "Codex",
    description: "复用本机 ChatGPT 登录",
    availability: "checking",
    supportsWebSearch: true,
    localOnly: true,
  },

];

const INTENT_ICONS: Record<InquiryIntent, typeof Sparkles> = {
  explain: Lightbulb,
  why: Waypoints,
  verify: ShieldCheck,
  entity: BookMarked,
  ask: BookOpenText,
};


const PdfReader = lazy(() => import("./PdfReader"));

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function now(): string {
  return new Date().toISOString();
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : "发生未知错误，请重试。";
}

function App() {
  useEffect(installUsage,[]);
  const bookmarkFeedback=useBookmarkFeedback();
  const {failure:bookmarkFailure,notice:bookmarkNotice,version:bookmarkVersion,retrying:bookmarkRetrying,saved:bookmarkSaved}=bookmarkFeedback;
  const [bookmarksOpen,setBookmarksOpen]=useState(false);
  const bookmarkPositionRef=useRef<ReturnType<typeof capturePosition>|null>(null);
  const [bookmarkTarget,setBookmarkTarget]=useState<(ReadingBookmark&{locateNonce:number})|null>(null);
  const bookmarkLocateNonce=useRef(0);
  const bookmarkPreparing=useRef<{entryId:string;documentId:string;nonce:number;keepList:boolean;fromStart:boolean}|null>(null);
  const bookmarkFocus=useRef<HTMLElement|null>(null);
  const [directoryTarget,setDirectoryTarget]=useState<{id:string;nonce:number}|null>(null);
  const [pdfDirectoryTarget, setPdfDirectoryTarget] = useState<{documentId:string;item:PdfOutlineItem;nonce:number}|null>(null);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    let loaded = migrateHighlightAnchors((HOSTED?null:loadWorkspace()) ?? createPlaceholderWorkspace());

    try { const preferences = JSON.parse(localStorage.getItem("got-it.model-preferences.v1") || "null"); if (preferences) loaded = restoreWorkspace({ ...loaded, ...preferences }) ?? loaded; } catch { /* retain defaults */ }
    return { ...loaded, modelDefaultsVersion: 4, modelPreferences: loaded.modelDefaultsVersion === 4 ? loaded.modelPreferences : Object.fromEntries((["explain", "verify", "entity", "why", "ask"] as const).map(intent => [intent, modelConfig(intent)])), activeProviderId: HOSTED?"deepseek":"codex" };
  });
  const [readingView,setReadingView]=useState<'start'|'reading'>(()=>initialReadingView(()=>sessionStorage,(performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming|undefined)?.type));
  const [shareToken] = useState(() => shareTokenFromLocation());
  const [shareBoot, setShareBoot] = useState<"opening" | "error" | "off">(shareToken ? "opening" : "off");
  const [shareError, setShareError] = useState("");
  const shareStarted = useRef(false);
  const shareFirstName = useRef("");
  const enterReading=useCallback(()=>{setReadingView('reading');try{sessionStorage.setItem(START_VIEW_KEY,'reading');}catch{/* Session view is optional, never a saved-content claim. */}},[]);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const [documentLoadId, setDocumentLoadId] = useState(0);
  const [codexModels, setCodexModels] = useState<CodexModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");
  const [providers, setProviders] = useState<ProviderStatus[]>(FALLBACK_PROVIDERS);
  const [bookmarkDraft,setBookmarkDraft]=useState<BookmarkDraft|null>(null);
  const bookmarkSelectionOperation=useRef<{draft:BookmarkDraft;operationId:string}|null>(null);
  const [bookmarkCompleted,setBookmarkCompleted]=useState<BookmarkCreate|null>(null);
  const bookmarkDraftRef=useRef(bookmarkDraft);bookmarkDraftRef.current=bookmarkDraft;
  const [inquirySelectionError,setInquirySelectionError]=useState('');
  const selectionSaveRecovery = useRef(false);
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(null);
  useEffect(() => {
    if (!selectionDraft&&!bookmarkDraft) return;
    const dismissSelection = (event: PointerEvent) => {
      if (event.button !== 0 || (event.target instanceof Element && (event.target.closest('.selection-toolbar, .provider-control, .color-scheme-menu, .color-scheme-popover') || (selectionSaveRecovery.current && event.target.closest('.library-state'))))) return;
      // Dismiss before focus changes; otherwise the first click only blurs the
      // textarea and mouseup can reopen the toolbar from the old DOM selection.
      selectionSaveRecovery.current=false;
      window.getSelection()?.removeAllRanges();
      setSelectionDraft(null);setBookmarkDraft(null);setInquirySelectionError('');
    };
    document.addEventListener('pointerdown', dismissSelection, true);
    return () => document.removeEventListener('pointerdown', dismissSelection, true);
  }, [selectionDraft,bookmarkDraft]);
  const [deleteMode, setDeleteMode] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [focusedInquiryId, setFocusedInquiryId] = useState<string | null>(null);
  // Pointer over a source mark lightly hints its list entry; it never opens, scrolls or requests anything.
  const [hoveredMarkId, setHoveredMarkId] = useState<string | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const [settingsIntent, setSettingsIntent] = useState<InquiryIntent>("explain");
  const providerControlRef = useRef<HTMLDivElement>(null);
  const readerViewportRef = useRef<HTMLDivElement>(null);
  const [pdfToolbarHost, setPdfToolbarHost] = useState<HTMLDivElement | null>(null);
  const [adjustmentHost, setAdjustmentHost] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const viewport = readerViewportRef.current;
    const provider = providerControlRef.current;
    if (!viewport || !provider) return;
    const align = () => {
      const trigger = provider.querySelector('.provider-trigger');
      if (trigger) {viewport.style.setProperty('--reader-adjustment-inset', `${Math.max(0, viewport.getBoundingClientRect().right - trigger.getBoundingClientRect().right)}px`);}
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(align);
    observer?.observe(viewport); observer?.observe(provider);
    window.addEventListener('resize', align); align();
    return () => { observer?.disconnect(); window.removeEventListener('resize', align); };
  }, []);

  useEffect(() => {
    if (!providerOpen) return;
    const outside = (event: PointerEvent) => { if (!providerControlRef.current?.contains(event.target as Node)) setProviderOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setProviderOpen(false); providerControlRef.current?.querySelector<HTMLButtonElement>(".provider-trigger")?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [providerOpen]);
  const [toast, setToast] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pdfTarget,setPdfTarget] = useState<{id:string;nonce:number;returnToSource?:boolean}|null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  useAlignedReaderHeaders(frameRef);
  useReadingViewport(frameRef);
  const sidebar = useSidebar();
  const resultPanel = useResultPanel();
  const openResultPanel = resultPanel.openReading;
  const resultPinActive = resultPanel.effectivelyPinned;
  const resultPinLabel = resultPanel.pinned ? "解除固定并收起知识贴" : resultPanel.autoFixed ? "收起知识贴" : "固定知识贴";
  const resultPinTitle = resultPanel.pinned ? "解除固定并收起知识贴" : resultPanel.autoFixed ? "知识贴已自动展开，点击收起" : "固定知识贴";
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listPositions = useRef(new Map<string, {top:number;id?:string}>());
  const restoreListFocus = useRef(false);
  const navigationSequence = useRef(0);
  const sidebarDrawer = useResponsiveDrawer({ narrow: sidebar.narrow, panel: sidebar.ref, desktopExpanded: sidebar.pinned || sidebar.peek, desktopTrigger: '.sidebar-rail button', desktopControl: '.desktop-sidebar-controls button' });
  const { open: mobileSidebarOpen, setOpen: setSidebarDrawerOpen } = sidebarDrawer;
  const [documentQuestionOpen, setDocumentQuestionOpen] = useState(false);
  const resultDrawer = useResponsiveDrawer({ narrow: resultPanel.narrow, panel: resultPanel.ref, desktopExpanded: resultPanel.expanded, desktopTrigger: '.result-rail button', desktopControl: '.desktop-panel-controls button' });
  const { open: mobilePanelOpen, setOpen: setResultDrawerOpen } = resultDrawer;
  // One overlay owns focus at a time; mobile visibility never changes desktop pins.
  const setMobileSidebarOpen = useCallback((open: boolean) => {
    if (open) setResultDrawerOpen(false);
    setSidebarDrawerOpen(open);
  }, [setResultDrawerOpen, setSidebarDrawerOpen]);
  const setMobilePanelOpen = useCallback((open: boolean) => {
    if (open) setSidebarDrawerOpen(false);
    setResultDrawerOpen(open);
  }, [setSidebarDrawerOpen, setResultDrawerOpen]);
  const mobileDrawerOpen = (sidebar.narrow && mobileSidebarOpen) || (resultPanel.narrow && mobilePanelOpen);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const markdownWidth = useMarkdownWidth(articleRef);
  const pendingCreations = useRef(new Map<string, SelectionDraft["anchor"]>());
  const requests = useRef(new Map<string, { id: string; controller: AbortController }>());
  const [progress, setProgress] = useState<Record<string, string>>({});
  useEffect(() => () => { for (const request of requests.current.values()) request.controller.abort(); }, []);
  const toastTimerRef = useRef<number | null>(null);

  const installLibraryWorkspace = useCallback((next: Workspace,entryId?:string) => {
    selectionSaveRecovery.current=false;
    navigationSequence.current++;
    const pending=bookmarkPreparing.current;
    if(!pending||pending.entryId!==entryId||pending.documentId!==next.document.id){bookmarkPreparing.current=null;setBookmarkTarget(null);setBookmarksOpen(false);}
    else if(!pending.keepList)setBookmarksOpen(false);
    setPdfDirectoryTarget(null);setDirectoryTarget(null);
    workspaceRef.current = next; setWorkspace(next); setDocumentLoadId(v => v + 1);
    setDocumentQuestionOpen(false); setPdfTarget(null); setProgress({}); setSelectionDraft(null);setBookmarkDraft(null);setInquirySelectionError(''); setFocusedInquiryId(null); setMobileSidebarOpen(false); setMobilePanelOpen(false); setProviderOpen(false);
    window.getSelection()?.removeAllRanges();
  }, []);
  const interruptForSwitch = useCallback(() => {
    for (const request of requests.current.values()) request.controller.abort();
    requests.current.clear(); setProgress({});
    const next = restoreWorkspace(workspaceRef.current) ?? workspaceRef.current;
    workspaceRef.current = next; setWorkspace(next); return next;
  }, []);
  setBrowserLibraryNamespace(shareToken ? `share-${shareToken}` : '');
  const library = useReadingLibrary({ workspace, readingVisible:readingView==='reading', onOpened:enterReading, onEmptied:()=>{setReadingView('start');try{sessionStorage.setItem(START_VIEW_KEY,'start');}catch{}}, install: installLibraryWorkspace, interrupt: interruptForSwitch, getWorkspace: () => workspaceRef.current, update: (next) => { workspaceRef.current=next;setWorkspace(next); } });
  const recoveryPriority=library.blocked||!!library.recovery||library.recoveries.some(r=>r.state==='pending'&&r.hasDifferences!==false);
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const showStart=(!library.ready||!library.entry||readingView==='start')&&!recoveryPriority&&shareBoot!=="opening";
  useEffect(()=>{if(recoveryPriority)enterReading();},[recoveryPriority,enterReading]);
  useEffect(() => {
    if (!shareToken || !library.ready || shareStarted.current) return;
    shareStarted.current = true;
    setReadingView("reading");
    void (async () => {
      const controller = new AbortController();
      const abortTimer = window.setTimeout(() => controller.abort(), 25_000);
      try {
        const manifest = await loadShareManifest(shareToken, { signal: controller.signal });
        const articles = await loadShareArticles(manifest, shareToken, { signal: controller.signal });
        shareFirstName.current = articles[0]?.filename ?? "";
        const shareNames = new Set(articles.map(article => article.filename));
        const hadShareEntries = articles.some(article => libraryRef.current.list.entries.some(entry => entry.filename === article.filename));
        for (const article of articles) {
          if (libraryRef.current.list.entries.some(entry => entry.filename === article.filename)) continue;
          let added = false;
          for (let attempt = 0; attempt < 2 && !added; attempt++) {
            if (!(await waitForShare(() => !libraryRef.current.busy))) break;
            await libraryRef.current.importFile(new File([article.markdown], article.filename, { type: "text/markdown" }));
            added = await waitForShare(
              () => libraryRef.current.list.entries.some(entry => entry.filename === article.filename),
              attempt === 0 ? 8_000 : 12_000,
            );
          }
          if (!added) throw new Error(`《${article.title}》没有成功加入阅读库。已加入的文章会保留，刷新页面会继续。`);
        }
        if (!(await waitForShare(() => !libraryRef.current.busy))) throw new Error("阅读库正在切换文章，请稍后重试。");
        const first = articles[0] && libraryRef.current.list.entries.find(entry => entry.filename === articles[0].filename);
        if (!first) throw new Error("没有找到分享的第一篇文章。");
        const current = libraryRef.current.entry;
        const currentSummary = current && libraryRef.current.list.entries.find(entry => entry.id === current.id);
        const currentIsShare = !!currentSummary && shareNames.has(currentSummary.filename);
        if ((!hadShareEntries || !currentIsShare) && current?.id !== first.id) await libraryRef.current.open(first.id);
        setShareBoot(value => value === "opening" ? "off" : value);
      } catch (error) {
        setShareError(error instanceof DOMException && error.name === "AbortError"
          ? "分享内容读取超时，请刷新页面重试。"
          : error instanceof Error ? error.message : "分享内容打开失败，请刷新重试。");
        setShareBoot(value => value === "opening" ? "error" : value);
      } finally {
        window.clearTimeout(abortTimer);
      }
    })();
  }, [shareToken, library.ready]);
  useEffect(() => {
    if (!shareToken || shareBoot !== "opening") return;
    const timer = window.setTimeout(() => {
      setShareError("打开分享超时，请刷新页面重试。");
      setShareBoot(value => value === "opening" ? "error" : value);
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [shareToken, shareBoot]);
  useLayoutEffect(()=>{if(!showStart)library.rendered();},[showStart,documentLoadId]);
  async function returnToStart(){if(shareToken){if(!library.ready||library.busy)return;const target=libraryRef.current.list.entries.find(entry=>entry.filename===shareFirstName.current)??libraryRef.current.list.entries[0];if(target)await libraryRef.current.open(target.id);return;}if(!library.ready||library.busy)return;if(await library.returnToStart()){setReadingView('start');try{sessionStorage.setItem(START_VIEW_KEY,'start');}catch{}setBookmarksOpen(false);setMobileSidebarOpen(false);setMobilePanelOpen(false);setSelectionDraft(null);setBookmarkDraft(null);window.getSelection()?.removeAllRanges();requestAnimationFrame(()=>document.querySelector<HTMLElement>(".reading-start-page")?.focus({preventScroll:true}));}}
  const documentBookmarks=useDocumentBookmarks(library.entry?.id,bookmarkVersion);
  const activeBookmarkRevision=library.historyId||library.entry?.revisionId;
  const currentBookmarks=documentBookmarks.bookmarks.filter(bookmark=>bookmark.revisionId===activeBookmarkRevision);
  const bookmarkDisplays=useMemo(
    () => workspace.readingSide==='translated'&&workspace.document.kind!=='pdf'
      ? translatedBookmarkDisplays(documentBookmarks.bookmarks,workspace.document,workspace.webTranslation,activeBookmarkRevision)
      : undefined,
    [documentBookmarks.bookmarks,activeBookmarkRevision,workspace.document,workspace.readingSide,workspace.webTranslation],
  );
  function beginBookmarkSave(request:BookmarkCreate){bookmarkFeedback.started(request);const draft=bookmarkDraftRef.current;if(draft)bookmarkSelectionOperation.current={draft,operationId:request.operationId};}
  function finishBookmarkSave(result:BookmarkResult,request:BookmarkCreate){
    bookmarkSaved(result,request);setBookmarkCompleted(request);
    const current=bookmarkDraftRef.current;
    if(current&&bookmarkSelectionOperation.current?.draft===current&&bookmarkSelectionOperation.current.operationId===request.operationId&&library.entry&&bookmarkPosition({entryId:library.entry.id,revisionId:library.entry.revisionId,anchor:current.anchor})===bookmarkPosition(request)){setBookmarkDraft(null);setSelectionDraft(null);setInquirySelectionError('');window.getSelection()?.removeAllRanges();}
  }
  useEffect(()=>{if(HOSTED&&library.entry){const doc=workspace.document;markMaterial(doc.id.startsWith('sample-')?'sample':doc.kind==='pdf'?'pdf':doc.kind==='web'?doc.web.extractorVersion.startsWith('x-')?'x':'web':'markdown');}},[library.entry?.id,workspace.document.id]);
  const saveStatus = useSaveStatus(library.status, workspace.document.id + ":" + documentLoadId);
  const toolbarSaveStatus = readerSaveStatus(library.blocked ? library.status : saveStatus, workspace.document, library.blocked);
  // A stored failed translation is a lasting fact like a partial import; only a run that just ended in failure keeps the row open.
  const toolsDocumentKey = workspace.document.id + ":" + documentLoadId;
  useEffect(() => setHoveredMarkId(null), [toolsDocumentKey]);
  const hoveredMarkInquiry = hoveredMarkId ? workspace.inquiries.find(inquiry => inquiry.id === hoveredMarkId) : undefined;
  const [freshTranslationFailure, setFreshTranslationFailure] = useState<string | null>(null);
  const translationWasRunning = useRef(false);
  useEffect(() => {
    const state = workspace.webTranslation;
    if (translationWasRunning.current && !library.translationRunning && (state?.status === "failed" || (state?.status === "interrupted" && state.error))) setFreshTranslationFailure(toolsDocumentKey);
    translationWasRunning.current = library.translationRunning;
  }, [library.translationRunning, workspace.webTranslation, toolsDocumentKey]);
  const toolsAttention = readerToolsNeedAttention({ blocked: library.blocked, busy: library.busy, translationRunning: library.translationRunning, error: library.error, draftWarning: library.draftWarning, notice: library.notice, recovery: !!library.recovery,
    unreadableRecovery: library.recoveries.some(r => r.state === "pending" && r.savedRecordUnavailable), saveStatus: toolbarSaveStatus, sourceStatus: workspace.document.kind === "web" ? undefined : library.check?.status, translation: freshTranslationFailure === toolsDocumentKey ? workspace.webTranslation : undefined, translationNotice: workspace.translationNotice });
  // Never fold away keyboard focus, an open disclosure or any alert the row is showing; a tapped button keeping focus does not count.
  const canFoldReaderTools = useCallback(() => {
    const tools = document.querySelector(".reader-tools");
    if (!tools || tools.querySelector("details[open], [role=\"alert\"]")) return false;
    try { return !tools.querySelector(":focus-visible"); } catch { return !tools.matches(":focus-within"); }
  }, []);
  const readerTools = useCollapsibleReaderTools({ enabled: !showStart && workspace.document.kind !== "pdf" && !toolsAttention, resetKey: toolsDocumentKey, canFold: canFoldReaderTools });

  const [sampleImages,setSampleImages]=useState<Record<string,string>>({});
  useEffect(()=>{let active=true;setSampleImages({});if(HOSTED)void loadSampleImages(workspace.document.contentHash).then(images=>{if(active)setSampleImages(images);}).catch(()=>{});return()=>{active=false;};},[workspace.document.contentHash]);
  const rendered = useMemo(
    () => workspace.document.kind === "pdf" ? {html:"",outline:[]} : translatedRendering(workspace,sampleImages),
    [workspace.document, workspace.webTranslation, workspace.readingSide,sampleImages],
  );
  async function openBookmarks(){
    track("bookmarks-all");
    bookmarkPreparing.current=null;setBookmarkTarget(null);
    try {await library.prepareBookmarks();bookmarkPositionRef.current=showStart?{...library.initialPosition}:capturePosition();enterReading();setSelectionDraft(null);setBookmarkDraft(null);setInquirySelectionError('');window.getSelection()?.removeAllRanges();setBookmarksOpen(true);setMobileSidebarOpen(false);setMobilePanelOpen(false);}
    catch(e){showToast(e instanceof Error?e.message:"无法打开收藏，请重试。");}
  }
  function closeBookmarks(){bookmarkPreparing.current=null;setBookmarkTarget(null);setBookmarksOpen(false);requestAnimationFrame(()=>{if(bookmarkPositionRef.current)restorePosition(bookmarkPositionRef.current);const trigger=document.querySelector<HTMLButtonElement>(document.querySelector('.app-frame.start-mode')?'.start-bookmarks':window.matchMedia('(max-width:780px)').matches?'.drawer-navigation-trigger':'.bookmarks-nav');trigger?.focus();});}
  async function locateBookmark(bookmark:ReadingBookmark){
    track("bookmark-locate");
    const attempt={entryId:bookmark.entryId,documentId:bookmark.documentId,nonce:++bookmarkLocateNonce.current,keepList:bookmarksOpen,fromStart:showStart};bookmarkPreparing.current=attempt;
    try{if(!await library.openBookmark(bookmark.id))throw new Error('无法打开对应原文版本，收藏仍保留。请检查阅读库状态后重试。');
    if(bookmarkPreparing.current===attempt)setBookmarkTarget({...bookmark,locateNonce:attempt.nonce});}
    catch(error){if(bookmarkPreparing.current===attempt)bookmarkPreparing.current=null;throw error;}
  }
  useLayoutEffect(()=>{
    if(!bookmarkTarget)return;
    if(workspace.document.id!==bookmarkTarget.documentId)return;
    if(workspace.document.kind==='pdf')return;
    // Center while the list still covers the reader, then reveal the prepared source.
      library.rendered();
      if(bookmarkTarget.anchor.image){
        const image=articleRef.current&&imageAnchorElement(articleRef.current,bookmarkTarget.anchor);
        if(image&&revealReadingTarget(image)){if(bookmarkPreparing.current?.fromStart)library.navigationRevealed();image.classList.add('is-bookmark-target');window.setTimeout(()=>image.classList.remove('is-bookmark-target'),1400);bookmarkFocus.current=image;setBookmarksOpen(false);}
        else {showToast('无法定位收藏图片，说明仍保留。');setBookmarksOpen(true);}
        bookmarkPreparing.current=null;setBookmarkTarget(null);
        return;
      }
      const ranges=articleRef.current&&bookmarkDomRanges(articleRef.current,bookmarkTarget.anchor);
      const block=ranges?.[0]?.startContainer.parentElement?.closest<HTMLElement>('[data-block-id],[data-bookmark-block-id]');
      if(ranges&&block&&revealBookmarkRanges(ranges)) {if(bookmarkPreparing.current?.fromStart)library.navigationRevealed();bookmarkFocus.current=block;setBookmarksOpen(false);if(bookmarkSegments(bookmarkTarget.anchor).some(segment=>segment.translation))showToast('已定位对应原文段落（非逐词对齐）。');}
      else {showToast('无法定位收藏原文，摘录与上下文仍保留。');setBookmarksOpen(true);}
      bookmarkPreparing.current=null;setBookmarkTarget(null);
  },[bookmarkTarget,documentLoadId,rendered.html]);
  useLayoutEffect(()=>{if(bookmarksOpen||!bookmarkFocus.current)return;const block=bookmarkFocus.current;bookmarkFocus.current=null;if(block.isConnected)focusReadingTarget(block);},[bookmarksOpen,bookmarkTarget]);
  function jumpToHeading(id:string){
    track("outline");
    setMobileSidebarOpen(false);
    if(bookmarksOpen){bookmarkPreparing.current=null;setBookmarkTarget(null);setBookmarksOpen(false);setDirectoryTarget({id,nonce:Date.now()});return;}
    const target=document.getElementById(id);if(target){revealReadingTarget(target,{align:'start'});setCurrentHeading(id);}
  }
  useEffect(()=>{
    if(!directoryTarget||bookmarksOpen)return;let jumpFrame=0;
    const frame=requestAnimationFrame(()=>{library.rendered();jumpFrame=requestAnimationFrame(()=>{const target=document.getElementById(directoryTarget.id);if(target){revealReadingTarget(target,{align:'start'});setCurrentHeading(directoryTarget.id);}setDirectoryTarget(null);});});
    return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(jumpFrame);};
  },[directoryTarget,bookmarksOpen]);
  useEffect(() => {
    const doc = workspace.document;
    if (doc.kind !== "web" || !articleRef.current || !library.entry) return;
    const revision = library.historyId || library.entry.revisionId;
    return loadWebMedia(articleRef.current, doc.web, id => `/entries/${library.entry!.id}/web-resources/${revision}/${id}`, () => library.rendered());
  }, [workspace.document, documentLoadId, library.entry?.id, library.historyId, rendered.html]);
  const [currentHeading, setCurrentHeading] = useState<string | null>(null);
  useEffect(() => {
    const scroll = document.querySelector<HTMLElement>('.reader-scroll');
    if (!scroll || workspace.document.kind === 'pdf') { setCurrentHeading(null); return; }
    let frame = 0;
    const update = () => {
      frame = 0;
      const bounds = scroll.getBoundingClientRect();
      const tops = rendered.outline.map(item => document.getElementById(item.id)?.getBoundingClientRect().top ?? null);
      const index = currentHeadingIndex(tops, { top: bounds.top, bottom: bounds.bottom, atEnd: scrolledToEnd(scroll) });
      if (index !== null) setCurrentHeading(rendered.outline[index]?.id ?? null);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    // The reader stays mounted under the start page; re-measure once it gains layout or reflows after font loading.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(scroll); if (articleRef.current) observer?.observe(articleRef.current);
    schedule(); scroll.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); scroll.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [rendered.outline, workspace.document.id, documentLoadId, showStart]);


  const markdownMinutes = useMemo(() => renderedReadingMinutes(rendered.html), [rendered.html]);
  const [pdfMinutes, setPdfMinutes] = useState<{ hash: string; minutes: number | null } | null>(null);
  const receivePdfMinutes = useCallback((hash: string, minutes: number | null) => setPdfMinutes({ hash, minutes }), []);
  const readingMinutes = workspace.document.kind === "pdf"
    ? (pdfMinutes?.hash === workspace.document.pdf.resourceId ? pdfMinutes.minutes : null)
    : markdownMinutes;

  const selectedInquiry = useMemo(
    () =>
      workspace.inquiries.find((item) => item.id === workspace.activeInquiryId) ??
      null,
    [workspace.activeInquiryId, workspace.inquiries],
  );

  const representative = workspace.inquiries.find(i => i.id === workspace.activeTab?.anchorInquiryId) ?? selectedInquiry;
  const tabIntent = categoryIntent(workspace.activeTab?.intent ?? selectedInquiry?.intent ?? "explain");
  const group = representative ? anchorGroup(workspace.inquiries, representative) : [];
  const history = intentHistory(group, tabIntent);
  const activeInquiry = selectedInquiry && categoryIntent(selectedInquiry.intent) === tabIntent ? selectedInquiry : null;
  const categoryItems = intentHistory(workspace.inquiries, tabIntent);
  const documentQuestionBusy = workspace.inquiries.some(i => i.anchor.scope === "document" && i.status === "answering");
  const listKey = `${workspace.document.id}:${library.entry?.revisionId ?? workspace.document.contentHash}:${tabIntent}`;
  const rememberList = () => {
    if (!activeInquiry && listScrollRef.current) {
      const old = listPositions.current.get(listKey);
      listPositions.current.set(listKey, {top:listScrollRef.current.scrollTop,id:old?.id});
    }
  };
  useLayoutEffect(() => {
    if (activeInquiry || !listScrollRef.current) return;
    const list = listScrollRef.current, saved = listPositions.current.get(listKey);
    list.scrollTop = Math.min(saved?.top ?? 0, Math.max(0, list.scrollHeight - list.clientHeight));
    if (restoreListFocus.current) {
      restoreListFocus.current = false;
      const buttons = [...list.querySelectorAll<HTMLButtonElement>('.category-open')];
      (buttons.find(b => b.dataset.inquiryId === saved?.id) ?? buttons[0] ?? document.getElementById(`intent-tab-${tabIntent}`))?.focus({preventScroll:true});
    }
  }, [listKey, activeInquiry?.id]);
  useEffect(() => {
    setDeleteMode(false); setPendingDeleteId(null);
  }, [documentLoadId, tabIntent, workspace.activeInquiryId]);
  useEffect(() => {
    if (!categoryItems.length || library.readOnly || library.busy || !library.ready) {
      setDeleteMode(false); setPendingDeleteId(null);
    }
  }, [categoryItems.length, library.readOnly, library.busy, library.ready]);
  const groupBusy = group.some(i => i.status === "answering");
  useEffect(() => { if (!providerOpen) setSettingsIntent(tabIntent === "why" ? "explain" : tabIntent); }, [tabIntent, providerOpen]);
  const currentModel = resolveModelConfig(settingsIntent, workspace.modelPreferences, codexModels);
  const selectedModelInfo = codexModels.find(model => model.model === currentModel.model);
  const modelReady = HOSTED ? providers.find(p=>p.id===workspace.activeProviderId)?.availability === "connected" : workspace.activeProviderId !== "codex" || (!modelsLoading && !modelsError && supportsConfig(codexModels, resolveModelConfig(tabIntent, workspace.modelPreferences, codexModels)));

  const activeProvider = useMemo(
    () =>
      providers.find((item) => item.id === workspace.activeProviderId) ??
      providers.find((item) => item.id === "codex") ?? FALLBACK_PROVIDERS[0],
    [providers, workspace.activeProviderId],
  );

  const saveWarning=library.blocked||library.status==="阅读进度暂未保存";
  const selectionUnavailable = actionUnavailable({readOnly:!!library.historyId||!!library.recovery,ready:library.ready,busy:library.busy,saveFailed:library.blocked,invalidSelection:!selectionDraft,generating:!!selectionDraft && workspace.inquiries.some(i=>i.status==='answering'&&sameAnchor(i.anchor,selectionDraft.anchor)),modelReady,hosted:HOSTED});
  const imageUnavailable = actionUnavailable({readOnly:!!library.historyId||!!library.recovery,ready:library.ready,busy:library.busy,saveFailed:library.blocked,modelReady,hosted:HOSTED});
  const recoverAction = (target:'connection'|'save') => {
    if(target==='connection') {setProviderOpen(true);if(HOSTED)void refreshProviders();return;}
    selectionSaveRecovery.current=true;
    const status=frameRef.current?.querySelector<HTMLElement>('.reader-tools .library-state');
    const warning=status?.querySelector<HTMLElement>('.library-warning');
    const details=status?.querySelector<HTMLDetailsElement>('details');
    if(details&&!warning)details.open=true;
    const focus=(warning??details??status)?.querySelector<HTMLElement>('button,summary');
    focus?.focus({preventScroll:true});
  };

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3400);
  }, []);

  const refreshModels = useCallback(async (refresh = false) => {
    if(HOSTED){setModelsLoading(false);return;}
    setModelsLoading(true); setModelsError("");
    try {
      setCodexModels(await loadModelCatalog(refresh));
    } catch (error) { setCodexModels([]); setModelsError(readError(error)); }
    finally { setModelsLoading(false); }
  }, []);
  useEffect(() => { void refreshModels(); }, [refreshModels]);

  useEffect(() => {
    if (modelsLoading || modelsError || !codexModels.length) return;
    const intents = ["explain", "verify", "entity", "why", "ask"] as const;
    const repaired = intents.filter(intent => JSON.stringify(resolveModelConfig(intent, workspace.modelPreferences, codexModels)) !== JSON.stringify(modelConfig(intent, workspace.modelPreferences)));
    if (!repaired.length) return;
    setWorkspace(current => ({ ...current, modelPreferences: Object.fromEntries(intents.map(intent => [intent, resolveModelConfig(intent, current.modelPreferences, codexModels)])), updatedAt: now(), hasUnexportedChanges: true }));
    showToast("已更新为可用的模型配置，可直接开始；也可以自行调整。");
  }, [codexModels, modelsLoading, modelsError, workspace.modelPreferences, showToast]);

  const refreshProviders = useCallback(async () => {
    if(HOSTED){try{const c=await hostedCapabilities();setProviders([{...FALLBACK_PROVIDERS[0],supportsWebSearch:c.supportsWebSearch,availability:c.available?"connected":"unavailable",detail:c.quota.globalExhausted?"今日体验额度已用完":`今日剩余 ${c.quota.remaining} 次`}]);}catch{setProviders([{...FALLBACK_PROVIDERS[0],availability:"unavailable",detail:"体验服务暂时无法连接"}]);}return;}
    try {
      const response = await fetch("/api/providers");
      if (!response.ok) throw new Error("Provider 状态服务暂不可用");
      const data = (await response.json()) as {
        providers: ProviderStatus[];
        defaultProviderId: ProviderId;
      };
      const codex = data.providers.find(provider => provider.id === "codex");
      setProviders(codex ? [codex] : FALLBACK_PROVIDERS.map(provider => ({ ...provider, availability: "unavailable", detail: "本地服务未提供 Codex，请更新并重启服务。" })));
      setWorkspace(current => current.activeProviderId === "codex" ? current : { ...current, activeProviderId: "codex" });
    } catch {
      setProviders(FALLBACK_PROVIDERS.map(provider => ({ ...provider, availability: "unavailable", detail: "无法连接本地 API 服务，请启动服务后重试。" })));
      showToast("无法连接模型服务，请检查本地 API；本次不会生成占位回答。");
    }
  }, []);

  const onCodexConnected = useCallback(async () => { await Promise.all([refreshProviders(), refreshModels(true)]); }, [refreshProviders, refreshModels]);

  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  useEffect(() => {
    if (HOSTED || !workspace.document.isDemo || workspace.document.id === "start-placeholder") return;
    const result = saveWorkspace(workspace);
    if (!result.ok) showToast(result.error);
  }, [showToast, workspace]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const missingInquiryIds = new Set<string>();
    const recoveredInquiryIds = new Set<string>();
    const cleanup = applyInquiryHighlights(
      article,
      workspace.inquiries,
      workspace.activeInquiryId,
      (inquiry) => {
        if (inquiry.anchor.matchStatus !== "needs-relink") {
          missingInquiryIds.add(inquiry.id);
        }
      },
      inquiry => { if (inquiry.anchor.matchStatus === "needs-relink") recoveredInquiryIds.add(inquiry.id); },
    );

    if (missingInquiryIds.size > 0 || recoveredInquiryIds.size > 0) {
      setWorkspace((current) => {
        let changed = false;
        const inquiries = current.inquiries.map((inquiry) => {
          if (recoveredInquiryIds.has(inquiry.id)) { changed = true; return { ...inquiry, anchor: { ...inquiry.anchor, matchStatus: "matched" as const } }; }
          if (!missingInquiryIds.has(inquiry.id) || inquiry.anchor.matchStatus === "needs-relink") {
            return inquiry;
          }
          changed = true;
          return {
            ...inquiry,
            anchor: { ...inquiry.anchor, matchStatus: "needs-relink" as const },
          };
        });
        return changed
          ? { ...current, inquiries, updatedAt: now(), hasUnexportedChanges: true }
          : current;
      });
    }

    return cleanup;
  }, [rendered.html, workspace.activeInquiryId, workspace.inquiries]);
  useEffect(()=>{
    const article=articleRef.current;
    if(!article)return;
    return applyBookmarkHighlights(article,currentBookmarks,{
      document:workspace.document,
      translation:workspace.webTranslation,
      readingSide:workspace.readingSide??'original',
    });
  },[rendered.html,workspace.activeInquiryId,workspace.inquiries,workspace.document,workspace.webTranslation,workspace.readingSide,documentBookmarks.bookmarks,activeBookmarkRevision]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const focused = !activeInquiry && categoryItems.find(item => item.id === focusedInquiryId && item.anchor.matchStatus === "matched");
    emphasizeInquiryHighlight(article, workspace.inquiries, focused ? focused.id : activeInquiry?.id ?? null);
    if (focusedInquiryId && !focused) setFocusedInquiryId(null);
  }, [focusedInquiryId, activeInquiry, tabIntent, rendered.html, workspace.inquiries]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (workspace.document.kind === "pdf" || workspace.document.kind === "web") return;
    if (library.entry) {
      const frame = window.requestAnimationFrame(() => library.rendered());
      return () => window.cancelAnimationFrame(frame);
    }
    const id = workspace.activeInquiryId;
    if (!id) return;
    const frame = window.requestAnimationFrame(() => {
      const target = [...(articleRef.current?.querySelectorAll<HTMLElement>("mark[data-inquiry-id]") ?? [])].find(mark => mark.dataset.inquiryId === id);
      if (target) revealReadingTarget(target);
    });
    return () => window.cancelAnimationFrame(frame);
    // Intentionally only restore on document load; request updates must not move reading position.
  }, [workspace.document.id, documentLoadId]);

  const updateWorkspace = useCallback(
    (recipe: (current: Workspace) => Workspace) => {
      const next = { ...recipe(workspaceRef.current), updatedAt: now(), hasUnexportedChanges: true };
      workspaceRef.current = next; setWorkspace(next);
    },
    [],
  );

  const updateInquiry = useCallback(
    (inquiryId: string, recipe: (inquiry: Inquiry) => Inquiry) => {
      if (library.readOnly || library.busy || !library.ready) return;
      updateWorkspace((current) => ({
        ...current,
        inquiries: current.inquiries.map((inquiry) =>
          inquiry.id === inquiryId ? recipe(inquiry) : inquiry,
        ),
      }));
    },
    [updateWorkspace, library.readOnly, library.busy, library.ready, library.entry?.id],
  );

  const askProvider = useCallback(
    async (inquiryId: string, request: InquiryRequest) => {
      if (library.readOnly || library.busy || !library.ready || requests.current.has(inquiryId)) return;
      if(request.history?.length){const rounds=request.history.filter(m=>m.role==='user').length;track(rounds>=6?'follow-up-6plus':'follow-up-2to5');}
      track(request.intent==='verify'?'verify':request.readingScope==='document'?'document-ask':request.history?.length?'follow-up':request.intent==='ask'?'ask':'explain');
      const requestId = newId("request"), messageId = newId("message"), controller = new AbortController();
      noteAiStarted(requestId);
      const operation = request.operation ?? (request.intent === "why" ? "explain" : request.intent);
      const imageAnchor=workspaceRef.current.inquiries.find(i=>i.id===inquiryId)?.anchor;
      const image=request.image ?? (imageAnchor?.pdf?.kind==="region" && library.entry ? {entryId:library.entry.id,fileHash:imageAnchor.pdf.fileHash,cropId:imageAnchor.pdf.cropId!} : imageAnchor?.image && library.entry ? {kind:"web-media" as const,entryId:library.entry.id,revisionId:imageAnchor.image.revisionId,mediaId:imageAnchor.image.mediaId,resourceId:imageAnchor.image.resourceId} : undefined);
      const scoped = { ...request, ...(image?{image}:{}), modelConfig: request.providerId === "codex" ? request.modelConfig ?? resolveModelConfig(operation, workspace.modelPreferences, codexModels) : undefined, requestId, operation, scope: request.scope ?? "initial" as const, round: request.round ?? 1 };
      requests.current.set(inquiryId, { id: requestId, controller });
      updateInquiry(inquiryId, inquiry => ({ ...inquiry, messages: [...inquiry.messages, { id: messageId, role: "assistant", content: "", createdAt: now(), modelConfig: scoped.modelConfig, requestId, completion: "provisional", operation: scoped.operation, explanationMode: scoped.explanationMode, scope: scoped.scope, round: scoped.round, parentMessageId: scoped.parentMessageId }] }));
      let contextNotice = "";
      try {
        if (scoped.readingScope === "document") {
          setProgress(current => ({ ...current, [inquiryId]: "正在读取本文文字" }));
          const document = workspaceRef.current.document;
          let sections = markdownSections(articleRef.current), notice = "";
          if (document.kind === "pdf") {
            if (!library.entry) throw new Error("请先将文档加入阅读库。");
            const { readDocumentPdfText } = await import("./lib/document-pdf-text");
            controller.signal.throwIfAborted();
            const result = await readDocumentPdfText(library.entry.id, document.pdf.resourceId, controller.signal);
            sections = result.sections; notice = result.notice;
          }
          controller.signal.throwIfAborted();
          const prepared = HOSTED ? hostedDocumentQuestionContext(sections, scoped, notice) : documentQuestionContext(sections, scoped.question, notice);
          scoped.context = prepared.context; contextNotice = prepared.notice;
          updateInquiry(inquiryId, inquiry => ({ ...inquiry, messages: inquiry.messages.map(message => message.id === messageId ? { ...message, contextNotice } : message) }));
        }
        await readInquiryStream(scoped, event => {
          if (requests.current.get(inquiryId)?.id !== requestId) return;
          if (event.type === "answer-delta" && event.delta?.trim()) setProgress(current => ({ ...current, [inquiryId]: "正在生成正文" }));
          if (event.progress) setProgress(current => ({ ...current, [inquiryId]: PROGRESS_LABELS[event.progress!] }));
          updateInquiry(inquiryId, inquiry => ({ ...inquiry,
            messages: inquiry.messages.map(message => message.id !== messageId ? message : event.response
              ? { ...responseMessage(messageId, scoped, event.response, event.type === "complete"), timings: event.timings, contextNotice }
              : event.type === "answer-delta" ? { ...message, content: message.content + event.delta, timings: event.timings }
              : event.source ? { ...message, sources: message.sources?.map(source => source.id === event.source!.id ? event.source! : source) } : message),
            status: event.type === "complete" ? scoped.operation === "verify" && event.response?.evidenceStatus !== "supported" ? "needs-verification" : "ready" : "answering",
            lastError: undefined, updatedAt: now(),
          }));
        }, controller.signal);
      } catch (error) {
        if(scoped.intent==='verify'&&!controller.signal.aborted)track('verify-failed');
        track(controller.signal.aborted?'answer-stop':/额度/.test(readError(error))?'quota-exhausted':'model-failed');
        if (requests.current.get(inquiryId)?.id === requestId) updateInquiry(inquiryId, inquiry => ({ ...inquiry,
          messages: inquiry.messages.map(message => message.id === messageId ? {...interruptMessage(message),...(error instanceof InquiryStreamError&&error.search?{search:error.search}:{})} : message),
          status: "ready", updatedAt: now(), lastError: readError(error),
        }));
      } finally {
        if (requests.current.get(inquiryId)?.id === requestId) {
          requests.current.delete(inquiryId);
          setProgress(current => { const next = { ...current }; delete next[inquiryId]; return next; });
        }
      }
    },
    [updateInquiry, workspace.modelPreferences, codexModels, library.readOnly, library.busy, library.ready, library.entry?.id],
  );

  const handleArticleMouseUp = useCallback(() => {
    if (library.readOnly || library.busy || !library.ready) return;
    window.requestAnimationFrame(() => {
      const article = articleRef.current;
      const selection = window.getSelection();
      if (!article || !selection || selection.isCollapsed) {
        setSelectionDraft(null);setBookmarkDraft(null);
        return;
      }
      // Grow half-selected words before anchoring, so the highlight, draft and saved anchor share one range.
      snapSelectionToWords(selection,article);
      const bookmark=createBookmarkDraft(selection,article,workspace);
      if('error' in bookmark){setBookmarkDraft(null);setSelectionDraft(null);showToast(bookmark.error);return;}
      setBookmarkDraft(bookmark);
      setSelectionDraft(bookmark);setInquirySelectionError('');track('selection-shown');
    });
  }, [showToast, workspace.document.id, workspace.webTranslation, workspace.readingSide, library.readOnly, library.busy, library.ready]);

  const createInquiry = useCallback(
    async (intent: ActiveInquiryIntent, draftOverride?: SelectionDraft, customQuestion?: string, contextHistory?: Inquiry["contextHistory"]) => {
      if (library.readOnly || library.busy || !library.ready) return false;
      const draft = draftOverride ?? selectionDraft;
      if (!draft) return false;
      if (intent === 'verify' && draft.anchor.image && HOSTED && !imageSearchText(draft.anchor.image, draft.anchor.suffix || draft.anchor.prefix)) { showToast('这张图没有可检索的说明文字，暂时无法查找来源；可以解释或问一问。'); return false; }
      if(HOSTED&&!library.entry){const sourceId=workspaceRef.current.document.id,visit=navigationSequence.current,selection=bookmarkDraftRef.current,nativeSelection=window.getSelection()?.toString();try{await library.ensureEntry();}catch(error){showToast(readError(error));return false;}if(workspaceRef.current.document.id!==sourceId||navigationSequence.current!==visit||(!draftOverride&&(bookmarkDraftRef.current!==selection||window.getSelection()?.toString()!==nativeSelection)))return false;}
      if (workspace.activeProviderId === "codex" && (modelsLoading || modelsError || !codexModels.length)) { showToast("请先等待模型列表加载完成，或刷新连接后再试。"); return false; }
      const matches = workspace.inquiries.filter(i => sameAnchor(i.anchor, draft.anchor));
      if (intent === "ask" && (!customQuestion?.trim() || customQuestion.length > 2000)) return false;
      const existing = intentHistory(matches, intent).find(i => intent !== "ask" || i.question === customQuestion?.trim());
      if (existing) {
        updateWorkspace(current => ({ ...current, activeInquiryId: existing.id, visitedInquiryIds: rememberInquiry(current, existing.id), activeTab: { anchorInquiryId: existing.id, intent: categoryIntent(intent) } }));
        setSelectionDraft(null);setBookmarkDraft(null); setMobilePanelOpen(true); openResultPanel(); window.getSelection()?.removeAllRanges(); return true;
      }
      if (matches.some(i => i.status === "answering") || [...pendingCreations.current.values()].some(a => sameAnchor(a, draft.anchor))) return false;
      const createdAt = now();
      const id = newId("inquiry");
      const question = intent === "ask" ? customQuestion!.trim() : draft.anchor.segments ? INTENT_META[intent].prompt('这段完整选区') : INTENT_META[intent].prompt(selectedQuote(draft.anchor));
      const context=selectionContext(articleRef.current,draft.anchor,intent,question);
      const requestError=selectionRequestError(draft.anchor,question,context,intent);if(requestError){showToast(requestError);return false;}
      const userMessage: ThreadMessage = {
        id: newId("message"),
        role: "user",
        content: question,
        createdAt,
        providerId: workspace.activeProviderId,
      };
      const inquiry: Inquiry = {
        id,
        intent,
        question,
        ...(contextHistory?.length ? {contextHistory: copyContextHistory(contextHistory)} : {}),
        anchor: draft.anchor,
        status: "answering",
        messages: [userMessage],
        understanding: "",
        createdAt,
        updatedAt: createdAt,
      };

      updateWorkspace((current) => ({
        ...current,
        inquiries: [...current.inquiries, inquiry],
        activeInquiryId: id,
        activeTab: { anchorInquiryId: id, intent },
      }));
      const request: InquiryRequest = {
        providerId: workspace.activeProviderId,
        ...(draft.anchor.pdf?.kind === "region" && library.entry ? {image:{entryId:library.entry.id,fileHash:draft.anchor.pdf.fileHash,cropId:draft.anchor.pdf.cropId!}} : draft.anchor.image && library.entry ? {image:{kind:"web-media" as const,entryId:library.entry.id,revisionId:draft.anchor.image.revisionId,mediaId:draft.anchor.image.mediaId,resourceId:draft.anchor.image.resourceId}} : {}),
        intent,
        ...(["explain", "ask"].includes(intent) ? {explanationMode:"auto" as const} : {}),
        ...(draft.anchor.scope === "document" ? { readingScope: "document" as const } : {}),
        quote: selectedQuote(draft.anchor),
        context,
        documentTitle: workspace.document.filename,
        question,
        history: copyContextHistory(contextHistory),
      };
      setSelectionDraft(null);setBookmarkDraft(null);
      setMobilePanelOpen(true); openResultPanel();
      window.getSelection()?.removeAllRanges();
      pendingCreations.current.set(id, draft.anchor);
      void askProvider(id, request).finally(() => pendingCreations.current.delete(id));
      return true;
    },
    [askProvider, workspace.inquiries, selectionDraft, updateWorkspace, workspace.activeProviderId, workspace.document.filename, modelsLoading, modelsError, codexModels, showToast, openResultPanel],
  );

  const submitFollowUp = useCallback(
    (action: Refinement) => {
      if (!activeInquiry || groupBusy || !canCompleteInquiry(activeInquiry)) return;
      if (activeInquiry.intent === "verify" || (action === "detail") !== (activeInquiry.intent === "entity")) return;
      if (action === "web" && !activeProvider.supportsWebSearch) return;
      const content = REFINEMENTS[action].prompt;
      const followContext=selectionContext(articleRef.current,activeInquiry.anchor,activeInquiry.intent==='why'?'explain':activeInquiry.intent,content);
      const followError=selectionRequestError(activeInquiry.anchor,content,followContext,activeInquiry.intent==='why'?'explain':activeInquiry.intent);if(followError){showToast(followError);return;}
      const userMessage: ThreadMessage = {
        id: newId("message"),
        role: "user",
        content,
        createdAt: now(),
        providerId: workspace.activeProviderId,
      };
      const history = activeInquiry.messages.filter(m => m.content.trim()).slice(-12).map(({ role, content }) => ({
        role,
        content,
      }));
      updateInquiry(activeInquiry.id, (inquiry) => ({
        ...inquiry,
        messages: [...inquiry.messages, userMessage],
        status: "answering",
        updatedAt: now(),
        lastError: undefined,
      }));
      void askProvider(activeInquiry.id, {
        providerId: workspace.activeProviderId,
        intent: activeInquiry.intent,
        operation: action === "detail" ? "entity" : "explain",
        ...(action !== "detail" ? { explanationMode: action === "web" ? "web" as const : "auto" as const } : {}),
        quote: selectedQuote(activeInquiry.anchor),
        context:followContext,
        documentTitle: workspace.document.filename,
        question: content,
        history,
      });
    }, [activeInquiry, groupBusy, askProvider, updateInquiry, workspace.activeProviderId, workspace.document.filename, activeProvider.supportsWebSearch],
  );

  const submitCustomQuestion = (question: string) => {
    if (!activeInquiry || groupBusy || !modelReady) return false;
    if (activeInquiry.intent !== 'ask') {
      return createInquiry('ask', {anchor:activeInquiry.anchor,context:readingContext(articleRef.current, activeInquiry.anchor),rect:{top:0,left:0,width:0,height:0}}, question, copyContextHistory(activeInquiry.messages));
    }
    if (!question.trim() || question.length > 2000 || requests.current.has(activeInquiry.id)) return false;
    const nextContext=selectionContext(articleRef.current,activeInquiry.anchor,'ask',question);
    const nextError=selectionRequestError(activeInquiry.anchor,question,nextContext,'ask');if(nextError){showToast(nextError);return false;}
    const history = [...(activeInquiry.contextHistory ?? []), ...activeInquiry.messages].filter(m => m.content.trim()).slice(-8).map(({role,content}) => ({role,content:content.slice(0,3000)}));
    updateInquiry(activeInquiry.id, i => ({...i,status:'answering',lastError:undefined,messages:[...i.messages,{id:newId('message'),role:'user',content:question.trim(),createdAt:now()}]}));
    void askProvider(activeInquiry.id, {providerId:workspace.activeProviderId,intent:'ask',operation:'ask',explanationMode:'auto',readingScope:activeInquiry.anchor.scope,quote:selectedQuote(activeInquiry.anchor),context:nextContext,documentTitle:workspace.document.filename,question:question.trim(),history});
    return true;
  };

  const retryInquiry = useCallback(() => {
    track("answer-regenerate");
    if (!activeInquiry || groupBusy || requests.current.has(activeInquiry.id)) return;
    const failed = activeInquiry.messages.at(-1);
    const parentMessageId = failed?.parentMessageId ?? failed?.verification?.parentMessageId;
    const parent = activeInquiry.messages.find(m => m.id === parentMessageId);
    const lastUserMessage = [...activeInquiry.messages]
      .reverse()
      .find((message) => message.role === "user");
    const retryQuestion=lastUserMessage?.content??activeInquiry.question;
    const retryContext=selectionContext(articleRef.current,activeInquiry.anchor,activeInquiry.intent==='why'?'explain':activeInquiry.intent,retryQuestion);
    const retryError=selectionRequestError(activeInquiry.anchor,retryQuestion,retryContext,activeInquiry.intent==='why'?'explain':activeInquiry.intent);if(retryError){showToast(retryError);return;}
    updateInquiry(activeInquiry.id, (inquiry) => ({
      ...inquiry,
      status: "answering",
      lastError: undefined,
    }));
    void askProvider(activeInquiry.id, {
      providerId: workspace.activeProviderId,
      intent: activeInquiry.intent,
      readingScope: activeInquiry.anchor.scope,
      quote: selectedQuote(activeInquiry.anchor),
      context:retryContext,
      documentTitle: workspace.document.filename,
      modelConfig: failed?.modelConfig,
      explanationMode: failed?.explanationMode,
      operation: failed?.operation ?? (activeInquiry.intent === "why" ? "explain" : activeInquiry.intent),
      scope: failed?.scope ?? failed?.verification?.scope ?? "initial", round: failed?.round ?? failed?.verification?.round ?? 1, parentMessageId,
      previous: parent?.verification ? { verification: parent.verification, sources: parent.sources ?? [] } : undefined,
      question: lastUserMessage?.content ?? activeInquiry.question,
      history: [...(activeInquiry.contextHistory ?? []), ...activeInquiry.messages.slice(0, lastUserMessage ? activeInquiry.messages.lastIndexOf(lastUserMessage) : 0)].filter(m => m.content.trim()).slice(-12).map(({ role, content }) => ({ role, content })),
    });
  }, [activeInquiry, groupBusy, askProvider, updateInquiry, workspace.activeProviderId, workspace.document.filename]);

  const cancelInquiry = () => {
    if (!activeInquiry) return;
    const pending = requests.current.get(activeInquiry.id);
    if (!pending) return;
    requests.current.delete(activeInquiry.id);
    pending.controller.abort();
    setProgress(current => { const next = { ...current }; delete next[activeInquiry.id]; return next; });
    updateInquiry(activeInquiry.id, inquiry => ({ ...inquiry, status: "ready", lastError: "已停止本次请求；已收到的内容已保留，可手动重试。", messages: inquiry.messages.map(interruptMessage), updatedAt: now() }));
  };

  const deleteInquiry = (inquiryId: string) => {
    if (!deleteMode || library.readOnly || library.busy || !library.ready) return;
    if (pendingDeleteId !== inquiryId) { setPendingDeleteId(inquiryId); return; }
    const remaining = categoryItems.filter(item => item.id !== inquiryId);
    const index = categoryItems.findIndex(item => item.id === inquiryId);
    const nextId = remaining[Math.min(index, remaining.length - 1)]?.id;
    // Invalidate callbacks before aborting: late output must never restore a deleted thread.
    const request = requests.current.get(inquiryId);
    requests.current.delete(inquiryId);
    request?.controller.abort();
    setProgress(current => { const next = { ...current }; delete next[inquiryId]; return next; });
    setPendingDeleteId(null);
    setFocusedInquiryId(null);
    setPdfTarget(current => current?.id === inquiryId ? null : current);
    updateWorkspace(current => ({
      ...current,
      inquiries: current.inquiries.filter(item => item.id !== inquiryId),
      activeInquiryId: current.activeInquiryId === inquiryId ? null : current.activeInquiryId,
      activeTab: current.activeTab?.anchorInquiryId === inquiryId ? { intent: current.activeTab.intent } : current.activeTab,
    }));
    const documentId = workspace.document.id;
    window.requestAnimationFrame(() => {
      if (workspaceRef.current.document.id !== documentId || workspaceRef.current.activeInquiryId) return;
      const buttons = document.querySelectorAll<HTMLButtonElement>('[data-delete-inquiry-id]');
      ([...buttons].find(button => button.dataset.deleteInquiryId === nextId)
        ?? document.getElementById(nextId ? 'inquiry-delete-toggle' : `intent-tab-${tabIntent}`))?.focus();
    });
  };

  const switchTab = (intent: InquiryIntent, restoreFocus = false) => {
    rememberList();
    navigationSequence.current++;
    setPdfTarget(null);
    restoreListFocus.current = restoreFocus;
    setDeleteMode(false); setPendingDeleteId(null);
    setFocusedInquiryId(null);
    updateWorkspace(current => ({ ...current, activeInquiryId: null, activeTab: { intent } }));
  };
  const changeModel = (config: ModelConfig) => updateWorkspace(current => ({ ...current, modelPreferences: { ...current.modelPreferences, [settingsIntent]: config } }));

  const selectProvider = useCallback(
    (provider: ProviderStatus) => {
      if (provider.id !== "codex") return;
      if (provider.id === "codex" && provider.availability !== "connected") {
        showToast("请使用下方登录 Codex，完成后会自动更新连接状态。");
        return;
      }
      updateWorkspace((current) => ({ ...current, activeProviderId: provider.id }));
      setProviderOpen(false);
    },
    [showToast, updateWorkspace],
  );

  const importFile = library.importFile;

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void importFile(file);
      event.target.value = "";
    },
    [importFile],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void importFile(file);
    },
    [importFile],
  );

  const [sourceFocus, setSourceFocus] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (mobilePanelOpen || !sourceFocus) return;
    if (sourceFocus.isConnected && !sourceFocus.closest('[inert]')) focusReadingTarget(sourceFocus);
    setSourceFocus(null);
  }, [mobilePanelOpen, sourceFocus]);
  const finishSourceNavigation = useCallback((id: string, success: boolean, returnToSource = false, target?: HTMLElement) => {
    if (workspaceRef.current.activeInquiryId !== id) return;
    if (!success) { showToast("原文位置无法恢复，请在原文件中查看；已有回答仍保留。"); return; }
    if (returnToSource && window.matchMedia('(max-width: 780px)').matches) {
      setMobilePanelOpen(false);
      if (target) setSourceFocus(target);
    }
  }, [showToast]);

  const locateInquiry = useCallback((inquiryId: string, returnToSource = false) => {
    const current = workspaceRef.current;
    const inquiry = current.inquiries.find(i => i.id === inquiryId);
    if (inquiry?.anchor.scope === "document") return;
    // PDF stickies always keep their original-page boxes, so an older draft translation still locates there.
    if (current.document.kind !== "pdf" && current.readingSide === "translated" && inquiry?.anchor.translation && (inquiry.anchor.translation.translationId !== current.webTranslation?.id || inquiry.anchor.translation.version !== current.webTranslation?.version)) { showToast("旧译文摘录仍保留；当前译文版本不同，请用对应原文段落回看。"); return; }
    const sequence = ++navigationSequence.current;
    if (!inquiry || inquiry.anchor.matchStatus !== 'matched') { finishSourceNavigation(inquiryId, false); return; }
    if (current.document.kind === 'pdf') {
      const pdf = inquiry.anchor.pdf;
      if (!pdf || pdf.fileHash !== current.document.pdf.resourceId || pdf.page < 1 || pdf.page > current.document.pdf.pages.length) { finishSourceNavigation(inquiryId, false); return; }
      setPdfTarget({id:inquiryId,nonce:sequence,returnToSource});
      return;
    }
    if (inquiry.anchor.image) {
      window.requestAnimationFrame(() => {
        if (sequence !== navigationSequence.current || workspaceRef.current.document !== current.document || workspaceRef.current.activeInquiryId !== inquiryId) return;
        const image = articleRef.current && imageAnchorElement(articleRef.current, inquiry.anchor);
        if (image) { image.classList.add('is-inquiry-target'); window.setTimeout(() => image.classList.remove('is-inquiry-target'), 1400); }
        finishSourceNavigation(inquiryId, !!image && revealReadingTarget(image), returnToSource, image ?? undefined);
      });
      return;
    }
    window.requestAnimationFrame(() => {
      if (sequence !== navigationSequence.current || workspaceRef.current.document !== current.document || workspaceRef.current.activeInquiryId !== inquiryId) return;
      const target = articleRef.current && findInquiryHighlight(articleRef.current, workspaceRef.current.inquiries, inquiryId);
      finishSourceNavigation(inquiryId, !!target && revealReadingTarget(target), returnToSource, target ?? undefined);
    });
  }, [finishSourceNavigation, showToast]);

  const jumpToInquiry = (inquiryId: string) => {
    rememberList();
    if (!activeInquiry) {
      const saved = listPositions.current.get(listKey);
      listPositions.current.set(listKey, {top:saved?.top ?? 0,id:inquiryId});
    }
    setFocusedInquiryId(null);
    updateWorkspace(current => ({ ...current, activeInquiryId: inquiryId, visitedInquiryIds: rememberInquiry(current, inquiryId), activeTab: undefined }));
    setMobilePanelOpen(true); openResultPanel();
    setMobileSidebarOpen(false);
    locateInquiry(inquiryId);
  };

  const openAnchor = (id: string) => {
    const target = preferredInquiry(workspaceRef.current, id);
    if (target) jumpToInquiry(target.id);
  };

  const handleArticleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      const mark = target.closest<HTMLElement>("mark[data-inquiry-id]");
      if (mark?.dataset.inquiryId) openAnchor(mark.dataset.inquiryId);
    },
    [openAnchor],
  );

  const providerControl = <div className="provider-control" ref={providerControlRef}>
              <button
                className="provider-trigger"
                title="AI 连接与模型设置"
                aria-label="AI 连接与模型设置"
                type="button"
                aria-expanded={providerOpen}
                onClick={() => {setProviderOpen((value) => !value);if(HOSTED)void refreshProviders();}}
              >
                <ProviderGlyph id={activeProvider.id} />
                <span>{activeProvider.name}</span>
                <span className={`connection-dot ${activeProvider.availability}`} />
                <ChevronDown size={13} />
              </button>
              <div className="provider-shell" hidden={!providerOpen}>
                <ProviderPopover
                  providers={providers}
                  activeProviderId={workspace.activeProviderId}
                  onSelect={selectProvider}
                  onClose={() => setProviderOpen(false)}
                >
          {HOSTED?<HostedSettings key={String(providerOpen)}/>:<><CodexLogin provider={activeProvider} onConnected={onCodexConnected} />
          <details className="model-settings" open onToggle={event => { if (event.currentTarget.open) void refreshModels(true); }}>
          <summary>模型设置</summary><div className="model-controls">
            <label className="settings-purpose">用途<select aria-label="设置用途" value={settingsIntent} onChange={e => setSettingsIntent(e.target.value as InquiryIntent)}>{NEW_INQUIRY_INTENTS.map(intent => <option key={intent} value={intent}>{INTENT_META[intent].label}</option>)}</select></label>
            {workspace.activeProviderId === "codex" ? <>
              <label>模型<select aria-label="当前用途的模型" disabled={modelsLoading || !!modelsError} value={currentModel.model} onChange={e => {
                const model = codexModels.find(m => m.model === e.target.value);
                if (model) changeModel({ model: model.model, reasoningEffort: model.supportedReasoningEfforts.some(e => e.reasoningEffort === currentModel.reasoningEffort) ? currentModel.reasoningEffort : model.defaultReasoningEffort });
              }}>
                {!selectedModelInfo ? <option value={currentModel.model} disabled>{currentModel.model}（{modelsLoading ? "加载中" : "目录暂不可用"}）</option> : null}
                {codexModels.map(model => <option key={model.model} value={model.model}>{model.displayName}</option>)}
              </select></label>
              <label>推理强度<select aria-label="当前用途的推理强度" disabled={modelsLoading || !!modelsError || !selectedModelInfo} value={currentModel.reasoningEffort} onChange={e => changeModel({ ...currentModel, reasoningEffort: e.target.value })}>
                {!selectedModelInfo?.supportedReasoningEfforts.some(e => e.reasoningEffort === currentModel.reasoningEffort) ? <option value={currentModel.reasoningEffort} disabled>{currentModel.reasoningEffort}</option> : null}
                {selectedModelInfo?.supportedReasoningEfforts.map(effort => <option key={effort.reasoningEffort} value={effort.reasoningEffort} title={effort.description}>{effort.reasoningEffort}</option>)}
              </select></label>
              {!modelsLoading && !modelsError && !supportsConfig(codexModels, currentModel) ? <small role="status">当前目录不支持 {currentModel.model} / {currentModel.reasoningEffort}；已保留设置，不会自动换模型。</small> : null}
              <button type="button" className="refresh-models" disabled={modelsLoading} onClick={() => void refreshModels(true)}>{modelsLoading ? "正在刷新…" : modelsError ? "重试读取模型" : "刷新模型列表"}</button>
              {modelsError ? <small role="alert">{modelsError}</small> : null}
            </> : <small>当前使用 {activeProvider.name}，模型由该连接配置。</small>}
          </div>
          </details></>}
                </ProviderPopover>
              </div>
            </div>;
  return (
    <div
      ref={frameRef}
      className={`app-frame ${showStart ? "start-mode" : ""} ${bookmarksOpen ? "bookmarks-mode" : ""} ${!sidebar.pinned ? "sidebar-collapsed" : ""} ${sidebar.peek ? "sidebar-peek" : ""} ${!resultPanel.expanded ? "result-collapsed" : ""} ${mobileSidebarOpen ? "sidebar-open" : ""} ${mobilePanelOpen ? "panel-open" : ""} ${shareToken ? "share-mode" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setIsDragging(false);
      }}
      onDrop={handleDrop}
      onKeyDown={event => { if (event.key === "Escape" && !event.defaultPrevented) {
        if (providerOpen || (!mobileDrawerOpen && (selectionDraft || bookmarkDraft))) return;
        if (deleteMode) { setDeleteMode(false); setPendingDeleteId(null); document.getElementById("inquiry-delete-toggle")?.focus(); return; }
        if (mobileDrawerOpen) { sidebarDrawer.close(); resultDrawer.close(); return; }
        sidebar.close(); resultPanel.close(); sidebarDrawer.close(); resultDrawer.close(); } }}
    >
      {shareToken && shareBoot !== "off" ? (
        <div className={`share-boot${shareBoot === "error" ? " is-error" : ""}`} role={shareBoot === "error" ? "alert" : "status"}>
          <div className="share-boot-card">
            <span className="share-boot-brand">got it</span>
            {shareBoot === "opening" ? <>
              <span className="share-boot-spinner" aria-hidden="true" />
              <strong>正在打开分享的文章</strong>
              <p>第一次打开需要把文章存到当前浏览器，请稍等。</p>
            </> : <>
              <strong>分享内容没有打开</strong>
              <p>{shareError}</p>
              <button type="button" onClick={() => window.location.reload()}>重新加载</button>
            </>}
          </div>
        </div>
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        accept={HOSTED?".pdf,.md,.markdown,.focus,.json,.gotit":".pdf,.md,.focus,.json,application/pdf,text/markdown,application/json"}
        aria-label="打开 PDF、Markdown 或阅读文档"
        hidden
        onChange={handleFileChange}
      />

      <WebImportDialog library={library}/>
      <div className="sidebar-rail" onMouseEnter={sidebar.reveal} onMouseLeave={sidebar.leave}><button type="button" className="icon-button" aria-label="展开导航" aria-controls="document-navigation" aria-expanded={sidebar.peek} onClick={sidebar.reveal}><PanelLeftOpen size={17} /></button></div>
      <aside id="document-navigation" ref={sidebar.ref} className="left-sidebar" aria-label="文档导航" aria-hidden={showStart||undefined} inert={showStart||(resultPanel.narrow && mobilePanelOpen) || (sidebar.narrow ? !mobileSidebarOpen : !sidebar.pinned && !sidebar.peek)} onMouseEnter={sidebar.cancel} onMouseLeave={sidebar.leave} onBlur={sidebar.leave}>
        <div className="brand-row">
          <button type="button" className="start-brand" aria-label="回到起始页" title="回到起始页" disabled={!library.ready||library.busy} onClick={()=>void returnToStart()}><BrandMark /><strong>got it</strong></button>
          <div className="desktop-sidebar-controls">
            {<button className="icon-button" type="button" aria-label={sidebar.pinned ? "解除固定导航" : "固定导航"} aria-pressed={sidebar.pinned} title={sidebar.pinned ? "解除固定，移开后收起" : "固定导航"} onClick={e => { sidebar.pin(!sidebar.pinned); if(sidebar.pinned && e.detail>0)e.currentTarget.blur(); }}><Pin size={15} fill={sidebar.pinned ? "currentColor" : "none"} /></button>}
          </div>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="关闭导航"
            onClick={() => sidebarDrawer.close()}
          >
            <X size={16} />
          </button>
        </div>

        <ReadingLibraryNavigation library={library} importCopy={() => fileInputRef.current?.click()} />

        <nav className="sidebar-scroll">
          <section className="nav-section">
          {workspace.document.kind === "pdf" && library.entry ? <PdfOutline key={library.entry.id+workspace.document.pdf.resourceId+documentLoadId} entryId={library.entry.id} fileHash={workspace.document.pdf.resourceId} pages={workspace.document.pdf.pages.length} currentPage={pdfCurrentPage} readOnly={library.readOnly} onJump={item=>{bookmarkPreparing.current=null;setBookmarkTarget(null);setBookmarksOpen(false);setPdfDirectoryTarget({documentId:workspace.document.id,item,nonce:Date.now()});setMobileSidebarOpen(false);}}/> : <>
            <div className="section-label">
              <span>{workspace.document.kind === "pdf" ? "PDF 原页" : "文档结构"}</span>
              <span>{workspace.document.kind === "pdf" ? `${workspace.document.pdf.pages.length} 页` : rendered.outline.length}</span>
            </div>
            {workspace.document.kind === "pdf" ? <p className="nav-empty">向下滚动阅读后续页面。页面自动适合宽度，收起左栏可扩大阅读空间。</p> : !rendered.outline.length ? <p className="nav-empty" role="status">本文暂无标题目录。</p> : null}
            <div className="outline-list">
              {rendered.outline.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`outline-item level-${item.level}`}
                  title={item.text}
                  aria-current={currentHeading === item.id ? "location" : undefined}
                  onClick={() => {
                    jumpToHeading(item.id);
                  }}
                >
                  {item.text}
                </button>
              ))}
            </div>
            </>}
          </section>

        </nav>
        <div className="sidebar-bookmark-footer"><button type="button" className="bookmarks-nav" aria-pressed={bookmarksOpen} disabled={!library.ready||library.busy} onClick={()=>void openBookmarks()}><Bookmark size={16} aria-hidden="true"/>全部收藏</button></div>
      </aside>

      {showStart?<ReadingStartPage library={library} workspace={workspace} onFile={()=>{if(library.list.nativePicker)void library.choose();else fileInputRef.current?.click();}} onContinue={enterReading} onNote={id=>{enterReading();requestAnimationFrame(()=>openAnchor(id));}} onBookmarks={()=>void openBookmarks()} onLocateBookmark={locateBookmark} bookmarkVersion={bookmarkVersion} connectionControl={providerControl} covered={bookmarksOpen}/>:null}
      <main className={`reader-column${readerTools.collapsed ? " reader-column--tools-collapsed" : ""}`} aria-hidden={bookmarksOpen||undefined} inert={bookmarksOpen||(sidebar.narrow && mobileSidebarOpen) || (resultPanel.narrow && mobilePanelOpen)}>
        <header className="reader-toolbar" onFocus={readerTools.expand}>
          <div className="toolbar-title">
            <button
              className="icon-button drawer-navigation-trigger"
              ref={sidebarDrawer.triggerRef}
              type="button"
              aria-label="打开导航"
              aria-controls="document-navigation"
              aria-expanded={sidebar.narrow && mobileSidebarOpen}
              onClick={() => setMobileSidebarOpen(true)}
            >
              <PanelLeftOpen size={18} />
            </button>
            <FileText size={15} />
            <div onClick={readerTools.expand}>
              <strong title={workspace.document.filename}>{workspace.document.filename}</strong>
              <span className="document-metadata">{workspace.document.isDemo ? "示例文档" : workspace.document.kind === "web" ? (workspace.document.web.retrieval?.provider === "fxtwitter" ? "X 公开接口保存副本" : workspace.document.web.extractorVersion === "x-browser-visible-v1" ? "X 页面保存副本" : workspace.document.web.coverage === "public-excerpt" ? "网页公开部分副本" : "网页保存副本") : (HOSTED?"浏览器阅读副本":"本地文档")} · {workspace.document.kind === "pdf" ? `${workspace.document.pdf.pages.length} 页 PDF` : workspace.document.markdown.length < 1000 ? `${workspace.document.markdown.length} 字符` : `${Math.round(workspace.document.markdown.length / 1000)}k 字符`}{readingMinutes !== null ? <span className="reading-time"> · 预计阅读 {readingMinutes} 分钟</span> : null}</span>
            </div>
          </div>

          <div className="toolbar-actions">
          <DocumentBookmarks bookmarks={documentBookmarks.bookmarks} loading={documentBookmarks.loading} error={documentBookmarks.error} revisionId={activeBookmarkRevision} disabled={!library.entry||library.busy} displays={bookmarkDisplays} onLocate={locateBookmark} onRetry={bookmarkFeedback.changed} onChanged={bookmarkFeedback.changed}/>
            {!showStart?providerControl:null}
            <button
              className="icon-button drawer-results-trigger"
              ref={resultDrawer.triggerRef}
              type="button"
              aria-label="打开知识贴"
              aria-controls="knowledge-panel"
              aria-expanded={resultPanel.narrow && mobilePanelOpen}
              onClick={() => setMobilePanelOpen(true)}
            >
              <PanelRightOpen size={18} />
            </button>
          </div>
        </header>

        <div className={`reader-tools${HOSTED ? " reader-tools--hosted" : ""}${workspace.document.kind === "web" ? " reader-tools--web" : ""}${workspace.document.kind === "pdf" ? " reader-tools--pdf" : ""}`}>
        <div className="reader-tools-leading">
        <ReadingLibraryStatus library={library} hideWebSource={workspace.document.kind === "web"} onImport={() => fileInputRef.current?.click()} />
        <WebTranslationControls key={workspace.document.id+":"+documentLoadId} workspace={workspace} library={library} saveStatus={saveStatus} showSaveStatus={false} onSide={side => { setSelectionDraft(null);setBookmarkDraft(null);setInquirySelectionError('');window.getSelection()?.removeAllRanges(); const position = capturePosition();updateWorkspace(current=>({...current,readingSide:side})); requestAnimationFrame(()=>restorePosition(position)); }} />
        <ColorSchemeMenu/>
        </div>
        <div className="reader-tools-trailing">
        <div className="library-save-status" role="status">{toolbarSaveStatus}{library.busy ? " · 正在处理…" : ""}</div>
        <div ref={setAdjustmentHost} className="reader-adjustment-layer">
          {workspace.document.kind !== "pdf" ? <div key={workspace.document.id+":"+documentLoadId} className="reading-adjustment-dock"><MarkdownWidthControls width={markdownWidth.width} measuredPercent={markdownWidth.measuredPercent} error={markdownWidth.error} onChange={markdownWidth.change}/></div> : null}
        </div>
        </div>
        <div ref={setPdfToolbarHost} className="reader-status-host" />
        </div>
        <div className="reader-viewport" ref={readerViewportRef}>
        <div key={workspace.document.id+":"+documentLoadId} className={`reader-scroll${workspace.document.kind === "pdf" ? " reader-scroll--pdf" : ""}`} onWheel={readerTools.noteUserScroll} onTouchMove={readerTools.noteUserScroll} onKeyDown={event => { if (isScrollKey(event)) readerTools.noteUserScroll(); }} onScroll={event => { readerTools.onScroll(event.currentTarget); if (!markdownWidth.adjusting.current) library.scrolled(); }}>
          {workspace.document.isDemo && !HOSTED ? (
            <div className="demo-document-note">
              <Sparkles size={15} />
              <span><strong>可直接体验：</strong>选中 “CAGR” 或 “67% 的 35 岁以下成人”，再选择一种追问方式。</span>
              <button type="button" onClick={() => void library.choose()}>换成我的文档</button>
            </div>
          ) : null}
          {workspace.document.kind === "pdf" && library.entry ? <PdfReaderBoundary key={workspace.document.id+documentLoadId} onReload={()=>reloadAfterPreserving(library.returnToStart,()=>window.location.reload())}><Suspense fallback={<p className="pdf-status">正在加载 PDF 阅读器…</p>}><PdfReader translation={workspace.webTranslation} showTranslation={workspace.readingSide==="translated"} toolbarHost={pdfToolbarHost} adjustmentHost={adjustmentHost} onReadingTime={receivePdfMinutes} outlineTarget={pdfDirectoryTarget?.documentId===workspace.document.id?pdfDirectoryTarget:null} onCurrentPage={setPdfCurrentPage} key={workspace.document.id+documentLoadId} document={workspace.document} revisionId={library.entry.revisionId} onBookmarkSaved={finishBookmarkSave} bookmarkCompleted={bookmarkCompleted} bookmarks={currentBookmarks} bookmarkVersion={bookmarkVersion} onBookmarkStarted={beginBookmarkSave} onBookmarkFailed={bookmarkFeedback.failed} bookmarkTarget={bookmarkTarget} onBookmarkLocated={success=>{if(!bookmarkTarget||bookmarkPreparing.current?.nonce!==bookmarkTarget.locateNonce)return;bookmarkPreparing.current=null;if(!success){showToast("无法定位收藏原文，摘录仍保留。");setBookmarksOpen(true);}else setBookmarksOpen(false);setBookmarkTarget(null);}} entryId={library.entry.id} inquiries={workspace.inquiries} activeId={workspace.activeInquiryId} target={pdfTarget} onLocated={finishSourceNavigation} initialPosition={library.initialPosition} readOnly={library.readOnly} hideSaveStatus saveStatus={saveStatus} saveBusy={library.busy} saveError={library.blocked||library.status==="阅读进度暂未保存"} onCreate={createInquiry} requestUnavailable={actionUnavailable({readOnly:!!library.historyId||!!library.recovery,ready:library.ready,busy:library.busy,saveFailed:library.blocked,modelReady,hosted:HOSTED})} onRecover={recoverAction} actionsHidden={providerOpen} onActivate={openAnchor} onReady={library.rendered} onView={library.scrolled}/></Suspense></PdfReaderBoundary> : <article
            ref={articleRef}
            className="markdown-article"
            data-reading-side={workspace.readingSide ?? "original"}
            data-translation-id={workspace.webTranslation?.id}
            data-translation-version={workspace.webTranslation?.version}
            data-width-mode={markdownWidth.width === null ? "recommended" : "custom"}
            style={markdownWidth.width === null ? undefined : { width: `min(100%, max(360px, ${markdownWidth.width}%))` }}
            onMouseUp={handleArticleMouseUp}
            onMouseOver={event => setHoveredMarkId((event.target as Element).closest?.<HTMLElement>("mark[data-inquiry-id]")?.dataset.inquiryId ?? null)}
            onMouseLeave={() => setHoveredMarkId(null)}
            onClick={handleArticleClick}
            dangerouslySetInnerHTML={{ __html: rendered.html }}
          />}
          <footer className="reader-footer">
            <BookOpenText size={15} />
            <span>读到不懂处，选中原文。一次只解决一个知识缺口。</span>
          </footer>
        </div>
        </div>
      </main>

      {workspace.document.kind === "web" ? <><WebImageViewer article={articleRef} documentKey={workspace.document.id+":"+documentLoadId}/><WebMediaRetry key={workspace.document.id+":"+documentLoadId+":"+library.historyId} article={articleRef} web={workspace.document.web} documentKey={workspace.document.id+":"+documentLoadId+":"+rendered.html} disabled={library.readOnly||!library.ready} retry={library.retryWebMedia}/><WebImageActions key={workspace.document.id+":"+documentLoadId} article={articleRef} documentKey={workspace.document.id+":"+documentLoadId} workspace={workspace} entryId={library.entry?.id??""} revisionId={library.entry?.revisionId??""} readOnly={!!library.historyId||!!library.recovery||library.readOnly} busy={library.busy} ready={library.ready} modelReady={modelReady} hidden={showStart||mobileDrawerOpen||bookmarksOpen||providerOpen||!!selectionDraft||!!bookmarkDraft} unavailable={imageUnavailable} saveWarning={saveWarning} onRecover={recoverAction} bookmarkVersion={bookmarkVersion} onBookmarkSaved={finishBookmarkSave} onBookmarkStarted={beginBookmarkSave} onBookmarkFailed={bookmarkFeedback.failed} onCreate={(intent,draft,question)=>createInquiry(intent,draft,question)}/></> : null}
      <div className="result-rail" onMouseEnter={resultPanel.hoverReveal} onMouseLeave={resultPanel.leave}>
        <button ref={resultPanel.triggerRef} type="button" className="icon-button" aria-label="展开知识贴" aria-controls="knowledge-panel" aria-expanded={resultPanel.expanded} onClick={resultPanel.reveal}><PanelRightOpen size={17} /></button>
      </div>
      <aside id="knowledge-panel" ref={resultPanel.ref} className="right-panel" aria-label="活动知识贴" aria-hidden={bookmarksOpen||undefined} inert={bookmarksOpen||(sidebar.narrow && mobileSidebarOpen) || (resultPanel.narrow ? !mobilePanelOpen : !resultPanel.expanded)} onMouseEnter={resultPanel.enter} onMouseLeave={resultPanel.leave} onFocus={resultPanel.cancel} onBlur={resultPanel.deferClose}>
        <PanelResizeHandle panel={resultPanel.ref} onStart={resultPanel.openReading} onCollapse={resultPanel.collapseFromDrag} />

        <div className="panel-mobile-head">
          <span>活动知识贴</span>
          <button className="icon-button" type="button" aria-label="关闭知识贴" onClick={() => resultDrawer.close()}>
            <X size={17} />
          </button>
        </div>
        <div className="panel-desktop-head">
          <div className="desktop-panel-controls">
            <button className="icon-button" type="button" aria-label={resultPinLabel} aria-pressed={resultPinActive} title={resultPinTitle} onClick={event => { if (resultPanel.autoFixed) { resultPanel.close(); return; } resultPanel.pin(!resultPanel.pinned); if (resultPanel.pinned && event.detail > 0) event.currentTarget.blur(); }}><Pin size={15} fill={resultPinActive ? "currentColor" : "none"} /></button>
          </div>
          <div className="inquiry-tabs" role="tablist" aria-label="本文知识贴分类">
            {NEW_INQUIRY_INTENTS.map((intent, index) => {
              const items = intentHistory(workspace.inquiries, intent);
              const Icon = INTENT_ICONS[intent];
              const busy = items.some(i => i.status === "answering");
              return <button key={intent} id={`intent-tab-${intent}`} data-intent={intent} aria-label={`${INTENT_META[intent].label}${items.length ? `(${items.length})` : ""}`} title={`${INTENT_META[intent].label} · ${items.length} 条${busy ? " · 处理中" : ""}`} type="button" role="tab" aria-selected={tabIntent === intent} aria-busy={busy} aria-controls="intent-result" tabIndex={tabIntent === intent || (tabIntent === "why" && index === 0) ? 0 : -1}
                onClick={() => switchTab(intent)} onKeyDown={event => {
                  const tabs=NEW_INQUIRY_INTENTS,active=tabs.indexOf(intent);
                  const next = event.key === "ArrowRight" ? (active + 1) % tabs.length : event.key === "ArrowLeft" ? (active + tabs.length-1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length-1 : -1;
                  if (next < 0) return; event.preventDefault(); switchTab(tabs[next]); document.getElementById(`intent-tab-${tabs[next]}`)?.focus();
                }}><span className="tab-content"><Icon size={16} strokeWidth={1.8} aria-hidden="true" /><span className="tab-label">{INTENT_META[intent].label}</span><span className="tab-short-label" aria-hidden="true" data-label={intent === "explain" ? "解释" : intent === "verify" ? "来源" : "问题"} /></span>{items.length > 0 ? <span className="tab-count">({items.length > 99 ? "99+" : items.length})</span> : null}{busy ? <i className="tab-busy" aria-label="处理中" /> : null}</button>;
            })}
          </div>
        </div>
        {!resultPanel.effectivelyPinned ? <button className="result-collapse-action icon-button" type="button" aria-label="收起知识贴" title="收起知识贴（Esc）" onClick={resultPanel.close}><PanelRightClose size={15} /></button> : null}
        <div ref={listScrollRef} onScroll={rememberList} className={`intent-result${activeInquiry ? "" : " category-view"}`} id="intent-result" role="tabpanel" aria-labelledby={tabIntent !== "why" ? `intent-tab-${tabIntent}` : undefined}>
        {activeInquiry ? <div className="result-navigation">{activeInquiry.anchor.translation ? <button type="button" className="source-excerpt" onClick={()=>{if(activeInquiry.anchor.translation?.translationId!==workspace.webTranslation?.id || activeInquiry.anchor.translation?.version!==workspace.webTranslation?.version){showToast("旧译文摘录仍保留；当前译文版本不同，请用对应原文段落回看。");return;}updateWorkspace(current=>({...current,readingSide:"translated"}));requestAnimationFrame(()=>locateInquiry(activeInquiry.id,true));}}><span>译文摘录：{activeInquiry.anchor.translation.quote}</span></button> : null}<button className="return-to-list" type="button" onClick={() => switchTab(tabIntent, true)}><ChevronLeft size={16} aria-hidden="true" />返回</button>{activeInquiry.anchor.scope === "document" ? <span className="source-excerpt">全文</span> : <button className="source-excerpt" type="button" title={activeInquiry.anchor.quote} aria-label={`定位原文：${activeInquiry.anchor.image ? `图片 · ${activeInquiry.anchor.quote}` : activeInquiry.anchor.pdf?.kind === 'region' ? `第 ${activeInquiry.anchor.pdf.page} 页 · 所选区域` : activeInquiry.anchor.quote}`} onClick={() => { track("source-return"); if(activeInquiry.anchor.translation)updateWorkspace(current=>({...current,readingSide:"original"}));requestAnimationFrame(()=>locateInquiry(activeInquiry.id, true)); }}>{activeInquiry.anchor.image ? <span className="source-page">图片</span> : null}{activeInquiry.anchor.pdf ? <span className="source-page">第 {activeInquiry.anchor.pdf.page} 页{activeInquiry.anchor.pdf.kind === 'region' ? ' · 所选区域' : ''}</span> : null}{activeInquiry.anchor.pdf?.kind !== 'region' ? <span>{activeInquiry.anchor.translation?"对应原文段落：":""}{activeInquiry.anchor.quote}</span> : null}</button>}</div> : null}
          <div hidden={!!activeInquiry} className="category-heading category-toolbar"><strong>本文的{tabIntent === "ask" ? "问题" : INTENT_META[tabIntent].shortLabel}</strong><div className="category-heading-actions"><span>{categoryItems.length} 条</span>
            <button id="inquiry-delete-toggle" className="category-delete-toggle" type="button" aria-label={deleteMode ? "退出删除模式" : "删除知识贴"} title={deleteMode ? "退出删除模式（Esc）" : "删除知识贴"} aria-pressed={deleteMode}
              disabled={!categoryItems.length || library.readOnly || library.busy || !library.ready}
              onClick={() => { setDeleteMode(value => !value); setPendingDeleteId(null); }}><Trash2 size={16} aria-hidden="true" /></button>
          </div></div>
        <nav hidden={!!activeInquiry} className="category-items" aria-label={`${INTENT_META[tabIntent].label}条目`}>
          {categoryItems.length ? categoryItems.map(item => <div className="category-row" key={item.id}>
            <button className="category-open" type="button" data-inquiry-id={item.id} data-source-hover={hoveredMarkInquiry && (item.id === hoveredMarkInquiry.id || sameAnchor(item.anchor, hoveredMarkInquiry.anchor)) ? "true" : undefined} aria-current={activeInquiry?.id === item.id ? "true" : undefined} onFocus={() => setFocusedInquiryId(item.id)} onBlur={() => setFocusedInquiryId(null)} onClick={() => jumpToInquiry(item.id)}>
              <span>{item.intent === "ask" ? item.question : selectedQuote(item.anchor)}{item.intent === "ask" ? <small className="question-anchor">{selectedQuote(item.anchor)}</small> : null}</span><small>{inquiryCategoryStatus(item)}</small>{categoryItems.filter(other => other.anchor.quote === item.anchor.quote).length > 1 ? <small className="inquiry-identity">{new Date(item.messages.at(-1)?.createdAt ?? item.updatedAt).toLocaleDateString()} · {(item.messages.filter(message => message.role === "assistant").at(-1)?.content || item.question).replace(/[#*_`]/g, "").slice(0, 56)}</small> : null}
            </button>
            {deleteMode ? <button className={`category-delete${pendingDeleteId === item.id ? " confirming" : ""}`} type="button" data-delete-inquiry-id={item.id}
              aria-label={`${pendingDeleteId === item.id ? "确认删除知识贴" : "删除知识贴"}：${item.anchor.quote}`}
              title={pendingDeleteId === item.id ? "再次点击，删除此知识贴及全部回答" : "删除此知识贴"}
              onBlur={() => setPendingDeleteId(null)} onClick={() => deleteInquiry(item.id)}><Trash2 size={16} fill={pendingDeleteId === item.id ? "currentColor" : "none"} aria-hidden="true" /></button> : null}
          </div>) : <p>{tabIntent === "ask" ? "可以向全文提问，也可以选中原文问一问。" : <>还没有{INTENT_META[tabIntent].label}条目。在原文选中文字，再选择“{INTENT_META[tabIntent].label}”即可创建。</>}</p>}
          {tabIntent === "ask" ? <div className="document-question-entry"><ActionAvailability unavailable={actionUnavailable({readOnly:!!library.historyId||!!library.recovery,ready:library.ready,busy:library.busy,saveFailed:library.blocked,generating:documentQuestionBusy,modelReady,hosted:HOSTED})} onRecover={recoverAction} saveWarning={saveWarning}>
            {documentQuestionOpen ? <QuestionComposer initialOpen disabled={documentQuestionBusy || library.readOnly || library.busy || !library.ready || !modelReady} onClose={() => setDocumentQuestionOpen(false)} onSubmit={question => createInquiry("ask", { anchor: documentAnchor(workspace.document), context: "", rect: { top: 0, left: 0, width: 0, height: 0 } }, question)} /> : <button className="document-question-trigger" type="button" disabled={documentQuestionBusy || library.readOnly || library.busy || !library.ready || !modelReady} onClick={() => setDocumentQuestionOpen(true)}><span aria-hidden="true">＋</span>向全文提问</button>}
          </ActionAvailability></div> : null}
        </nav>
        {activeInquiry && activeInquiry.anchor.scope !== "document" && group.length > 1 ? <nav className="anchor-requests" aria-label="这处原文的已有结果"><small>这处原文</small>{(['explain','verify','ask','why'] as InquiryIntent[]).flatMap(intent => {
          const items = intentHistory(group, intent);
          const remembered = intent === 'ask' ? [...(workspace.visitedInquiryIds ?? [])].reverse().map(id => items.find(i => i.id === id)).find(Boolean) : undefined;
          const visible = (remembered ? [remembered] : items).slice(0, 1);
          return visible.map(item => <button type="button" key={item.id} title={intent === 'ask' ? '我的问题' : INTENT_META[intent].shortLabel} aria-current={categoryIntent(activeInquiry.intent) === intent ? 'true' : undefined} onClick={() => { if (categoryIntent(activeInquiry.intent) !== intent) jumpToInquiry(item.id); }}>{intent === 'ask' ? '我的问题' : INTENT_META[intent].shortLabel}</button>);
        })}</nav> : null}
        {activeInquiry ? (
          <InquiryPanel
            key={activeInquiry.id}
            inquiry={activeInquiry}
            unavailable={actionUnavailable({readOnly:!!library.historyId||!!library.recovery,ready:library.ready,busy:library.busy,saveFailed:library.blocked,generating:groupBusy,modelReady,hosted:HOSTED})}
            onRecover={recoverAction}
            saveWarning={saveWarning}
            groupBusy={groupBusy || library.readOnly || library.busy}
            groupGenerating={groupBusy}
            modelReady={modelReady && !library.readOnly && !library.busy}
            onCancel={cancelInquiry}
            provider={activeProvider}
            onFollowUp={submitFollowUp}
            onQuestion={submitCustomQuestion}
            onRetry={retryInquiry}
            progress={progress[activeInquiry.id]}
            relatedHistory={history.length > 1 && tabIntent !== "ask" && tabIntent !== "verify" ? <details className="answer-history related-history"><summary>同处原文的历史记录</summary><label className="history-picker">历史记录<select aria-label="历史记录" value={activeInquiry.id} onChange={e => jumpToInquiry(e.target.value)}>{history.map(i => <option key={i.id} value={i.id}>{new Date(i.updatedAt).toLocaleString()} · {i.question}</option>)}</select></label></details> : null}
          />
        ) : (
          categoryItems.length ? <div className="empty-intent"><p>选择上方条目查看结果。</p></div> : null
        )}
        </div>
      </aside>

      {bookmarksOpen?<BookmarksView onChanged={bookmarkFeedback.changed} version={bookmarkVersion} onClose={closeBookmarks} onLocate={locateBookmark}/>:null}
      {bookmarkFailure?<div className="bookmark-toast" role="alert"><span>收藏失败：{bookmarkFailure.error}（{bookmarkQuote(bookmarkFailure.request.anchor).slice(0,36)}）</span><button type="button" disabled={bookmarkRetrying} onClick={()=>void bookmarkFeedback.retry(finishBookmarkSave)}>{bookmarkRetrying?'保存中…':'重试收藏'}</button><button type="button" onClick={bookmarkFeedback.closeFailure}>关闭</button></div>:null}
      <span className="bookmark-live" role="status" aria-live="polite">{bookmarkNotice?'已收藏':''}</span>
      {bookmarkDraft && !bookmarksOpen ? (
        <SelectionToolbar
          draft={bookmarkDraft}
          hidden={mobileDrawerOpen || providerOpen}
          article={articleRef.current}
          hint={inquirySelectionError}
          unavailable={selectionUnavailable}
          onRecover={recoverAction}
          saveWarning={saveWarning}
          bookmark={(library.entry||HOSTED)&&!library.readOnly?<BookmarkAction prepareEntry={!library.entry?library.ensureEntry:undefined} entryId={library.entry?.id??""} revisionId={library.entry?.revisionId??""} anchor={bookmarkDraft.anchor} iconOnly onSaved={finishBookmarkSave} version={bookmarkVersion} onStarted={beginBookmarkSave} onFailed={bookmarkFeedback.failed}/>:null}
          onSelect={(intent, question) => createInquiry(intent, undefined, question)}
          disabled={!selectionDraft || !modelReady || workspace.inquiries.some(i => i.status === "answering" && sameAnchor(i.anchor, selectionDraft.anchor)) || library.readOnly || library.busy}
          onClose={() => {
            setSelectionDraft(null);setBookmarkDraft(null);setInquirySelectionError('');
            window.getSelection()?.removeAllRanges();
          }}
        />
      ) : null}

      {isDragging ? (
        <div className="drop-overlay">
          <div>
            <Upload size={24} />
            <strong>放下 PDF、Markdown 或阅读文档</strong>
            <span>当前文档不会被修改</span>
          </div>
        </div>
      ) : null}

      {(sidebar.narrow && mobileSidebarOpen) || (resultPanel.narrow && mobilePanelOpen) ? (
        <button
          className="mobile-scrim"
          type="button"
          aria-label="关闭面板"
          onClick={() => {
            sidebarDrawer.close(!mobilePanelOpen);
            resultDrawer.close(true);
          }}
        />
      ) : null}

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}

function BrandMark() {
  return (
    <img className="brand-mark" src={brandIcon} width={29} height={29} alt="" aria-hidden="true" />
  );
}

function ProviderGlyph({ id }: { id: ProviderId }) {
  if (id === "codex") return <Terminal size={15} />;
  if (id === "deepseek") return <Bot size={15} />;
  return <Sparkles size={15} />;
}

interface ProviderPopoverProps {
  children?: ReactNode;
  providers: ProviderStatus[];
  activeProviderId: ProviderId;
  onSelect: (provider: ProviderStatus) => void;
  onClose: () => void;
}

function ProviderPopover({
  children,
  providers,
  activeProviderId,
  onSelect,
  onClose,
}: ProviderPopoverProps) {
  return (
    <div className="provider-popover">
      <div className="popover-head">
        <div>
          <strong>AI 设置</strong>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭 AI 设置"><X size={14} /></button>
      </div>

      <div className="provider-list">
        {providers.map((provider) => (
          <button
            key={provider.id}
            className={`provider-option ${provider.id === activeProviderId ? "active" : ""}`}
            type="button"
            onClick={() => onSelect(provider)}
          >
            <span className="provider-option-icon"><ProviderGlyph id={provider.id} /></span>
            <span className="provider-option-copy">
              <strong>{provider.name}{provider.localOnly ? <em>本地</em> : null}</strong>
              <small>{provider.detail || provider.description}</small>
            </span>
            {provider.availability === "connected" && provider.id === activeProviderId ? <Check size={15} /> : (
              <span className={`availability-label ${provider.availability}`}>
                {provider.availability === "connected" ? "已连接" : provider.availability === "checking" ? "检查中" : "未连接"}
              </span>
            )}
          </button>
        ))}
      </div>

      {children}
    </div>
  );
}

function SelectionToolbar({
  draft,
  onSelect,
  onClose,
  disabled,
  bookmark,
  hint,
  unavailable,
  onRecover,
  saveWarning,
  hidden = false,
  article,
}: {
  draft: BookmarkDraft;
  hidden?: boolean;
  article?: HTMLElement | null;
  hint?:string;
  unavailable?:ActionUnavailable;
  saveWarning?:boolean;
  onRecover?:(target:"connection"|"save")=>void;
  bookmark?: ReactNode;
  onSelect: (intent: ActiveInquiryIntent, question?: string) => void | boolean | Promise<void | boolean>;
  disabled?: boolean;
  onClose: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  // Measure the real toolbar height before revealing it: the composer and
  // warning rows change the height, and guessing it was the original bug.
  useLayoutEffect(() => {
    const element = surface.current;
    if (!element || hidden) return;
    let ranges = article ? bookmarkDomRanges(article, draft.anchor) : null;
    let canResolve = !!ranges?.length;
    const resolveRanges = () => {
      if (!canResolve) return null;
      if (!ranges?.length || ranges.some(range => !range.startContainer.isConnected)) {
        ranges = article ? bookmarkDomRanges(article, draft.anchor) : null;
        canResolve = !!ranges?.length;
      }
      return ranges;
    };
    const currentRect = () => {
      const live = resolveRanges();
      return live?.length ? unionRangeRect(live) : null;
    };
    const hide = () => {
      element.style.visibility = "hidden";
      if (element.contains(document.activeElement) && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };
    const place = () => {
      const anchor = currentRect();
      // Keep the toolbar attached to the selection while the article scrolls;
      // when the selection leaves the viewport, hide it instead of parking it
      // at the old screen position. If the anchor cannot be resolved, hiding is
      // safer than silently following a stale rectangle.
      if (!anchor || anchor.bottom < 0 || anchor.top > window.innerHeight) {
        hide();
        return;
      }
      const placement = selectionToolbarPlacement(
        anchor,
        { width: element.offsetWidth, height: element.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      );
      element.style.left = `${placement.left}px`;
      element.style.top = `${placement.top}px`;
      element.style.visibility = "visible";
      element.dataset.placement = placement.side;
    };
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; place(); });
    };
    place();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    observer?.observe(element);
    if (article) observer?.observe(article);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [draft, hidden, article]);
  return (
    <div
      ref={surface}
      className="selection-toolbar selection-surface"
      hidden={hidden}
      inert={hidden}
      style={{ visibility: "hidden" }}
      onMouseDown={(event) => { if (!(event.target instanceof HTMLTextAreaElement)) event.preventDefault(); }}
    >
      {/* The source highlight shows what is selected; the accessible name keeps the quote, and no visual quote row is rendered in any state. */}
      <div className="selection-understanding" role="group" aria-label={`选中的原文：${selectionLabel(bookmarkQuote(draft.anchor))}`}>
      {hint?<p className="bookmark-selection-hint">{hint}</p>:null}
      <SelectionActions bookmark={bookmark} onSelect={onSelect} onClose={onClose} disabled={disabled} unavailable={unavailable} onRecover={onRecover} saveWarning={saveWarning}/></div>
    </div>
  );
}

function selectionLabel(quote: string) {
  const chars = [...quote];
  return chars.length > 80 ? `${chars.slice(0, 80).join("")}…` : quote;
}

function unionRangeRect(ranges: Range[]) {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let found = false;
  for (const range of ranges) {
    const rects = typeof range.getClientRects === "function" ? [...range.getClientRects()] : [];
    if (!rects.length) {
      const rect = typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
      if (rect && (rect.width > 0 || rect.height > 0)) rects.push(rect);
    }
    for (const rect of rects) {
      if (rect.width <= 0 && rect.height <= 0) continue;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
      found = true;
    }
  }
  return found ? { left, top, width: right - left, height: bottom - top, bottom } : null;
}

interface InquiryPanelProps {
  onCancel: () => void;
  modelReady: boolean;
  unavailable?:ActionUnavailable;
  saveWarning?:boolean;
  onRecover?:(target:"connection"|"save")=>void;
  groupBusy: boolean;
  groupGenerating: boolean;
  inquiry: Inquiry;
  provider: ProviderStatus;
  onFollowUp: (action: Refinement) => void;
  onRetry: () => void;
  onQuestion: (question: string) => void;
  progress?: string;
  relatedHistory?: ReactNode;
}

function InquiryPanel({
  unavailable,
  onRecover,
  saveWarning,
  onCancel,
  modelReady,
  groupBusy,
  groupGenerating,
  inquiry,
  provider,
  onFollowUp,
  onRetry,
  onQuestion,
  progress,
  relatedHistory,
}: InquiryPanelProps) {
  const latestAssistant = [...inquiry.messages]
    .reverse()
    .find((message) => message.role === "assistant");

  const actionsEnabled = !groupBusy && canCompleteInquiry(inquiry);
  const latestRequestFailed = !!(inquiry.lastError || latestAssistant?.completion === "interrupted" || latestAssistant?.verification?.completion === "interrupted" || latestAssistant?.search?.status === "failed");
  const verificationRetryVisible = inquiry.intent === "verify" && inquiry.status !== "answering" && latestRequestFailed;
  const recheckDisabledReason = groupBusy ? "当前请求正在进行，请等待完成或先停止" : !modelReady ? "请先连接可用模型" : !provider.supportsWebSearch ? "当前提供方不支持联网查找来源，请切换支持搜索的提供方" : undefined;
  const followUpDisabledReason = groupBusy ? "当前请求正在进行，请等待完成或先停止" : !modelReady ? "请先连接可用模型" : !actionsEnabled ? "需要完整回答后才能继续；失败或中断时请重试" : undefined;
  const threadRef = useRef<HTMLDivElement>(null);
  // Reset only for a new reply, never for streaming chunks or completion changes.
  useLayoutEffect(() => { if (threadRef.current) threadRef.current.scrollTop = 0; }, [inquiry.id, latestAssistant?.id]);

  return (
    <div className="inquiry-panel-content">
      <div className="thread-scroll" ref={threadRef}>
        {inquiry.anchor.matchStatus === "needs-relink" ? <p className="anchor-warning">原文位置需要重新确认</p> : null}
        {inquiry.intent === "ask" ? <div className="current-question"><small>我的问题{inquiry.anchor.scope === "document" ? " · 全文" : ""}</small><h2>{[...inquiry.messages].reverse().find(m => m.role === "user")?.content ?? inquiry.question}</h2></div> : null}
        <div className="thread-messages">
          {latestAssistant ? <AssistantMessage message={latestAssistant} failure={inquiry.lastError} verification={inquiry.intent === "verify"} entity={inquiry.intent === "entity"} /> : null}
          {inquiry.status === "answering" && latestAssistant ? <RequestStatus key={latestAssistant.requestId ?? latestAssistant.id} startedAt={latestAssistant.createdAt} hasText={!!latestAssistant.content.trim()} progress={progress} /> : null}
          {latestAssistant?.mode === "demo" && inquiry.status !== "answering" ? (
            <button className="secondary-action" type="button" onClick={onRetry}><RefreshCw size={13} /> 用真实模型回答</button>
          ) : null}
          {inquiry.lastError && !(latestAssistant && (latestAssistant.operation ? latestAssistant.operation === "verify" : inquiry.intent === "verify")) ? (
            <div className={inquiry.lastError.startsWith("已停止") ? "stopped-card" : "error-card"}>
              <CircleAlert size={16} />
              <div><strong>{inquiry.lastError.startsWith("已停止") ? "你已停止生成" : inquiry.intent === "verify" ? "查找失败" : "请求失败"}</strong><p>{inquiry.lastError}</p></div>
            </div>
          ) : null}
        </div>

      <ActionAvailability unavailable={unavailable} onRecover={onRecover} saveWarning={saveWarning}><footer className="inquiry-actions compact-actions">
        {verificationRetryVisible ? (
          <button className="secondary-action verify-again-action" type="button" disabled={!!recheckDisabledReason} title={recheckDisabledReason} aria-describedby={recheckDisabledReason ? "recheck-unavailable" : undefined} onClick={onRetry}>重试</button>
        ) : inquiry.intent === "entity" ? (
          <button type="button" className="secondary-action detail-introduction-action" disabled={!!followUpDisabledReason} title={followUpDisabledReason} aria-describedby={followUpDisabledReason ? "followup-unavailable" : undefined} onClick={() => onFollowUp("detail")}>
            详细介绍
          </button>
        ) : null}
        {inquiry.intent !== "verify" && inquiry.status !== "answering" && (inquiry.lastError || latestAssistant?.completion === "interrupted" || latestAssistant?.verification?.completion === "interrupted" || latestAssistant?.search?.status === "failed") ? (
          <button className="secondary-action regenerate-action" type="button" disabled={groupBusy} onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />重新生成</button>
        ) : null}
        {inquiry.status === "answering" ? <button className="secondary-action stop-action" type="button" onClick={onCancel}>停止本次请求</button> : null}
      <QuestionComposer prompt={inquiry.intent === "explain" || inquiry.intent === "why" || inquiry.intent === "verify" ? "还是不懂？" : undefined} disabled={groupBusy || !modelReady} hideTrigger={inquiry.intent !== "ask" && (groupGenerating || latestRequestFailed)} followUp={inquiry.intent === "ask"} onSubmit={onQuestion} />
      </footer></ActionAvailability>
      {inquiry.intent === "entity" && followUpDisabledReason ? <p className="recheck-unavailable" id="followup-unavailable">{followUpDisabledReason}</p> : null}
      {verificationRetryVisible && recheckDisabledReason ? <p className="recheck-unavailable" id="recheck-unavailable">{recheckDisabledReason}</p> : null}
          {inquiry.intent !== "verify" && inquiry.messages.filter(message => message.role === "assistant" && message.id !== latestAssistant?.id).length ? <details className="answer-history"><summary>历史回答</summary>{inquiry.messages.filter(message => message.role === "assistant" && message.id !== latestAssistant?.id).map(message => <AssistantMessage key={message.id} message={message} history verification={inquiry.intent === "verify"} entity={inquiry.intent === "entity"} />)}</details> : null}
      {relatedHistory}
      </div>
    </div>
  );
}


export function RequestStatus({ startedAt, hasText, progress }: { startedAt: string; hasText: boolean; progress?: string }) {
  const started = new Date(startedAt).getTime();
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, (clock - started) / 1000);
  const searching = progress?.includes("搜索") || progress?.includes("核对");
  return <>
    <div className="request-status"><span>{hasText ? "已用时" : progress ?? "正在处理"}</span><time aria-label="本次请求已用时间">{elapsed.toFixed(1)}s</time></div>
    {!hasText && elapsed >= 8 ? <div className="waiting-toast" role="status">请再稍等一下，我正在{searching ? "查找资料" : "整理答案"}…</div> : null}
  </>;
}

export default App;
