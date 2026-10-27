import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import { type HsvColor, hexToHsv, hsvToHex, normalizeHex } from "./paint-color";

declare global {
  interface Window {
    EyeDropper?: new () => { open(options: { signal: AbortSignal }): Promise<{ sRGBHex: string }> };
  }
}

interface Props {
  label: string;
  color: string;
  opacity: number;
  palette: readonly string[];
  position: { top: number; left: number };
  onApply(color: string, opacity: number): void;
  onClose(): void;
  onSaveColor(color: string): void;
}

export function PaintPicker({
  label,
  color,
  opacity,
  palette,
  position,
  onApply,
  onClose,
  onSaveColor,
}: Props) {
  const [hsv, setHsv] = useState(() => hexToHsv(color));
  const [hexText, setHexText] = useState(() => hsvToHex(hexToHsv(color)));
  const [alpha, setAlpha] = useState(Math.round(opacity * 100));
  const [sampling, setSampling] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const current = hsvToHex(hsv);
  const validHex = normalizeHex(hexText);

  useEffect(() => {
    root.current?.focus();
    const dismiss = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) onClose();
    };
    document.addEventListener("pointerdown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      controller.current?.abort();
    };
  }, [onClose]);

  const change = (next: HsvColor) => {
    setHsv(next);
    setHexText(hsvToHex(next));
  };
  const pickAt = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    change({
      ...hsv,
      saturation: Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)),
      value: Math.min(100, Math.max(0, 100 - ((event.clientY - bounds.top) / bounds.height) * 100)),
    });
  };
  const sample = async () => {
    if (!window.EyeDropper || controller.current) return;
    const task = new AbortController();
    controller.current = task;
    setSampling(true);
    try {
      const picked = await new window.EyeDropper().open({ signal: task.signal });
      if (!task.signal.aborted && normalizeHex(picked.sRGBHex)) change(hexToHsv(picked.sRGBHex));
    } catch {
      // Escape and platform cancellation leave the drafted color intact.
    } finally {
      if (!task.signal.aborted) {
        controller.current = null;
        setSampling(false);
      }
    }
  };

  return (
    <div
      className="paint-picker"
      ref={root}
      role="dialog"
      tabIndex={-1}
      aria-label={`Escolher cor de ${label}`}
      style={position}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="paint-picker-top">
        <strong>Cor de {label}</strong>
        <button type="button" aria-label="Fechar seletor de cor" onClick={onClose}>
          ×
        </button>
      </div>
      <div
        className="paint-saturation"
        role="slider"
        tabIndex={0}
        aria-label="Saturação e luminosidade"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.saturation)}
        aria-valuetext={`${Math.round(hsv.saturation)}% de saturação, ${Math.round(hsv.value)}% de luminosidade`}
        style={{ backgroundColor: hsvToHex({ hue: hsv.hue, saturation: 100, value: 100 }) }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pickAt(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) pickAt(event);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          const delta = {
            ArrowLeft: { saturation: -step },
            ArrowRight: { saturation: step },
            ArrowDown: { value: -step },
            ArrowUp: { value: step },
          }[event.key];
          if (!delta) return;
          event.preventDefault();
          change({
            hue: hsv.hue,
            saturation: Math.min(100, Math.max(0, hsv.saturation + (delta.saturation ?? 0))),
            value: Math.min(100, Math.max(0, hsv.value + (delta.value ?? 0))),
          });
        }}
      >
        <span
          className="paint-saturation-thumb"
          style={{ left: `${hsv.saturation}%`, top: `${100 - hsv.value}%`, background: current }}
        />
      </div>
      <label className="paint-slider-label">
        Matiz
        <input
          className="paint-hue"
          type="range"
          min={0}
          max={359}
          value={Math.round(hsv.hue)}
          onChange={(event) => change({ ...hsv, hue: Number(event.target.value) })}
        />
      </label>
      <label className="paint-slider-label">
        Opacidade <span>{alpha}%</span>
        <input
          className="paint-alpha"
          type="range"
          min={0}
          max={100}
          value={alpha}
          style={{ "--paint-alpha-color": current } as CSSProperties}
          onChange={(event) => setAlpha(Number(event.target.value))}
        />
      </label>
      <div className="paint-hex-row">
        <span className="paint-preview" style={{ background: current, opacity: alpha / 100 }} />
        <label>
          Hexadecimal
          <input
            value={hexText}
            maxLength={7}
            spellCheck={false}
            aria-invalid={!validHex}
            onChange={(event) => {
              const next = event.target.value;
              setHexText(next);
              const normalized = normalizeHex(next);
              if (normalized) setHsv(hexToHsv(normalized));
            }}
          />
        </label>
        <button
          type="button"
          disabled={!window.EyeDropper || sampling}
          title="Amostrar uma cor da tela"
          aria-label="Amostrar uma cor da tela"
          onClick={() => void sample()}
        >
          ⊙
        </button>
      </div>
      {palette.length > 0 && (
        <fieldset className="paint-palette" aria-label="Paleta da prancheta">
          {palette.map((item) => (
            <button
              key={item}
              type="button"
              aria-label={`Selecionar ${item}`}
              title={item}
              style={{ background: item }}
              onClick={() => change(hexToHsv(item))}
            />
          ))}
        </fieldset>
      )}
      <div className="paint-picker-actions">
        <button type="button" onClick={() => onSaveColor(current)}>
          Guardar na paleta
        </button>
        <button
          type="button"
          className="paint-apply"
          disabled={!validHex}
          onClick={() => {
            if (validHex) onApply(validHex, alpha / 100);
          }}
        >
          Aplicar cor
        </button>
      </div>
    </div>
  );
}
