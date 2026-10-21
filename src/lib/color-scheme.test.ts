import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { COLOR_SCHEME_KEY, onColorSchemeChange, readColorScheme, startColorScheme, writeColorScheme } from './color-scheme';

let systemDark = false;
let mediaAdds = 0;
let stop: (() => void) | null = null;

beforeEach(() => {
  localStorage.clear();
  systemDark = false;
  mediaAdds = 0;
  delete document.documentElement.dataset.colorScheme;
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return systemDark; },
    addEventListener: () => { mediaAdds++; },
    removeEventListener: vi.fn(),
  })));
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.colorScheme;
});

function begin() {
  stop?.();
  stop = startColorScheme();
}

it('defaults to light for missing, unknown or unreadable storage and preserves explicit light/dark', () => {
  begin();
  expect(readColorScheme()).toBe('light');
  localStorage.setItem(COLOR_SCHEME_KEY, 'sepia');
  expect(readColorScheme()).toBe('light');
  localStorage.setItem(COLOR_SCHEME_KEY, 'dark');
  expect(readColorScheme()).toBe('dark');
  localStorage.setItem(COLOR_SCHEME_KEY, 'light');
  expect(readColorScheme()).toBe('light');
  expect(readColorScheme({ getItem: () => { throw new Error('blocked'); } })).toBe('light');
});

it('maps legacy system once to the current explicit scheme and never subscribes to system changes', () => {
  systemDark = true;
  localStorage.setItem(COLOR_SCHEME_KEY, 'system');
  begin();
  expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('dark');
  expect(document.documentElement.dataset.colorScheme).toBe('dark');
  expect(mediaAdds).toBe(0);

  systemDark = false;
  expect(readColorScheme()).toBe('dark');
  expect(document.documentElement.dataset.colorScheme).toBe('dark');
});

it('keeps the one-time legacy mapping for this visit when storage refuses to persist it', () => {
  systemDark = true;
  localStorage.setItem(COLOR_SCHEME_KEY, 'system');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  begin();
  expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('system');
  expect(readColorScheme()).toBe('dark');
  expect(document.documentElement.dataset.colorScheme).toBe('dark');

  systemDark = false;
  expect(readColorScheme()).toBe('dark');
  expect(document.documentElement.dataset.colorScheme).toBe('dark');
  expect(mediaAdds).toBe(0);
});

it('applies and persists explicit changes, and keeps a failed write for this visit', () => {
  begin();
  const seen: string[] = [];
  const off = onColorSchemeChange(preference => seen.push(preference));
  writeColorScheme('dark');
  expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('dark');
  expect(document.documentElement.dataset.colorScheme).toBe('dark');

  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  writeColorScheme('light');
  expect(readColorScheme()).toBe('light');
  expect(document.documentElement.dataset.colorScheme).toBe('light');
  expect(seen).toEqual(['dark', 'light']);
  off();
});

it('normalizes a legacy system value from another tab once and keeps icons in sync', () => {
  begin();
  const seen: string[] = [];
  const off = onColorSchemeChange(preference => seen.push(preference));
  systemDark = true;
  localStorage.setItem(COLOR_SCHEME_KEY, 'system');
  window.dispatchEvent(new StorageEvent('storage', { key: COLOR_SCHEME_KEY, newValue: 'system' }));
  expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('dark');
  expect(document.documentElement.dataset.colorScheme).toBe('dark');
  expect(seen).toEqual(['dark']);
  expect(mediaAdds).toBe(0);

  systemDark = false;
  expect(document.documentElement.dataset.colorScheme).toBe('dark');
  off();
});
