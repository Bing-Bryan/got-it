import { useEffect, useRef, useState, type RefObject } from "react";

type View = { scale: number; x: number; y: number };
type Size = { width: number; height: number };
const fitScale = (image: Size, box: Size) => Math.min(1, box.width / image.width, box.height / image.height);
export function constrainImageView(view: View, image: Size, box: Size): View {
  const fit = fitScale(image, box);
  const scale = Math.max(fit, Math.min(Math.min(16, Math.max(fit * 8, 4)), view.scale));
  const boundX = Math.max(0, (image.width * scale - box.width) / 2);
  const boundY = Math.max(0, (image.height * scale - box.height) / 2);
  return { scale, x: Math.max(-boundX, Math.min(boundX, view.x)), y: Math.max(-boundY, Math.min(boundY, view.y)) };
}
/** Reuses already loaded blob images; no source URL is followed. */
export function WebImageViewer({ article, documentKey }: { article: RefObject<HTMLElement | null>; documentKey: string }) {
  const [image, setImage] = useState<{ src: string; alt: string; width: number; height: number; origin: HTMLImageElement; key: string } | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [box, setBox] = useState<Size>({ width: 1, height: 1 });
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const currentKey = useRef(documentKey);
  currentKey.current = documentKey;
  const drag = useRef<{ id: number; x: number; y: number; view: View; moved: boolean; blank: boolean } | null>(null);
  const suppressClick = useRef(false);
  const backdropDown = useRef(false);
  const blankClick = useRef(false);
  const zoom = useRef((factor: number, clientX?: number, clientY?: number) => {});
  const activeImage = image?.key === documentKey ? image : null;
  const fit = activeImage ? fitScale(activeImage, box) : 1;
  zoom.current = (factor, clientX, clientY) => {
    if (!activeImage) return;
    const rect = viewport.current?.getBoundingClientRect();
    const px = rect && clientX !== undefined ? clientX - rect.left - rect.width / 2 : 0;
    const py = rect && clientY !== undefined ? clientY - rect.top - rect.height / 2 : 0;
    setView(old => {
      const bounded = constrainImageView({ ...old, scale: old.scale * factor }, activeImage, box);
      const ratio = bounded.scale / old.scale;
      return constrainImageView({ scale: bounded.scale, x: px - (px - old.x) * ratio, y: py - (py - old.y) * ratio }, activeImage, box);
    });
  };
  useEffect(() => {
    const root = article.current;
    if (!root) return;
    const open = (target: EventTarget | null) => {
      if (!(target instanceof HTMLImageElement) || !target.matches('img[data-web-media]') || !target.src.startsWith('blob:') || !target.naturalWidth || !target.naturalHeight) return;
      setImage({ src: target.src, alt: target.alt, width: target.naturalWidth, height: target.naturalHeight, origin: target, key: documentKey });
    };
    const click = (event: Event) => open(event.target);
    const key = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLImageElement) { event.preventDefault(); open(event.target); }
    };
    root.addEventListener('click', click); root.addEventListener('keydown', key);
    return () => { root.removeEventListener('click', click); root.removeEventListener('keydown', key); };
  }, [article, documentKey]);
  useEffect(() => { setImage(null); drag.current = null; }, [documentKey]);
  useEffect(() => {
    if (!activeImage || !dialog.current || !viewport.current) return;
    const el = dialog.current, surface = viewport.current;
    if (el.showModal) el.showModal(); else el.open = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const resize = () => {
      const rect = surface.getBoundingClientRect();
      const size = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
      setBox(size); setView({ scale: fitScale(activeImage, size), x: 0, y: 0 }); drag.current = null;
    };
    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(surface); window.addEventListener('resize', resize);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1);
      zoom.current(Math.exp(-Math.max(-100, Math.min(100, delta)) * .012), event.clientX, event.clientY);
    };
    let lastGestureScale = 1;
    const gesture = (event: Event) => {
      event.preventDefault();
      const input = event as Event & { scale?: number; clientX?: number; clientY?: number };
      if (event.type === 'gesturestart') lastGestureScale = 1;
      else if (event.type === 'gesturechange' && input.scale && Number.isFinite(input.scale)) {
        zoom.current(input.scale / lastGestureScale, input.clientX, input.clientY); lastGestureScale = input.scale;
      }
    };
    surface.addEventListener('wheel', wheel, { passive: false });
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) surface.addEventListener(name, gesture, { passive: false });
    return () => {
      observer?.disconnect(); window.removeEventListener('resize', resize);
      surface.removeEventListener('wheel', wheel);
      for (const name of ['gesturestart', 'gesturechange', 'gestureend']) surface.removeEventListener(name, gesture);
      document.body.style.overflow = previousOverflow;
      if (el.close) el.close(); else el.open = false;
      if (currentKey.current === activeImage.key && activeImage.origin.isConnected) activeImage.origin.focus({ preventScroll: true });
      drag.current = null;
    };
  }, [activeImage]);
  if (!activeImage) return null;
  return <dialog ref={dialog} className="web-image-dialog" aria-label="图片查看" onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }} onCancel={event => { event.preventDefault(); setImage(null); }}
    onPointerDown={event => { backdropDown.current = event.target === event.currentTarget; }}
    onClick={event => { if (event.target === event.currentTarget && backdropDown.current) setImage(null); backdropDown.current = false; }}>
    <button className="web-image-screen-reader-close" autoFocus type="button" onClick={() => setImage(null)}>关闭图片</button>
    <div ref={viewport} className="web-image-viewport" tabIndex={0} aria-label="图片查看区域" style={{ cursor: view.scale > fit + .0001 ? 'grab' : 'default' }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        suppressClick.current = false;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view, moved: false, blank: event.target === event.currentTarget };
        blankClick.current = event.target === event.currentTarget;
        if (view.scale > fit + .0001) event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (Math.hypot(dx, dy) > 4) start.moved = true;
        if (start.moved && view.scale > fit + .0001) setView(constrainImageView({ ...start.view, x: start.view.x + dx, y: start.view.y + dy }, activeImage, box));
      }}
      onPointerUp={event => {
        if (drag.current?.id === event.pointerId) { suppressClick.current = drag.current.moved; drag.current = null; }
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; suppressClick.current = true; }}
      onClick={event => { event.stopPropagation(); if (!suppressClick.current && blankClick.current && event.target === event.currentTarget) setImage(null); suppressClick.current = false; }}>
      <img draggable={false} src={activeImage.src} alt={activeImage.alt} width={activeImage.width} height={activeImage.height} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} />
    </div>
  </dialog>;
}
