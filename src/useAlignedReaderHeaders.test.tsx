import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { alignReaderHeaders, useAlignedReaderHeaders } from './useAlignedReaderHeaders';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
  const root = document.createElement('div');
  root.innerHTML = '<div class="brand-row" data-natural="64"></div><div class="reader-toolbar" data-natural="80"></div><div class="panel-desktop-head" data-natural="64"></div><div class="reading-library" data-natural="48.5"></div><div class="reader-tools" data-natural="82.5"></div><div class="result-navigation" data-natural="47"></div>';
  document.body.append(root);
  for (const row of root.children as HTMLCollectionOf<HTMLElement>) {
    row.getBoundingClientRect = () => {
      const key = row.matches('.brand-row,.reader-toolbar,.panel-desktop-head') ? '--aligned-reader-title-height' : '--aligned-reader-tools-height';
      return { width: 200, height: Math.max(Number(row.dataset.natural), parseFloat(root.style.getPropertyValue(key)) || 0) } as DOMRect;
    };
  }
  return root;
}
it('synchronizes both natural rows, including fractional heights, without treating the old minimum as content', () => {
  const root = fixture(); alignReaderHeaders(root, true);
  expect(root.style.getPropertyValue('--aligned-reader-title-height')).toBe('80px');
  expect(root.style.getPropertyValue('--aligned-reader-tools-height')).toBe('83px');
  root.querySelector<HTMLElement>('.reader-toolbar')!.dataset.natural = '64';
  root.querySelector<HTMLElement>('.reader-tools')!.dataset.natural = '47';
  alignReaderHeaders(root, true);
  expect(root.style.getPropertyValue('--aligned-reader-title-height')).toBe('64px');
  expect(root.style.getPropertyValue('--aligned-reader-tools-height')).toBe('49px');
});
it('ignores a hidden header and releases all desktop minima on narrow screens and the start page', () => {
  const root = fixture(); root.querySelector<HTMLElement>('.reader-toolbar')!.style.visibility = 'hidden';
  alignReaderHeaders(root, true);
  expect(root.style.getPropertyValue('--aligned-reader-title-height')).toBe('64px');
  alignReaderHeaders(root, false);
  expect(root.dataset.alignedReaderHeaders).toBeUndefined();
  expect(root.style.getPropertyValue('--aligned-reader-tools-height')).toBe('');
  root.className = 'start-mode'; alignReaderHeaders(root, true);
  expect(root.dataset.alignedReaderHeaders).toBeUndefined();
});
it('coalesces resize callbacks and disconnects observers and pending frames on unmount', async () => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  let resizeCallback: () => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resizeCallback = callback; } observe() {} disconnect = disconnect; });
  const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  const raf = vi.fn(() => 12), cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', raf); vi.stubGlobal('cancelAnimationFrame', cancel);
  function Harness() { const ref = useRef<HTMLDivElement>(null); useAlignedReaderHeaders(ref); return <div ref={ref}/>; }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<Harness/>));
  resizeCallback(); resizeCallback();
  expect(raf).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
  expect(cancel).toHaveBeenCalledWith(12);
  expect(disconnect).toHaveBeenCalled();
  expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
});
