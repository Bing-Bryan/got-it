import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { onColorSchemeChange, readColorScheme, writeColorScheme, type ColorSchemePreference } from "./lib/color-scheme";

/** One frameless appearance toggle for the start header and the reading tools. */
export function ColorSchemeMenu({ className = "" }: { className?: string }) {
  const [preference, setPreference] = useState<ColorSchemePreference>(() => readColorScheme());
  // Pointer hover previews the other icon without changing the actual appearance.
  const [preview, setPreview] = useState(false);

  useEffect(() => onColorSchemeChange(setPreference), []);

  const target: ColorSchemePreference = preference === "light" ? "dark" : "light";
  const shown = preview ? target : preference;
  const Icon = shown === "light" ? Sun : Moon;
  const switchLabel = target === "light" ? "切换为浅色" : "切换为深色";

  return <div className={`color-scheme-menu ${className}`.trim()}>
    <button
      type="button"
      className="color-scheme-trigger"
      aria-label={switchLabel}
      title={switchLabel}
      onPointerEnter={event => { if (event.pointerType !== "touch") setPreview(true); }}
      onPointerLeave={() => setPreview(false)}
      onClick={() => { writeColorScheme(target); setPreview(false); }}
    >
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" focusable="false" />
    </button>
  </div>;
}
