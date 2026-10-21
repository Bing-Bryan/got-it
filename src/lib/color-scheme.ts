/** Light / dark appearance. A browser-only preference: never in workspace exports, never a request. */
export type ColorSchemePreference = "light" | "dark";
export const COLOR_SCHEME_KEY = "got-it.color-scheme.v1";
const CHANGE_EVENT = "got-it:color-scheme";
const LEGACY_SYSTEM = "system";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Only used when the browser refuses to persist an explicit choice (including one-time
// legacy "system" normalisation), so the current visit does not silently change later.
let sessionPreference: ColorSchemePreference | null = null;

export function readColorScheme(storage: Pick<Storage, "getItem"> | null = safeStorage()): ColorSchemePreference {
  if (sessionPreference) return sessionPreference;
  try {
    const value = storage?.getItem(COLOR_SCHEME_KEY);
    if (value === "light" || value === "dark") return value;
    if (value !== LEGACY_SYSTEM) return "light";
    // Legacy "system" is resolved exactly once, then stored as an explicit choice when possible.
    const mapped: ColorSchemePreference = systemPrefersDark() ? "dark" : "light";
    sessionPreference = mapped;
    try {
      const writable = storage as (Pick<Storage, "getItem"> & Partial<Pick<Storage, "setItem">>) | null;
      if (!writable?.setItem) return mapped;
      writable.setItem(COLOR_SCHEME_KEY, mapped);
      sessionPreference = null;
    } catch { /* Keep this visit's one-time mapping. */ }
    return mapped;
  } catch {
    return "light";
  }
}

function systemPrefersDark() {
  return typeof window !== "undefined" && !!window.matchMedia?.(DARK_QUERY).matches;
}

export function applyColorScheme(preference: ColorSchemePreference, root: HTMLElement = document.documentElement) {
  root.dataset.colorScheme = preference;
}

export function writeColorScheme(preference: ColorSchemePreference) {
  sessionPreference = null;
  const storage = safeStorage();
  if (!storage) sessionPreference = preference;
  else try { storage.setItem(COLOR_SCHEME_KEY, preference); } catch { sessionPreference = preference; }
  applyColorScheme(preference);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: preference }));
}

/** Applies the saved choice once and syncs later explicit changes from other tabs. No system listener. */
export function startColorScheme(): () => void {
  sessionPreference = null;
  applyColorScheme(readColorScheme());
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== COLOR_SCHEME_KEY && event.key !== null) return;
    // Storage is the source of truth across tabs; normalize a legacy "system" once.
    sessionPreference = null;
    const preference = readColorScheme();
    applyColorScheme(preference);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: preference }));
  };
  window.addEventListener("storage", storageChanged);
  return () => window.removeEventListener("storage", storageChanged);
}

export function onColorSchemeChange(listener: (preference: ColorSchemePreference) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<ColorSchemePreference>).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}
