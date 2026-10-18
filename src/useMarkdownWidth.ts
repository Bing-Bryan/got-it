import {track} from './lib/hosted-usage';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export const MARKDOWN_WIDTH_KEY = 'got-it.markdown-width.v1';
export const DEFAULT_MARKDOWN_WIDTH = null;
export const clampMarkdownWidth = (value: number) => Math.max(50, Math.min(100, Math.round(value)));
function readWidth(): { width: number | null; error: string } {
  try {
    const raw = localStorage.getItem(MARKDOWN_WIDTH_KEY);
    const value = Number(raw);
    return { width: raw !== null && Number.isFinite(value) && value >= 50 && value <= 100 ? Math.round(value) : null, error: '' };
  } catch { return { width: null, error: '宽度偏好无法读取，已使用推荐宽度。' }; }
}
export function useMarkdownWidth(article: RefObject<HTMLElement | null>) {
  const [preference, setPreference] = useState(readWidth);
  const { width, error } = preference;
  const [measuredPercent, setMeasuredPercent] = useState(100);
  useLayoutEffect(() => {
    const el = article.current, scroll = el?.closest<HTMLElement>('.reader-scroll');
    if (!el || !scroll) return;
    const update = () => { if (scroll.clientWidth) setMeasuredPercent(Math.round(el.getBoundingClientRect().width / scroll.clientWidth * 100)); };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(el); observer?.observe(scroll); window.addEventListener('resize', update); update();
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); };
  });
  const anchor = useRef<{ node: HTMLElement; top: number } | null>(null);
  const adjusting = useRef(false);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const change = (value: number | null) => {
    if (value !== null && !Number.isFinite(value)) return;
    track('width');
    const next = value === null ? null : clampMarkdownWidth(value);
    if (next === width) return;
    const scroll = article.current?.closest<HTMLElement>('.reader-scroll');
    if (scroll && article.current) {
      const top = scroll.getBoundingClientRect().top;
      const node = [...article.current.querySelectorAll<HTMLElement>('[data-block-id]')].find(el => el.getBoundingClientRect().bottom > top + 1);
      anchor.current = node ? { node, top: node.getBoundingClientRect().top } : null;
    }
    adjusting.current = true;
    cancelAnimationFrame(frame.current);
    let error = '';
    try { if (next === null) localStorage.removeItem(MARKDOWN_WIDTH_KEY); else localStorage.setItem(MARKDOWN_WIDTH_KEY, String(next)); }
    catch { error = '仅本次生效，宽度偏好未能保存；重新打开后可能恢复之前设置。'; }
    setPreference({ width: next, error });
  };
  useLayoutEffect(() => {
    if (!adjusting.current) return;
    const scroll = article.current?.closest<HTMLElement>('.reader-scroll');
    const saved = anchor.current; anchor.current = null;
    if (scroll && saved?.node.isConnected) scroll.scrollTo({ top: scroll.scrollTop + saved.node.getBoundingClientRect().top - saved.top, behavior: 'instant' });
    // Ignore only scroll events produced by this layout change, not normal reading.
    frame.current = requestAnimationFrame(() => { frame.current = requestAnimationFrame(() => { adjusting.current = false; }); });
  }, [width, article]);
  return { width, change, adjusting, measuredPercent, error };
}
