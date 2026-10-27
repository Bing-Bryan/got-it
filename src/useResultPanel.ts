import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'got-it.result-panel-pinned.v1';
const MEDIA = '(max-width: 780px)';

interface ResultPanelOptions {
  onAnimate?: () => void;
}

/** Visibility only: hiding the panel never unmounts or changes a reading thread. */
export function useResultPanel({ onAnimate }: ResultPanelOptions = {}) {
  const [expanded, setExpandedState] = useState(() => {
    try { return localStorage.getItem(KEY) !== 'false'; } catch { return true; }
  });
  const [peek, setPeek] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(MEDIA).matches ?? false);
  const ref = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = expanded || peek;
  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const setExpanded = useCallback((value: boolean, persist = true) => {
    setExpandedState(value);
    if (persist) try { localStorage.setItem(KEY, String(value)); } catch { /* keep session preference */ }
  }, []);
  const reveal = useCallback(() => {
    cancel();
    if (narrow || expanded || peek) return;
    onAnimate?.();
    setPeek(true);
  }, [cancel, narrow, expanded, peek, onAnimate]);
  const leave = useCallback(() => {
    if (narrow || expanded || !peek) return;
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      if (ref.current?.contains(document.activeElement)) return;
      onAnimate?.();
      setPeek(false);
    }, 220);
  }, [cancel, narrow, expanded, peek, onAnimate]);
  const toggle = useCallback(() => {
    if (narrow) return;
    const restore = ref.current?.contains(document.activeElement);
    cancel();
    setPeek(false);
    setExpandedState(current => {
      const next = !current;
      try { localStorage.setItem(KEY, String(next)); } catch { /* keep session preference */ }
      return next;
    });
    if (restore) requestAnimationFrame(() => triggerRef.current?.focus());
  }, [narrow, cancel]);
  const openReading = useCallback(() => {
    if (narrow) return;
    cancel();
    setPeek(false);
    setExpanded(true);
  }, [narrow, cancel, setExpanded]);
  const close = useCallback(() => {
    if (narrow) return;
    const restore = ref.current?.contains(document.activeElement);
    cancel();
    setPeek(false);
    setExpanded(false);
    if (restore) requestAnimationFrame(() => triggerRef.current?.focus());
  }, [narrow, cancel, setExpanded]);
  const collapseFromDrag = useCallback(() => {
    cancel();
    setPeek(false);
    setExpanded(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [cancel, setExpanded]);
  useEffect(() => {
    const media = window.matchMedia?.(MEDIA);
    const resize = () => {
      setNarrow(media?.matches ?? false);
      setPeek(false);
      cancel();
    };
    media?.addEventListener('change', resize);
    resize(); // Reconcile a viewport change between initial render and subscribing.
    return () => {
      media?.removeEventListener('change', resize);
      cancel();
    };
  }, [cancel]);
  return { expanded, peek, visible, narrow, ref, triggerRef, toggle, openReading, close, collapseFromDrag, reveal, leave, cancel };
}
