import { DEFAULT_FONT } from "@shared/fonts";
import type { ReactNode } from "react";
import { useFonts } from "@/lib/fonts";

/** Font list: EdiAula's own fonts by shelf, then the ones installed in Windows. Each name is shown in its font. */
export function FontPicker({
  value,
  onChange,
  label = "Fonte",
}: {
  value?: string;
  onChange: (family: string) => void;
  label?: string;
}): ReactNode {
  const { bundled, system } = useFonts();
  const current = value ?? DEFAULT_FONT;
  const groups = [...new Set(bundled.map((f) => f.group))];
  return (
    <label className="font-picker">
      <span className="field-label">{label}</span>
      <select
        className="input"
        value={current}
        style={{ fontFamily: `"${current}"` }}
        onChange={(e) => onChange(e.target.value)}
      >
        {!bundled.some((f) => f.family === current) && !system.includes(current) && (
          <option value={current}>{current}</option>
        )}
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {bundled
              .filter((f) => f.group === g)
              .map((f) => (
                <option key={f.family} value={f.family} style={{ fontFamily: `"${f.family}"` }}>
                  {f.family}
                </option>
              ))}
          </optgroup>
        ))}
        {system.length > 0 && (
          <optgroup label="Instaladas no Windows">
            {system.map((f) => (
              <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
                {f}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}
