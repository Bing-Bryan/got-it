import { useCallback, useEffect, useRef, useState } from 'react';
const KEY = 'got-it.sidebar-pinned.v1';
const MEDIA = '(max-width: 1080px)';

interface SidebarOptions {
  onAnimate?: () => void;
}

/** Desktop navigation visibility plus a transient hover preview. */
export function useSidebar({ onAnimate }: SidebarOptions = {}) {
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
  const setExpanded = useCallback((value: boolean) => {
    setExpandedState(value);
    try { localStorage.setItem(KEY, String(value)); } catch { /* session state remains usable */ }
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
      try { localStorage.setItem(KEY, String(next)); } catch { /* session state remains usable */ }
      return next;
    });
    if (restore) requestAnimationFrame(() => triggerRef.current?.focus());
  }, [narrow, cancel]);
  const close = useCallback(() => {
    if (narrow) return;
    const restore = ref.current?.contains(document.activeElement);
    cancel();
    setPeek(false);
    setExpanded(false);
    if (restore) requestAnimationFrame(() => triggerRef.current?.focus());
  }, [narrow, cancel, setExpanded]);
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
  return { expanded, peek, visible, narrow, ref, triggerRef, toggle, close, reveal, leave, cancel };
}
