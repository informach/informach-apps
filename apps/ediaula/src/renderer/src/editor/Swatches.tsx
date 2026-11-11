import { Pipette } from "lucide-react";
import { type ReactNode, useState } from "react";
import { canSampleScreen, sampleScreen, toHex, useRecentColors } from "@/lib/colors";
import { useSwatches } from "@/lib/palettes";
import { ColorPicker } from "./ColorPicker";

/**
 * A row of the active palette's colors (name and hex on hover), then any other color: the one in
 * use when it is outside the palette, "Mais cores" (the full picker) and the eyedropper.
 * `none` adds a first dot for "no color"; `extra` adds colors outside the palette (black for
 * shadows).
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
  const remember = useRecentColors((s) => s.remember);
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  const current = value?.toUpperCase();
  const list = [
    ...extra.filter((e) => !swatches.some((s) => s.hex === e.hex.toUpperCase())),
    ...swatches,
  ];
  const listed = (hex: string): boolean => list.some((c) => c.hex.toUpperCase() === hex);
  const base = current?.slice(0, 7);
  const own = base && toHex(base) && !listed(base) ? base : null;
  // A color from outside the row goes to the recent ones.
  const pickAny = (hex: string): void => {
    if (!listed(hex)) remember(hex);
    onPick(hex);
  };
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
      {own && (
        <button
          type="button"
          className="color-dot is-active"
          style={{ background: own }}
          title={`Cor própria · ${own}`}
          onClick={(e) => setPicker(picker ? null : e.currentTarget)}
        />
      )}
      <button
        type="button"
        className={`color-dot color-more ${picker ? "is-open" : ""}`}
        title="Mais cores…"
        aria-label="Mais cores"
        aria-expanded={!!picker}
        onClick={(e) => setPicker(picker ? null : e.currentTarget)}
      />
      {canSampleScreen() && (
        <button
          type="button"
          className="color-sample"
          title="Contagotas: clique em qualquer ponto da tela (Esc cancela)"
          aria-label="Contagotas"
          onClick={async () => {
            const hex = await sampleScreen();
            if (hex) pickAny(hex);
          }}
        >
          <Pipette size={13} />
        </button>
      )}
      {picker && (
        <ColorPicker
          anchor={picker}
          value={base ?? "#FFFFFF"}
          onApply={pickAny}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

/**
 * One color as a square that opens the full picker (any color, eyedropper), for a setting that
 * is a single color rather than a palette role.
 */
export function ColorButton({
  value,
  title,
  onPick,
}: {
  value: string;
  title: string;
  onPick: (hex: string) => void;
}): ReactNode {
  const remember = useRecentColors((s) => s.remember);
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        className="key-swatch"
        style={{ background: value }}
        title={title}
        aria-label={title}
        aria-expanded={!!picker}
        onClick={(e) => setPicker(picker ? null : e.currentTarget)}
      />
      {picker && (
        <ColorPicker
          anchor={picker}
          value={value}
          title={title}
          onApply={(hex) => {
            remember(hex);
            onPick(hex);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
