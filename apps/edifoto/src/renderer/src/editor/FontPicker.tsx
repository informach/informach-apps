import { type ReactNode, useEffect, useState } from "react";

interface LocalFont {
  family: string;
}

let families: Promise<string[]> | null = null;

/** Families installed on Windows (Local Font Access) plus the bundled Inter. */
export function fontFamilies(): Promise<string[]> {
  families ??= (async () => {
    const query = (window as unknown as { queryLocalFonts?: () => Promise<LocalFont[]> })
      .queryLocalFonts;
    const list = new Set<string>(["Inter Variable"]);
    try {
      if (query) for (const f of await query()) list.add(f.family);
    } catch {
      /* permission denied: bundled font only */
    }
    return [...list].sort((a, b) => a.localeCompare(b));
  })();
  return families;
}

export function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange(v: string): void;
}): ReactNode {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    void fontFamilies().then(setList);
  }, []);
  return (
    <select
      className="field"
      style={{ width: 170, fontFamily: `"${value}"` }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Fonte"
    >
      {!list.includes(value) && <option value={value}>{value}</option>}
      {list.map((f) => (
        <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
          {f}
        </option>
      ))}
    </select>
  );
}
