import { useEffect, useId, useState } from "react";
import { onColorSchemeChange, readColorScheme, writeColorScheme, type ColorSchemePreference } from "./lib/color-scheme";

const OPTIONS: { value: ColorSchemePreference; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

/** Appearance choice shown beside the other local preferences; PDF pages and article images keep their own colors. */
export function ColorSchemeSetting() {
  const [preference, setPreference] = useState<ColorSchemePreference>(() => readColorScheme());
  const name = useId();
  useEffect(() => onColorSchemeChange(setPreference), []);
  return <fieldset className="color-scheme-setting">
    <legend>配色</legend>
    <div className="color-scheme-options">
      {OPTIONS.map(option => <label key={option.value}>
        <input type="radio" name={name} value={option.value} checked={preference === option.value} onChange={() => { setPreference(option.value); writeColorScheme(option.value); }} />
        {option.label}
      </label>)}
    </div>
  </fieldset>;
}
