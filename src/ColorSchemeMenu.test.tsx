import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ColorSchemeMenu } from './ColorSchemeMenu';
import { COLOR_SCHEME_KEY, startColorScheme } from './lib/color-scheme';

let host: HTMLDivElement, root: Root, stop: (() => void) | undefined;
const trigger = () => host.querySelector<HTMLButtonElement>('.color-scheme-trigger')!;
const icon = () => trigger().querySelector('svg')!.classList.contains('lucide-moon') ? 'moon' : 'sun';
function pointer(type: string, pointerType = 'mouse') {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  stop = startColorScheme();
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  stop?.();
  stop = undefined;
  host.remove();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.colorScheme;
});

it('previews on pointer hover, toggles once on click, and keeps the new icon until leaving', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  await act(async () => root.render(<ColorSchemeMenu />));
  const button = trigger();
  expect(button.getAttribute('aria-label')).toBe('切换为深色');
  expect(button.title).toBe('切换为深色');
  expect(icon()).toBe('sun');
  expect(document.querySelector('[role="dialog"], .color-scheme-popover')).toBeNull();

  await act(async () => button.dispatchEvent(pointer('pointerover')));
  expect(icon()).toBe('moon');
  expect(document.documentElement.dataset.colorScheme).toBe('light');
  expect(localStorage.getItem(COLOR_SCHEME_KEY)).not.toBe('dark');

  await act(async () => button.click());
  expect(document.documentElement.dataset.colorScheme).toBe('dark');
  expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('dark');
  expect(button.getAttribute('aria-label')).toBe('切换为浅色');
  expect(icon()).toBe('moon');

  await act(async () => button.dispatchEvent(pointer('pointerout')));
  expect(icon()).toBe('moon');
  await act(async () => button.dispatchEvent(pointer('pointerover')));
  expect(icon()).toBe('sun');
  expect(document.documentElement.dataset.colorScheme).toBe('dark');

  await act(async () => button.click());
  expect(document.documentElement.dataset.colorScheme).toBe('light');
  expect(button.getAttribute('aria-label')).toBe('切换为深色');
  expect(icon()).toBe('sun');
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('ignores touch pseudo-hover and switches exactly once per activation', async () => {
  await act(async () => root.render(<ColorSchemeMenu />));
  const button = trigger();
  button.focus();
  await act(async () => button.dispatchEvent(pointer('pointerover', 'touch')));
  expect(icon()).toBe('sun');
  await act(async () => button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(document.documentElement.dataset.colorScheme).toBe('light');
  await act(async () => button.click());
  expect(document.documentElement.dataset.colorScheme).toBe('dark');
  expect(icon()).toBe('moon');
  expect(button.getAttribute('aria-label')).toBe('切换为浅色');
});

it('keeps the icon in sync with explicit cross-tab storage changes', async () => {
  await act(async () => root.render(<ColorSchemeMenu />));
  localStorage.setItem(COLOR_SCHEME_KEY, 'dark');
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: COLOR_SCHEME_KEY, newValue: 'dark' })));
  expect(document.documentElement.dataset.colorScheme).toBe('dark');
  expect(icon()).toBe('moon');
  expect(trigger().getAttribute('aria-label')).toBe('切换为浅色');

  localStorage.setItem(COLOR_SCHEME_KEY, 'light');
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: COLOR_SCHEME_KEY, newValue: 'light' })));
  expect(document.documentElement.dataset.colorScheme).toBe('light');
  expect(icon()).toBe('sun');
  expect(trigger().getAttribute('aria-label')).toBe('切换为深色');
});
