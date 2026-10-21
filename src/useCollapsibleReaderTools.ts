import { useCallback, useEffect, useRef, useState } from "react";

/** Narrow screens fold the reading tool rows while reading downward; callers disable folding for any state needing attention. */
export const READER_TOOLS_COLLAPSE_QUERY = "(max-width: 560px)";
const EXPAND_AFTER_UPWARD_PX = 24;
// Folding resizes the scroll box, and the browser may clamp scrollTop; ignore that echo instead of toggling back.
const TOGGLE_SETTLE_MS = 250;
// Only the reader's own wheel, touch or scrolling keys may fold; taps, links, restoring a position or jumping to a heading never do.
const USER_INTENT_MS = 800;

export interface ReaderScrollMetrics { scrollTop: number; clientHeight: number }
export interface CollapseTracker { last: number; upward: number; settleUntil: number }

/** Pure step: next folded state for one scroll event, or null to keep the current one. */
export function nextCollapsed(tracker: CollapseTracker, scroll: ReaderScrollMetrics, collapsed: boolean, now: number, userInitiated = true): boolean | null {
  const y = scroll.scrollTop, delta = y - tracker.last;
  tracker.last = y;
  if (now < tracker.settleUntil) { tracker.upward = 0; return null; }
  tracker.upward = delta < 0 ? tracker.upward - delta : 0;
  if (y <= 8) return collapsed ? false : null;
  if (!collapsed && userInitiated && delta > 0 && y > scroll.clientHeight / 4) return true;
  if (collapsed && tracker.upward >= EXPAND_AFTER_UPWARD_PX) return false;
  return null;
}

const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "]);
export function isScrollKey(event: { key: string; target: EventTarget | null }) {
  const target = event.target as HTMLElement | null;
  return SCROLL_KEYS.has(event.key) && !target?.closest?.("input, textarea, select, [contenteditable]");
}

function narrowNow() {
  return typeof window !== "undefined" && !!window.matchMedia?.(READER_TOOLS_COLLAPSE_QUERY).matches;
}

export function useCollapsibleReaderTools({ enabled, resetKey, canFold = () => true }: { enabled: boolean; resetKey: string; canFold?: () => boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(narrowNow);
  const tracker = useRef<CollapseTracker>({ last: 0, upward: 0, settleUntil: 0 });
  const collapsedRef = useRef(false);
  const intentUntil = useRef(0);
  const apply = useCallback((next: boolean) => {
    if (collapsedRef.current === next) return;
    collapsedRef.current = next;
    tracker.current.settleUntil = performance.now() + TOGGLE_SETTLE_MS;
    tracker.current.upward = 0;
    setCollapsed(next);
  }, []);
  useEffect(() => {
    const query = window.matchMedia?.(READER_TOOLS_COLLAPSE_QUERY);
    if (!query) return;
    const change = () => setNarrow(query.matches);
    change(); query.addEventListener?.("change", change);
    return () => query.removeEventListener?.("change", change);
  }, []);
  // A new document, a wide layout or an attention state always shows the full tools again.
  useEffect(() => { tracker.current = { last: 0, upward: 0, settleUntil: 0 }; collapsedRef.current = false; setCollapsed(false); }, [resetKey]);
  useEffect(() => { if (!enabled || !narrow) apply(false); }, [enabled, narrow, apply]);
  const onScroll = useCallback((scroll: ReaderScrollMetrics) => {
    if (!enabled || !narrow) { tracker.current.last = scroll.scrollTop; return; }
    const now = performance.now();
    const next = nextCollapsed(tracker.current, scroll, collapsedRef.current, now, now < intentUntil.current);
    if (next === true && !canFold()) return;
    if (next !== null) apply(next);
  }, [enabled, narrow, apply, canFold]);
  const expand = useCallback(() => apply(false), [apply]);
  const noteUserScroll = useCallback(() => { intentUntil.current = performance.now() + USER_INTENT_MS; }, []);
  return { collapsed: collapsed && enabled && narrow, onScroll, expand, noteUserScroll };
}
