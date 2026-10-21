import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { COLOR_SCHEME_KEY, applyColorScheme, readColorScheme, resolveColorScheme, startColorScheme, writeColorScheme } from './color-scheme';
let systemDark = false; let systemListener: (() => void) | null = null;
beforeEach(() => { localStorage.clear(); systemDark = false; systemListener = null; delete document.documentElement.dataset.colorScheme;
  vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return systemDark; }, addEventListener: (_: string, cb: () => void) => { systemListener = cb; }, removeEventListener: vi.fn() }))); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it('defaults to light for a missing, unknown or unreadable preference', () => {
  expect(readColorScheme()).toBe('light');
  localStorage.setItem(COLOR_SCHEME_KEY, 'sepia'); expect(readColorScheme()).toBe('light');
  expect(readColorScheme({ getItem: () => { throw new Error('blocked'); } })).toBe('light');
});
it('resolves follow-system against the OS setting', () => {
  expect(resolveColorScheme('system', true)).toBe('dark'); expect(resolveColorScheme('system', false)).toBe('light'); expect(resolveColorScheme('dark', false)).toBe('dark');
});
it('applies the saved choice at startup, persists changes and follows the OS only in system mode', () => {
  localStorage.setItem(COLOR_SCHEME_KEY, 'dark'); const stop = startColorScheme();
  expect(document.documentElement.dataset.colorScheme).toBe('dark');
  writeColorScheme('system'); expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('system'); expect(document.documentElement.dataset.colorScheme).toBe('light');
  systemDark = true; systemListener?.(); expect(document.documentElement.dataset.colorScheme).toBe('dark');
  writeColorScheme('light'); systemDark = false; systemListener?.(); systemDark = true; systemListener?.(); expect(document.documentElement.dataset.colorScheme).toBe('light');
  stop();
});
it('still applies the choice for this visit when storage refuses to save', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  writeColorScheme('dark'); expect(document.documentElement.dataset.colorScheme).toBe('dark');
  applyColorScheme('light'); expect(document.documentElement.dataset.colorScheme).toBe('light');
});
