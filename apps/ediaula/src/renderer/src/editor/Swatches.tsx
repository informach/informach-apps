import type { ReactNode } from "react";
import { useSwatches } from "@/lib/palettes";

/**
 * A row of the active palette's colors (name and hex on hover). `none` adds a first dot for
 * "no color"; `extra` adds colors outside the palette (black for shadows).
 */
export function Swatches({
  value,
  onPick,
  none,
  extra = [],
}: {
  value: string | undefined;
  onPick: (hex: string | undefined) => void;
  none?: string;
  extra?: { hex: string; name: string }[];
}): ReactNode {
  const swatches = useSwatches();
  const current = value?.toUpperCase();
  const list = [
    ...extra.filter((e) => !swatches.some((s) => s.hex === e.hex.toUpperCase())),
    ...swatches,
  ];
  return (
    <div className="swatch-row">
      {none && (
        <button
          type="button"
          className={`color-dot no-border ${!value ? "is-active" : ""}`}
          title={none}
          onClick={() => onPick(undefined)}
        />
      )}
      {list.map((c) => (
        <button
          type="button"
          key={c.hex}
          className={`color-dot ${current === c.hex.toUpperCase() ? "is-active" : ""}`}
          style={{ background: c.hex }}
          title={`${c.name} · ${c.hex}`}
          onClick={() => onPick(c.hex)}
        />
      ))}
    </div>
  );
}
