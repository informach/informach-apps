import { type HsvColor, hexToHsv, hsvToHex } from "@informach/edi-desktop/color";
import { Pipette, X } from "lucide-react";
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { canSampleScreen, sampleScreen, toHex, useRecentColors } from "@/lib/colors";
import { useSwatches } from "@/lib/palettes";

const clamp = (v: number): number => Math.min(100, Math.max(0, v));

/**
 * Any color: saturation and brightness square, hue, hex, the eyedropper (any pixel on the
 * screen) and the palette and recent colors. Nothing changes until "Aplicar" (one undo step).
 */
export function ColorPicker({
  anchor,
  value,
  title = "Escolher cor",
  onApply,
  onClose,
}: {
  /** The button that opened it: the picker sits next to it, and clicking it again closes. */
  anchor: HTMLElement;
  value: string;
  title?: string;
  onApply: (hex: string) => void;
  onClose: () => void;
}): ReactNode {
  const start = toHex(value) ?? "#FFFFFF";
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(start));
  const [text, setText] = useState(start);
  const [sampling, setSampling] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const sampler = useRef<AbortController | null>(null);
  const palette = useSwatches();
  const recent = useRecentColors((s) => s.list);
  const current = hsvToHex(hsv).toUpperCase();
  const typed = toHex(text.startsWith("#") ? text : `#${text}`);

  const show = (next: HsvColor): void => {
    setHsv(next);
    setText(hsvToHex(next).toUpperCase());
  };
  const showHex = (hex: string): void => show(hexToHsv(hex));
  const apply = (hex = typed ?? current): void => {
    onApply(hex);
    onClose();
  };

  // Below the button (above it when there is no room), inside the window.
  useLayoutEffect(() => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    const at = anchor.getBoundingClientRect();
    const gap = 6;
    const below = at.bottom + gap;
    const top =
      below + box.height <= window.innerHeight - 8 ? below : Math.max(8, at.top - gap - box.height);
    const left = Math.min(Math.max(8, at.left), window.innerWidth - box.width - 8);
    setPlace({ top, left });
  }, [anchor]);

  useEffect(() => {
    root.current?.focus();
    const away = (e: globalThis.PointerEvent): void => {
      const t = e.target;
      if (t instanceof Node && !root.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      sampler.current?.abort();
    };
  }, [anchor, onClose]);

  const pickAt = (e: PointerEvent<HTMLDivElement>): void => {
    const b = e.currentTarget.getBoundingClientRect();
    show({
      hue: hsv.hue,
      saturation: clamp(((e.clientX - b.left) / b.width) * 100),
      value: clamp(100 - ((e.clientY - b.top) / b.height) * 100),
    });
  };
  const sample = async (): Promise<void> => {
    if (sampler.current) return;
    const task = new AbortController();
    sampler.current = task;
    setSampling(true);
    const hex = await sampleScreen(task.signal);
    if (task.signal.aborted) return;
    sampler.current = null;
    setSampling(false);
    if (hex) showHex(hex);
  };

  const dots = (list: string[], label: string): ReactNode =>
    list.length > 0 && (
      <fieldset className="color-picker-dots">
        <legend>{label}</legend>
        <div>
          {list.map((hex) => (
            <button
              type="button"
              key={hex}
              className={`color-dot ${hex === current ? "is-active" : ""}`}
              style={{ background: hex }}
              title={hex}
              onClick={() => showHex(hex)}
              onDoubleClick={() => apply(hex)}
            />
          ))}
        </div>
      </fieldset>
    );

  return createPortal(
    <div
      ref={root}
      className="color-picker"
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      style={place ?? { top: 0, left: 0, visibility: "hidden" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        } else if (e.key === "Enter" && typed) {
          e.preventDefault();
          apply();
        }
      }}
    >
      <div className="color-picker-head">
        <strong>{title}</strong>
        <button type="button" className="color-picker-x" aria-label="Fechar" onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      <div
        className="color-picker-sv"
        role="slider"
        tabIndex={0}
        aria-label="Saturação e brilho"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.saturation)}
        aria-valuetext={`${Math.round(hsv.saturation)}% de saturação, ${Math.round(hsv.value)}% de brilho`}
        style={{ backgroundColor: hsvToHex({ hue: hsv.hue, saturation: 100, value: 100 }) }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pickAt(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pickAt(e);
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 1;
          const move: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowDown: [0, -step],
            ArrowUp: [0, step],
          };
          const d = move[e.key];
          if (!d) return;
          e.preventDefault();
          show({
            hue: hsv.hue,
            saturation: clamp(hsv.saturation + d[0]),
            value: clamp(hsv.value + d[1]),
          });
        }}
      >
        <span
          className="color-picker-thumb"
          style={{ left: `${hsv.saturation}%`, top: `${100 - hsv.value}%`, background: current }}
        />
      </div>
      <input
        className="color-picker-hue"
        type="range"
        min={0}
        max={359}
        aria-label="Matiz"
        value={Math.round(hsv.hue)}
        onChange={(e) => show({ ...hsv, hue: Number(e.target.value) })}
      />
      <div className="color-picker-row">
        <span className="color-picker-compare" title={`Antes ${start} · agora ${current}`}>
          <span style={{ background: start }} />
          <span style={{ background: current }} />
        </span>
        <input
          className="color-picker-hex mono"
          value={text}
          maxLength={7}
          spellCheck={false}
          aria-label="Hexadecimal"
          aria-invalid={!typed}
          onChange={(e) => {
            setText(e.target.value);
            const hex = toHex(
              e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`,
            );
            if (hex) setHsv(hexToHsv(hex));
          }}
        />
        {canSampleScreen() && (
          <button
            type="button"
            className={`color-sample ${sampling ? "is-active" : ""}`}
            title="Contagotas: clique em qualquer ponto da tela (Esc cancela)"
            aria-label="Contagotas"
            disabled={sampling}
            onClick={() => void sample()}
          >
            <Pipette size={14} />
          </button>
        )}
      </div>
      {dots(
        palette.map((c) => c.hex.toUpperCase()),
        "Paleta",
      )}
      {dots(recent, "Recentes")}
      <div className="color-picker-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!typed}
          onClick={() => apply()}
        >
          Aplicar
        </button>
      </div>
    </div>,
    document.body,
  );
}
