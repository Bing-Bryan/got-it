import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { useResultPanel } from './useResultPanel';
let panel: ReturnType<typeof useResultPanel>, root: Root, host: HTMLDivElement;
let media: {matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn>};
const key = 'got-it.result-panel-pinned.v1';
function Harness({ onAnimate }: { onAnimate?: () => void }) {
  panel = useResultPanel({ onAnimate });
  return <><button ref={panel.triggerRef}>展开</button><aside ref={panel.ref} inert={!panel.visible}><button>内部控件</button></aside></>;
}
async function mount(onAnimate?: () => void) { await act(async () => root.render(<Harness onAnimate={onAnimate}/>)); }
async function tick() { await act(async () => vi.advanceTimersByTime(250)); }
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); vi.useFakeTimers();
  media = {matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()};
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(callback, 0));
  host=document.createElement('div'); document.body.append(host); root=createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('defaults expanded and persists one visible state without changing the left key', async () => {
  localStorage.setItem('got-it.sidebar-pinned.v1','false'); await mount();
  expect(panel.expanded).toBe(true);
  await act(async () => panel.toggle()); await tick();
  expect(panel.expanded).toBe(false); expect(localStorage.getItem(key)).toBe('false');
  await act(async () => root.unmount()); root=createRoot(host); await mount();
  expect(panel.expanded).toBe(false); expect(localStorage.getItem('got-it.sidebar-pinned.v1')).toBe('false');
  await act(async () => panel.toggle()); await tick();
  expect(panel.expanded).toBe(true); expect(localStorage.getItem(key)).toBe('true');
});

it('peeks on hover, cancels a pending close and returns to the collapsed state after leaving', async () => {
  localStorage.setItem(key,'false');
  const animate=vi.fn();
  await mount(animate);
  expect(panel.visible).toBe(false);
  await act(async () => panel.reveal());
  expect(panel.peek).toBe(true); expect(panel.visible).toBe(true); expect(panel.expanded).toBe(false);
  expect(animate).toHaveBeenCalledTimes(1);
  await act(async () => panel.leave()); await tick();
  expect(panel.peek).toBe(false); expect(panel.visible).toBe(false);
  expect(animate).toHaveBeenCalledTimes(2);
  await act(async () => { panel.reveal(); panel.leave(); });
  await act(async () => vi.advanceTimersByTime(100));
  await act(async () => panel.reveal()); await tick();
  expect(panel.peek).toBe(true);
  await act(async () => panel.leave()); await tick();
  expect(panel.peek).toBe(false);
});

it('pins a hover preview without losing the thread and clears the preview on explicit open', async () => {
  localStorage.setItem(key,'false'); await mount();
  await act(async () => panel.reveal());
  expect(panel.peek).toBe(true);
  await act(async () => panel.toggle());
  expect(panel.expanded).toBe(true); expect(panel.peek).toBe(false); expect(panel.visible).toBe(true);
  await act(async () => panel.toggle());
  expect(panel.expanded).toBe(false); expect(panel.visible).toBe(false);
  await act(async () => panel.reveal()); await act(async () => panel.openReading());
  expect(panel.expanded).toBe(true); expect(panel.peek).toBe(false); expect(panel.visible).toBe(true);
});

it('keeps session controls usable when storage is unavailable', async () => {
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(() => {throw new Error('blocked');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => {throw new Error('blocked');});
  await mount(); expect(panel.expanded).toBe(true);
  await act(async () => panel.toggle()); await tick(); expect(panel.expanded).toBe(false);
});

it('opens a reading result from a collapsed panel and closes it with one action', async () => {
  localStorage.setItem(key,'false'); await mount();
  await act(async () => panel.openReading());
  expect(panel.expanded).toBe(true); expect(localStorage.getItem(key)).toBe('true');
  await act(async () => panel.toggle());
  expect(panel.expanded).toBe(false); expect(localStorage.getItem(key)).toBe('false');
});

it('restores focus to the top toggle when an explicitly opened panel closes', async () => {
  localStorage.setItem(key,'false'); await mount();
  await act(async () => panel.openReading());
  (host.querySelector('aside button') as HTMLButtonElement).focus();
  await act(async () => panel.close()); await tick();
  expect(panel.expanded).toBe(false); expect(document.activeElement).toBe(panel.triggerRef.current);
});

it('collapseFromDrag closes and persists the collapsed state', async () => {
  await mount(); expect(panel.expanded).toBe(true);
  await act(async () => panel.collapseFromDrag()); await tick();
  expect(panel.expanded).toBe(false); expect(localStorage.getItem(key)).toBe('false');
});

it('narrow layouts leave the desktop preference alone', async () => {
  localStorage.setItem(key,'false'); await mount();
  await act(async () => {media.matches=true; media.addEventListener.mock.calls[0][1]();});
  expect(panel.narrow).toBe(true);
  await act(async () => panel.reveal());
  expect(panel.peek).toBe(false);
  await act(async () => panel.openReading());
  expect(panel.expanded).toBe(false); expect(localStorage.getItem(key)).toBe('false');
  await act(async () => panel.toggle());
  expect(panel.expanded).toBe(false);
  await act(async () => {media.matches=false; media.addEventListener.mock.calls[0][1]();});
  expect(panel.narrow).toBe(false); expect(panel.expanded).toBe(false);
});

it('reconciles a viewport change before the media listener subscribes', async () => {
  vi.stubGlobal('matchMedia',vi.fn().mockReturnValueOnce({...media,matches:true}).mockReturnValue(media));
  await mount(); expect(panel.narrow).toBe(false); expect(panel.expanded).toBe(true);
});
