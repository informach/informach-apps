import type { Clip } from "@shared/types";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { setZoomLayer } from "@/lib/zoomLayer";

const clampCenter = (v: number, scale: number): number =>
  Math.min(1 - 0.5 / scale, Math.max(0.5 / scale, v));

interface Focus {
  scale: number;
  x: number;
  y: number;
}

/**
 * The part of a picture a zoom fills the screen with, over that picture (`left`, `top`,
 * `width` × `height` in the preview): drag the box to move the zoom, the mouse wheel changes how
 * close it gets. The zoom layer and the recording's zooms both use it.
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
  /** Least zoom the wheel goes to. */
  min?: number;
  onCommit: (change: Partial<Focus>) => void;
}): ReactNode {
  const [draft, setDraft] = useState<Focus>(focus);
  const wheelTimer = useRef<number | undefined>(undefined);
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
  const drag = (e: React.PointerEvent): void => {
    e.stopPropagation();
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, x, y };
    let last = draft;
    const move = (ev: PointerEvent): void => {
      last = {
        ...draft,
        x: clampCenter(start.x + (ev.clientX - start.px) / width, s),
        y: clampCenter(start.y + (ev.clientY - start.py) / height, s),
      };
      setDraft(last);
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommit({ x: last.x, y: last.y });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const wheel = (e: React.WheelEvent): void => {
    const next = Math.min(5, Math.max(min, s * Math.exp(-e.deltaY * 0.0015)));
    setDraft({ ...draft, scale: next });
    window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(
      () => onCommit({ scale: Math.round(next * 100) / 100 }),
      250,
    );
  };
  return (
    <div className="zoom-target-shade" style={{ left, top, width, height }} onWheel={wheel}>
      <div
        className="zoom-target"
        style={{ left: (x - 0.5 / s) * width, top: (y - 0.5 / s) * height, width: w, height: h }}
        onPointerDown={drag}
        title="Arraste para escolher o que aproxima; a rodinha do mouse muda o quanto"
      >
        <span>{s.toFixed(1)}×</span>
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
