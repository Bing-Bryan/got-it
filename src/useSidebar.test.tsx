import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { useSidebar } from './useSidebar';
let sidebar: ReturnType<typeof useSidebar>, root: Root, host: HTMLDivElement;
let media: {matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn>};
const key = 'got-it.sidebar-pinned.v1';
function Harness({ onAnimate }: { onAnimate?: () => void }) {
  sidebar = useSidebar({ onAnimate });
  return <><button ref={sidebar.triggerRef}>展开</button><aside ref={sidebar.ref} inert={!sidebar.visible}><button>内部控件</button></aside></>;
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

it('defaults expanded, toggles once per action and restores the stored preference', async () => {
  await mount();
  expect(sidebar.expanded).toBe(true);
  await act(async () => sidebar.toggle()); await tick();
  expect(sidebar.expanded).toBe(false); expect(localStorage.getItem(key)).toBe('false');
  await act(async () => root.unmount()); root=createRoot(host); await mount();
  expect(sidebar.expanded).toBe(false);
  await act(async () => sidebar.toggle()); await tick();
  expect(sidebar.expanded).toBe(true); expect(localStorage.getItem(key)).toBe('true');
});

it('closes and restores focus to the top toggle', async () => {
  await mount();
  (host.querySelector('aside button') as HTMLButtonElement).focus();
  await act(async () => sidebar.close()); await tick();
  expect(sidebar.expanded).toBe(false); expect(document.activeElement).toBe(sidebar.triggerRef.current);
});

it('peeks on hover, cancels a pending close and restores the collapsed state after leaving', async () => {
  localStorage.setItem(key,'false');
  const animate=vi.fn();
  await mount(animate);
  expect(sidebar.visible).toBe(false);
  await act(async () => sidebar.reveal());
  expect(sidebar.peek).toBe(true); expect(sidebar.visible).toBe(true); expect(sidebar.expanded).toBe(false);
  expect(animate).toHaveBeenCalledTimes(1);
  await act(async () => sidebar.leave()); await tick();
  expect(sidebar.peek).toBe(false); expect(sidebar.visible).toBe(false);
  expect(animate).toHaveBeenCalledTimes(2);
  await act(async () => { sidebar.reveal(); sidebar.leave(); });
  await act(async () => vi.advanceTimersByTime(100));
  await act(async () => sidebar.reveal()); await tick();
  expect(sidebar.peek).toBe(true);
  await act(async () => sidebar.leave()); await tick();
  expect(sidebar.peek).toBe(false);
});

it('keeps a peek open while focus is inside and pins it with one click', async () => {
  localStorage.setItem(key,'false');
  await mount();
  await act(async () => sidebar.reveal());
  (host.querySelector('aside button') as HTMLButtonElement).focus();
  await act(async () => sidebar.leave()); await tick();
  expect(sidebar.peek).toBe(true); expect(sidebar.visible).toBe(true);
  (host.querySelector('aside button') as HTMLButtonElement).blur();
  await act(async () => sidebar.toggle());
  expect(sidebar.expanded).toBe(true); expect(sidebar.peek).toBe(false); expect(sidebar.visible).toBe(true);
  expect(localStorage.getItem(key)).toBe('true');
  await act(async () => sidebar.toggle());
  expect(sidebar.expanded).toBe(false); expect(sidebar.visible).toBe(false);
  expect(localStorage.getItem(key)).toBe('false');
});

it('does not change the desktop preference from a narrow layout', async () => {
  localStorage.setItem(key,'true'); await mount();
  await act(async () => {media.matches=true; media.addEventListener.mock.calls[0][1]();});
  expect(sidebar.narrow).toBe(true);
  await act(async () => sidebar.reveal());
  expect(sidebar.peek).toBe(false);
  await act(async () => sidebar.close()); await tick();
  expect(sidebar.expanded).toBe(true); expect(localStorage.getItem(key)).toBe('true');
  await act(async () => sidebar.toggle()); await tick();
  expect(sidebar.expanded).toBe(true);
});

it('keeps working when storage is unavailable', async () => {
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(() => {throw new Error('blocked');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => {throw new Error('blocked');});
  await mount(); expect(sidebar.expanded).toBe(true);
  await act(async () => sidebar.toggle()); await tick(); expect(sidebar.expanded).toBe(false);
});
