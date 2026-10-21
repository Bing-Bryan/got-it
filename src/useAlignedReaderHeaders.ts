import { useLayoutEffect, type RefObject } from 'react';

const TITLE = '.brand-row, .reader-toolbar, .panel-desktop-head';
const TOOLS = '.reading-library, .reader-tools, .category-toolbar, .result-navigation';
const TITLE_HEIGHT = '--aligned-reader-title-height';
const TOOLS_HEIGHT = '--aligned-reader-tools-height';

/** Measure unconstrained boxes each time, so a dismissed warning can shrink all rows again. */
export function alignReaderHeaders(root: HTMLElement, wide: boolean) {
  root.style.removeProperty(TITLE_HEIGHT);
  root.style.removeProperty(TOOLS_HEIGHT);
  if (!wide || root.classList.contains('start-mode') || root.classList.contains('bookmarks-mode')) {
    delete root.dataset.alignedReaderHeaders;
    return;
  }
  root.dataset.alignedReaderHeaders = 'true';
  const naturalHeight = (selector: string) => Math.max(0, ...Array.from(root.querySelectorAll<HTMLElement>(selector)).map(node => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && style.display !== 'none' && style.visibility !== 'hidden' ? rect.height : 0;
  }));
  const title = naturalHeight(TITLE);
  if (title) root.style.setProperty(TITLE_HEIGHT, `${Math.ceil(title)}px`);
  // First rows now have the same height; second-row borders can share an absolute bottom.
  const tools = naturalHeight(TOOLS);
  if (tools) root.style.setProperty(TOOLS_HEIGHT, `${Math.ceil(tools)}px`);
}

/** Presentation only: no workspace, request, storage or focus changes. */
export function useAlignedReaderHeaders(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const media = window.matchMedia?.('(min-width: 1081px)');
    if (!media) return;
    let frame = 0, stopped = false;
    const measure = () => { frame = 0; if (!stopped) alignReaderHeaders(root, media.matches); };
    const schedule = () => { if (!stopped && !frame) frame = requestAnimationFrame(measure); };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const observeRows = () => {
      resize?.disconnect();
      resize?.observe(root);
      // Children reveal intrinsic-content changes even while the row is held at its shared minimum.
      root.querySelectorAll<HTMLElement>(`${TITLE}, ${TOOLS}`).forEach(row => {
        resize?.observe(row);
        Array.from(row.children).forEach(child => resize?.observe(child));
      });
    };
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList')) observeRows();
      schedule();
    });
    observeRows();
    // Do not watch our own style/data writes, which would schedule a feedback loop.
    mutations.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] });
    media.addEventListener?.('change', schedule);
    window.addEventListener('resize', schedule);
    document.fonts?.addEventListener?.('loadingdone', schedule);
    measure();
    return () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      resize?.disconnect(); mutations.disconnect();
      media.removeEventListener?.('change', schedule);
      window.removeEventListener('resize', schedule);
      document.fonts?.removeEventListener?.('loadingdone', schedule);
      root.style.removeProperty(TITLE_HEIGHT); root.style.removeProperty(TOOLS_HEIGHT);
      delete root.dataset.alignedReaderHeaders;
    };
  }, [ref]);
}
