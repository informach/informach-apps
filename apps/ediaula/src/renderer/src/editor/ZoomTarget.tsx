import type { Clip } from "@shared/types";
import { type FocusCorner, MAX_FOCUS_SCALE, resizeFocus } from "@shared/zoomLayer";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { setZoomLayer } from "@/lib/zoomLayer";

const clampCenter = (v: number, scale: number): number =>
  Math.min(1 - 0.5 / scale, Math.max(0.5 / scale, v));

const CORNERS: FocusCorner[] = ["nw", "ne", "sw", "se"];

interface Focus {
  scale: number;
  x: number;
  y: number;
}

/**
 * The part of a picture a zoom fills the screen with, over that picture (`left`, `top`,
 * `width` × `height` in the preview): drag the box to move the zoom, a corner handle (or the
 * mouse wheel) to change how close it gets. The zoom layer and the recording's zooms both use it.
 */
export function FocusBox({
  focus,
  left = 0,
  top = 0,
  width,
  height,
  min = 1,
  onCommit,
}: {
  focus: Focus;
  left?: number;
  top?: number;
  width: number;
  height: number;
  /** Least zoom the wheel and the handles go to. */
  min?: number;
  onCommit: (change: Partial<Focus>) => void;
}): ReactNode {
  const [draft, setDraft] = useState<Focus>(focus);
  const wheelTimer = useRef<number | undefined>(undefined);
  const shadeRef = useRef<HTMLDivElement>(null);
  // A new value from outside (undo, the panel), compared by value: the parent may rebuild it.
  useEffect(
    () => setDraft({ scale: focus.scale, x: focus.x, y: focus.y }),
    [focus.scale, focus.x, focus.y],
  );
  const s = draft.scale;
  const x = clampCenter(draft.x, s);
  const y = clampCenter(draft.y, s);
  const w = width / s;
  const h = height / s;
  /**
   * Follows the pointer until it is let go, then commits what it ended on (`moveOnly`: just the
   * point, the zoom stays as it is).
   */
  const follow = (
    e: React.PointerEvent,
    next: (ev: PointerEvent) => Focus,
    moveOnly = false,
  ): void => {
    e.stopPropagation();
    e.preventDefault();
    let last: Focus | null = null;
    const move = (ev: PointerEvent): void => {
      last = next(ev);
      setDraft(last);
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (last) onCommit(moveOnly ? { x: last.x, y: last.y } : last);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const drag = (e: React.PointerEvent): void => {
    const start = { px: e.clientX, py: e.clientY };
    follow(
      e,
      (ev) => ({
        scale: s,
        x: clampCenter(x + (ev.clientX - start.px) / width, s),
        y: clampCenter(y + (ev.clientY - start.py) / height, s),
      }),
      true,
    );
  };
  const resize = (e: React.PointerEvent, corner: FocusCorner): void => {
    const rect = shadeRef.current?.getBoundingClientRect();
    if (!rect) return;
    follow(e, (ev) => {
      const r = resizeFocus(
        { scale: s, x, y },
        corner,
        (ev.clientX - rect.left) / width,
        (ev.clientY - rect.top) / height,
        min,
      );
      return { ...r, scale: Math.round(r.scale * 100) / 100 };
    });
  };
  const wheel = (e: React.WheelEvent): void => {
    const next = Math.min(MAX_FOCUS_SCALE, Math.max(min, s * Math.exp(-e.deltaY * 0.0015)));
    setDraft({ ...draft, scale: next });
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(
      () => onCommit({ scale: Math.round(next * 100) / 100 }),
      250,
    );
  };
  return (
    <div
      ref={shadeRef}
      className="zoom-target-shade"
      style={{ left, top, width, height }}
      onWheel={wheel}
    >
      <div
        className="zoom-target"
        style={{ left: (x - 0.5 / s) * width, top: (y - 0.5 / s) * height, width: w, height: h }}
        onPointerDown={drag}
        title="Arraste para escolher o que aproxima; as alças dos cantos (ou a rodinha do mouse) mudam o quanto"
      >
        <span>{s.toFixed(1)}×</span>
        {CORNERS.map((c) => (
          <i
            key={c}
            className={`zoom-target-handle gizmo-${c}`}
            onPointerDown={(e) => resize(e, c)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * While a zoom layer is selected, the preview shows the frame without it and this box: the part
 * that will fill the screen.
 */
export function ZoomTarget({
  clip,
  width,
  height,
}: {
  clip: Clip;
  width: number;
  height: number;
}): ReactNode {
  const z = clip.zoomLayer!;
  return (
    <FocusBox
      focus={{ scale: z.scale, x: z.x, y: z.y }}
      width={width}
      height={height}
      onCommit={(change) => setZoomLayer(clip.id, change)}
    />
  );
}
