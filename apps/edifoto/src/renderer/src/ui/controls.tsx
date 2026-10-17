import { type ReactNode, useEffect, useState } from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Shown after the number, e.g. "%" or "°". */
  unit?: string;
  /** Fill from the middle (for -100..100 corrections). */
  centered?: boolean;
  /** Extra class for a colored track (temp, tint, hue). */
  track?: string;
  /** Double-click resets to this. */
  reset?: number;
  digits?: number;
  onChange(v: number): void;
  /** Called once the drag ends (to close an undo step). */
  onCommit?(): void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  centered,
  track,
  reset,
  digits = 0,
  onChange,
  onCommit,
}: SliderProps): ReactNode {
  const [text, setText] = useState<string | null>(null);
  const p = ((value - min) / (max - min)) * 100;
  const show = (v: number): string => (digits ? v.toFixed(digits) : String(Math.round(v)));
  return (
    <div className="slider">
      <div className="slider-head">
        {reset === undefined ? (
          <span>{label}</span>
        ) : (
          <button
            type="button"
            style={{ border: 0, padding: 0, background: "none", color: "inherit" }}
            onClick={() => {
              onChange(reset);
              onCommit?.();
            }}
            title={`Redefinir ${label}`}
          >
            {label}
          </button>
        )}
        <span>
          <input
            className="slider-value"
            aria-label={`Valor de ${label}`}
            value={text ?? `${centered && value > 0 ? "+" : ""}${show(value)}${unit}`}
            onFocus={(e) => {
              setText(show(value));
              requestAnimationFrame(() => e.target.select());
            }}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              const n = parseFloat((text ?? "").replace(",", "."));
              if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
              setText(null);
              onCommit?.();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setText(null);
                (e.target as HTMLInputElement).blur();
              }
              e.stopPropagation();
            }}
          />
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        className={[centered && "centered", track].filter(Boolean).join(" ")}
        style={{ "--p": `${p}%` } as React.CSSProperties}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onDoubleClick={() => reset !== undefined && onChange(reset)}
      />
    </div>
  );
}

export function ColorSwatch({
  value,
  onChange,
  title,
}: {
  value: string;
  onChange(v: string): void;
  title?: string;
}): ReactNode {
  return (
    <label className="color-swatch" style={{ background: value }} title={title ?? value}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Toggle({
  on,
  onChange,
  title,
}: {
  on: boolean;
  onChange(v: boolean): void;
  title?: string;
}): ReactNode {
  return (
    <button
      type="button"
      className={`toggle${on ? " is-on" : ""}`}
      onClick={() => onChange(!on)}
      title={title}
      role="switch"
      aria-checked={on}
    />
  );
}

/** Numeric input that commits on blur/Enter and accepts commas. */
export function NumberField({
  label,
  value,
  onChange,
  digits = 0,
  suffix,
}: {
  label: string;
  value: number;
  onChange(v: number): void;
  digits?: number;
  suffix?: string;
}): ReactNode {
  const [text, setText] = useState(value.toFixed(digits));
  useEffect(() => setText(value.toFixed(digits)), [value, digits]);
  const commit = (): void => {
    const n = parseFloat(text.replace(",", "."));
    if (Number.isFinite(n) && n !== value) onChange(n);
    else setText(value.toFixed(digits));
  };
  return (
    <label className="num-field">
      {label}
      <input
        className="field"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          e.stopPropagation();
        }}
      />
      {suffix}
    </label>
  );
}
