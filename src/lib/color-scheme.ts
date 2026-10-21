/** Light / dark / follow-system appearance. A browser-only preference: never in workspace exports, never a request. */
export type ColorSchemePreference = "light" | "dark" | "system";
export const COLOR_SCHEME_KEY = "got-it.color-scheme.v1";
const CHANGE_EVENT = "got-it:color-scheme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function readColorScheme(storage: Pick<Storage, "getItem"> | null = safeStorage()): ColorSchemePreference {
  try {
    const value = storage?.getItem(COLOR_SCHEME_KEY);
    return value === "dark" || value === "system" ? value : "light";
  } catch {
    return "light";
  }
}

export function resolveColorScheme(preference: ColorSchemePreference, systemDark: boolean): "light" | "dark" {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

function systemPrefersDark() {
  return typeof window !== "undefined" && !!window.matchMedia?.(DARK_QUERY).matches;
}

export function applyColorScheme(preference: ColorSchemePreference, root: HTMLElement = document.documentElement) {
  root.dataset.colorScheme = resolveColorScheme(preference, systemPrefersDark());
}

export function writeColorScheme(preference: ColorSchemePreference) {
  try { safeStorage()?.setItem(COLOR_SCHEME_KEY, preference); } catch { /* Appearance still applies for this visit. */ }
  applyColorScheme(preference);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: preference }));
}

/** Applies the saved preference once and keeps “follow system” and other tabs in sync. Returns a cleanup. */
export function startColorScheme(): () => void {
  applyColorScheme(readColorScheme());
  const query = window.matchMedia?.(DARK_QUERY);
  const systemChanged = () => { if (readColorScheme() === "system") applyColorScheme("system"); };
  const storageChanged = (event: StorageEvent) => { if (event.key === COLOR_SCHEME_KEY) applyColorScheme(readColorScheme()); };
  query?.addEventListener?.("change", systemChanged);
  window.addEventListener("storage", storageChanged);
  return () => { query?.removeEventListener?.("change", systemChanged); window.removeEventListener("storage", storageChanged); };
}

export function onColorSchemeChange(listener: (preference: ColorSchemePreference) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<ColorSchemePreference>).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}
