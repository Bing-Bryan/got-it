import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { MoreHorizontal } from "lucide-react";
import { BookmarkAction } from "./BookmarkAction";
import { SelectionActions, type SelectionActionReasons } from "./SelectionActions";
import { createImageBookmarkDraft, type BookmarkDraft } from "./lib/bookmark-selection";
import { isImageActionableMedia, imageSearchText } from "./lib/image-actions";
import { sameAnchor } from "./lib/inquiry-tabs";
import type { ActionUnavailable } from "./lib/action-availability";
import type { BookmarkCreate, BookmarkResult } from "./lib/bookmark-types";
import type { ActiveInquiryIntent, Workspace } from "./types";
import type { WebMedia } from "./lib/web-data";
import { HOSTED } from "./lib/runtime-mode";

interface Target {
  image: HTMLImageElement;
  media: WebMedia;
  draft: BookmarkDraft;
}

export function WebImageActions({
  article,
  documentKey,
  workspace,
  entryId,
  revisionId,
  readOnly,
  busy,
  ready,
  modelReady,
  hidden,
  unavailable,
  saveWarning,
  onRecover,
  bookmarkVersion,
  onBookmarkSaved,
  onBookmarkStarted,
  onBookmarkFailed,
  onCreate,
}: {
  article: RefObject<HTMLElement | null>;
  documentKey: string;
  workspace: Workspace;
  entryId: string;
  revisionId: string;
  readOnly: boolean;
  busy: boolean;
  ready: boolean;
  modelReady: boolean;
  hidden?: boolean;
  unavailable?: ActionUnavailable;
  saveWarning?: boolean;
  onRecover?: (target: "connection" | "save") => void;
  bookmarkVersion: number;
  onBookmarkSaved: (result: BookmarkResult, request: BookmarkCreate) => void;
  onBookmarkStarted?: (request: BookmarkCreate) => void;
  onBookmarkFailed?: (request: BookmarkCreate, error: string) => void;
  onCreate: (intent: ActiveInquiryIntent, draft: BookmarkDraft, question?: string) => void | boolean | Promise<void | boolean>;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  const [touch, setTouch] = useState(false);
  const [triggers, setTriggers] = useState<Array<{ image: HTMLImageElement; media: WebMedia; left: number; top: number }>>([]);
  const root = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const suppressFocusOpen = useRef(false);
  const suppressOpen = useRef(false);
  const targetRef = useRef<Target | null>(null);
  targetRef.current = target;

  const mediaFor = useCallback((image: HTMLImageElement): WebMedia | undefined => {
    if (workspace.document.kind !== "web") return;
    const media = workspace.document.web.media.find((item) => item.id === image.dataset.webMedia);
    if (!media || !image.dataset.webResource || image.dataset.webResource !== media.resourceId) return;
    return isImageActionableMedia(media) ? media : undefined;
  }, [workspace]);

  const positionFor = useCallback((image: HTMLImageElement) => {
    const rect = image.getBoundingClientRect();
    const width = Math.min(510, Math.max(240, window.innerWidth - 24));
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 12), Math.max(12, window.innerWidth - width - 12));
    // Overlay the image's lower edge instead of pushing the bar into the next paragraph.
    const bottom = Math.max(8, Math.min(window.innerHeight - rect.bottom + 8, Math.max(12, window.innerHeight - 76)));
    return { left, bottom };
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const close = useCallback((returnFocus = true) => {
    cancelClose();
    const current = targetRef.current;
    if (returnFocus) {
      suppressOpen.current = true;
      window.setTimeout(() => { suppressOpen.current = false; }, 250);
    } else {
      suppressOpen.current = false;
    }
    setTarget(null);
    setPosition(null);
    if (returnFocus && current?.image.isConnected) {
      suppressFocusOpen.current = true;
      current.image.focus({ preventScroll: true });
      window.setTimeout(() => { suppressFocusOpen.current = false; }, 0);
    }
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => close(false), 160);
  }, [cancelClose, close]);

  const open = useCallback((image: HTMLImageElement) => {
    if (suppressOpen.current) return;
    const media = mediaFor(image);
    if (!media) return;
    const draft = createImageBookmarkDraft(workspace, revisionId, media, image);
    if ("error" in draft) return;
    cancelClose();
    setTarget({ image, media, draft });
    setPosition(positionFor(image));
  }, [cancelClose, mediaFor, positionFor, revisionId, workspace]);

  useEffect(() => {
    const element = article.current;
    if (!element) return;
    const imageFrom = (event: Event): HTMLImageElement | null => {
      const node = event.target;
      return node instanceof Element ? node.closest<HTMLImageElement>("img[data-web-media]") : null;
    };
    const enter = (event: Event) => {
      if (event.type === "focusin" && suppressFocusOpen.current) return;
      const image = imageFrom(event);
      if (image) open(image);
    };
    const leave = (event: Event) => {
      const image = imageFrom(event);
      if (!image) return;
      const to = (event as PointerEvent | FocusEvent).relatedTarget;
      if (to instanceof Node && (root.current?.contains(to) || (to instanceof Element && to.closest("img[data-web-media]") === image))) return;
      scheduleClose();
    };
    const click = (event: Event) => { if (imageFrom(event)) close(false); };
    const key = (event: KeyboardEvent) => { if ((event.key === "Enter" || event.key === " ") && imageFrom(event)) close(false); };
    element.addEventListener("pointerover", enter);
    element.addEventListener("pointerout", leave);
    element.addEventListener("focusin", enter);
    element.addEventListener("focusout", leave);
    element.addEventListener("click", click);
    element.addEventListener("keydown", key);
    return () => {
      element.removeEventListener("pointerover", enter);
      element.removeEventListener("pointerout", leave);
      element.removeEventListener("focusin", enter);
      element.removeEventListener("focusout", leave);
      element.removeEventListener("click", click);
      element.removeEventListener("keydown", key);
    };
  }, [article, close, documentKey, open, scheduleClose]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const enter = () => cancelClose();
    const leave = (event: PointerEvent) => {
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      scheduleClose();
    };
    element.addEventListener("pointerenter", enter);
    element.addEventListener("pointerleave", leave);
    return () => {
      element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointerleave", leave);
    };
  }, [cancelClose, scheduleClose, target]);

  useEffect(() => {
    if (!target) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [close, target]);

  useEffect(() => {
    if (!target) return;
    const update = () => {
      if (!target.image.isConnected) { close(false); return; }
      const rect = target.image.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) { close(false); return; }
      setPosition(positionFor(target.image));
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    update();
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [close, positionFor, target]);

  useEffect(() => {
    if (hidden) close(false);
  }, [close, hidden]);

  useEffect(() => {
    const query = typeof window !== "undefined" ? window.matchMedia?.("(hover: none)") : undefined;
    if (!query) return;
    const update = () => setTouch(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!touch) { setTriggers([]); return; }
    const element = article.current;
    if (!element) { setTriggers([]); return; }
    let frame = 0;
    const update = () => {
      const next: Array<{ image: HTMLImageElement; media: WebMedia; left: number; top: number }> = [];
      for (const image of element.querySelectorAll<HTMLImageElement>("img[data-web-media]")) {
        const media = mediaFor(image);
        if (!media) continue;
        const rect = image.getBoundingClientRect();
        if (rect.bottom < 8 || rect.top > window.innerHeight - 8) continue;
        next.push({ image, media, left: Math.max(8, rect.right - 44), top: Math.max(8, rect.bottom - 44) });
      }
      setTriggers(next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [article, mediaFor, touch, documentKey]);

  const searchText = target ? imageSearchText(target.media, target.draft.anchor.suffix || target.draft.anchor.prefix) : "";
  const actionReasons: SelectionActionReasons | undefined = HOSTED && target && !searchText
    ? { verify: "这张图没有可检索的说明文字，暂时无法查找来源；可以解释或问一问。" }
    : undefined;
  const generating = !!target && workspace.inquiries.some((inquiry) => inquiry.status === "answering" && sameAnchor(inquiry.anchor, target.draft.anchor));
  const actionsDisabled = readOnly || busy || !ready || !modelReady || !entryId || generating;
  const actionUnavailable = unavailable ?? (generating ? { reason: 'generating' as const, message: '同一张图片的请求正在生成，请等待完成或到右侧停止。' } : undefined);
  const submit = async (intent: ActiveInquiryIntent, question?: string) => {
    if (!target || actionsDisabled) return false;
    if (intent === "verify" && actionReasons?.verify) return false;
    return onCreate(intent, target.draft, question);
  };

  return <>
    {touch ? triggers.map(({ image, media, left, top }) => <button
      key={media.id}
      type="button"
      className="web-image-actions-trigger"
      style={{ left, top }}
      aria-label={`图片操作：${media.alt || media.caption || "未命名图片"}`}
      title="图片操作"
      onClick={() => open(image)}
    ><MoreHorizontal size={17} aria-hidden="true" /></button>) : null}
    {target && position ? <div ref={root} className="image-actions-toolbar selection-surface" role="toolbar" aria-label="图片操作" style={{ left: position.left, bottom: position.bottom }}>
      <SelectionActions
        bookmark={entryId && revisionId && !readOnly ? <BookmarkAction
          entryId={entryId}
          revisionId={revisionId}
          anchor={target.draft.anchor}
          iconOnly
          subject="image"
          version={bookmarkVersion}
          onSaved={(result, request) => { const image = target.image; onBookmarkSaved(result, request); image.classList.add('is-bookmark-target'); window.setTimeout(() => image.classList.remove('is-bookmark-target'), 1400); close(false); }}
          onStarted={onBookmarkStarted}
          onFailed={onBookmarkFailed}
        /> : null}
        onSelect={submit}
        onClose={() => close(true)}
        disabled={actionsDisabled}
        unavailable={actionUnavailable}
        actionReasons={actionReasons}
        saveWarning={saveWarning}
        onRecover={onRecover}
        className="image-card-actions"
        closeTitle="关闭图片操作"
      />
    </div> : null}
  </>;
}
