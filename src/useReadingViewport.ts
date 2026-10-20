import { useLayoutEffect, type RefObject } from 'react';

/** Layout viewport can stay full-height while a mobile keyboard covers its bottom. */
export function useReadingViewport(frame: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const element = frame.current;
    const viewport = window.visualViewport;
    if (!element || !viewport) return;
    let pending = 0;
    const update = (reveal = false) => {
      const mobile = window.matchMedia('(max-width: 780px)').matches;
      const usable = mobile && Math.abs(viewport.scale - 1) < 0.01;
      if (!usable) {
        cancelAnimationFrame(pending);
        element.style.removeProperty('--reading-viewport-height');
        element.style.removeProperty('--reading-viewport-top');
        element.style.removeProperty('--reading-viewport-bottom');
        delete element.dataset.keyboardVisible;
        return;
      }
      const top = Math.max(0, viewport.offsetTop);
      const height = Math.max(1, Math.min(viewport.height, window.innerHeight - top));
      const bottom = Math.max(0, window.innerHeight - top - height);
      element.style.setProperty('--reading-viewport-height', `${height}px`);
      element.style.setProperty('--reading-viewport-top', `${top}px`);
      element.style.setProperty('--reading-viewport-bottom', `${bottom}px`);
      const keyboard = window.innerHeight - height > 120;
      element.dataset.keyboardVisible = String(keyboard);
      if (!keyboard) cancelAnimationFrame(pending);
      if (reveal && keyboard) {
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(() => {
          const input = document.activeElement;
          if (input instanceof HTMLTextAreaElement && element.contains(input)) {
            input.closest('.question-composer')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        });
      }
    };
    const resize = () => update(true);
    const scroll = () => update();
    const focus = () => update(true);
    update();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', scroll);
    window.addEventListener('resize', resize);
    element.addEventListener('focusin', focus);
    return () => {
      cancelAnimationFrame(pending);
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', resize);
      element.removeEventListener('focusin', focus);
      element.style.removeProperty('--reading-viewport-height');
      element.style.removeProperty('--reading-viewport-top');
      element.style.removeProperty('--reading-viewport-bottom');
      delete element.dataset.keyboardVisible;
    };
  }, [frame]);
}
