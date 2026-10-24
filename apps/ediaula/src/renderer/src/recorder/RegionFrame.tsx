import { Lock, LockOpen, ScanLine } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A size field of the region: physical pixels, applied on Enter or when it loses focus. */
function SizeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}): ReactNode {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (): void => {
    const v = Math.round(Number(text));
    if (Number.isFinite(v) && v > 0 && v !== value) onCommit(v);
    else setText(String(value));
  };
  return (
    <input
      type="number"
      className="rec-region-size"
      aria-label={label}
      title={`${label} em pixels da tela`}
      min={80}
      step={2}
      value={text}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

/** What each handle of the region does, for the screen reader. */
const HANDLE_LABELS: Record<string, string> = {
  nw: "canto superior esquerdo",
  n: "borda de cima",
  ne: "canto superior direito",
  e: "borda direita",
  se: "canto inferior direito",
  s: "borda de baixo",
  sw: "canto inferior esquerdo",
  w: "borda esquerda",
};

/**
 * The region moved ("move") or resized from a handle ("nw", "e"…) by dx, dy window pixels from
 * `r0`, kept inside the window and at least 80 pixels on each side.
 */
function reshapeRegion(r0: Rect, mode: string, dx: number, dy: number): Rect {
  const W = window.innerWidth;
  const H = window.innerHeight;
  let { x, y, width, height } = r0;
  if (mode === "move") {
    x = Math.min(Math.max(0, x + dx), W - width);
    y = Math.min(Math.max(0, y + dy), H - height);
  } else {
    if (mode.includes("w")) {
      x = Math.min(Math.max(0, r0.x + dx), r0.x + r0.width - 80);
      width = r0.x + r0.width - x;
    }
    if (mode.includes("e")) width = Math.min(Math.max(80, r0.width + dx), W - r0.x);
    if (mode.includes("n")) {
      y = Math.min(Math.max(0, r0.y + dy), r0.y + r0.height - 80);
      height = r0.y + r0.height - y;
    }
    if (mode.includes("s")) height = Math.min(Math.max(80, r0.height + dy), H - r0.y);
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** Arrow keys on a handle: one pixel, ten with Shift. */
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Region of the screen to record: drag inside to move, handles to resize, size typed in. With
 * `onHover` (the frame over a recorded screen that the controls left free) only the handles and
 * the size tag take the mouse, each saying when the pointer is on them; the inside lets every
 * click through to the screen.
 */
export function RegionFrame({
  region,
  onChange,
  editable,
  recording,
  size,
  lock,
  onLock,
  onSize,
  onHover,
}: {
  region: Rect;
  onChange: (r: Rect) => void;
  editable: boolean;
  recording: boolean;
  /** Physical pixels the take will record. */
  size: { w: number; h: number };
  lock: boolean;
  onLock: (lock: boolean) => void;
  onSize: (size: { width?: number; height?: number }) => void;
  onHover?: (on: boolean) => void;
}): ReactNode {
  /** The pointer is on a handle or the tag (the frame keeps the mouse while dragging too). */
  const over = useRef(false);
  const dragging = useRef(false);
  const hover = (on: boolean): void => {
    over.current = on;
    if (!dragging.current) onHover?.(on);
  };
  const drag = (e: ReactPointerEvent, mode: string): void => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const r0 = region;
    dragging.current = true;
    const move = (ev: PointerEvent): void =>
      onChange(reshapeRegion(r0, mode, ev.clientX - sx, ev.clientY - sy));
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragging.current = false;
      if (!over.current) onHover?.(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const nudge = (e: ReactKeyboardEvent, mode: string): void => {
    const step = ARROWS[e.key];
    if (!editable || !step) return;
    e.preventDefault();
    e.stopPropagation();
    const by = e.shiftKey ? 10 : 1;
    onChange(reshapeRegion(region, mode, step[0] * by, step[1] * by));
  };
  const pass = !!onHover;
  const hoverProps = pass
    ? { onPointerEnter: () => hover(true), onPointerLeave: () => hover(false) }
    : {};
  const style = { left: region.x, top: region.y, width: region.width, height: region.height };
  return (
    <div
      className={`rec-region ${recording ? "is-recording" : ""} ${editable ? "is-editable" : ""} ${pass ? "is-pass" : ""}`}
      style={style}
      onPointerDown={pass ? undefined : (e) => drag(e, "move")}
    >
      {editable && (
        <>
          <span className="rec-region-tag" {...hoverProps}>
            <button
              type="button"
              className="rec-region-move"
              title="Mover a região (setas; Shift move de 10 em 10)"
              aria-label="Mover a região com as setas do teclado"
              onPointerDown={(e) => drag(e, "move")}
              onKeyDown={(e) => nudge(e, "move")}
            >
              <ScanLine size={13} />
            </button>{" "}
            Região
            <SizeField label="Largura" value={size.w} onCommit={(width) => onSize({ width })} />
            ×
            <SizeField label="Altura" value={size.h} onCommit={(height) => onSize({ height })} />
            <button
              type="button"
              className={`rec-region-lock ${lock ? "is-on" : ""}`}
              title={lock ? "Proporção travada" : "Proporção livre"}
              aria-pressed={lock}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onLock(!lock)}
            >
              {lock ? <Lock size={12} /> : <LockOpen size={12} />}
            </button>
          </span>
          {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => (
            <button
              type="button"
              key={h}
              className={`rec-handle h-${h}`}
              aria-label={`Redimensionar pela ${HANDLE_LABELS[h]} com as setas do teclado`}
              onPointerDown={(e) => drag(e, h)}
              onKeyDown={(e) => nudge(e, h)}
              {...hoverProps}
            />
          ))}
        </>
      )}
    </div>
  );
}
