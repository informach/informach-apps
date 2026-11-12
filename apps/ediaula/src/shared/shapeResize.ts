import type { Annotation } from "./annotation.ts";

/**
 * A shape annotation resized on the stage (editor/ShapeSizeControl.tsx): its box's width and
 * height (Annotation.boxWidth/boxHeight, pixels at 1080p) change, not the picture's scale, so the
 * outline and the corners keep their thickness. Same limits as the sliders of the panel.
 */
export const SHAPE_LIMITS = { minW: 40, maxW: 1800, minH: 40, maxH: 1000 } as const;

/** The Destaque and the shapes (a panel that does not fill the frame) are sized on the stage. */
export function sizedOnStage(a: Annotation | undefined): boolean {
  return a?.kind === "highlight" || (a?.kind === "panel" && (a.boxWidth ?? 0) < 1920);
}

/** The box's size, with the defaults the picture is drawn with (lib/annotations.ts). */
export function shapeSize(a: Annotation): { w: number; h: number } {
  return a.kind === "highlight"
    ? { w: a.boxWidth ?? 360, h: a.boxHeight ?? 200 }
    : { w: a.boxWidth ?? 900, h: a.boxHeight ?? 500 };
}

/** Which side or corner is pulled: -1 left/top, 1 right/bottom, 0 neither. */
export interface Handle {
  sx: -1 | 0 | 1;
  sy: -1 | 0 | 1;
}

/**
 * The new size of a box pulled by `handle` by (du, dv), in 1080p pixels along the box's own
 * (turned) axes, and how far its center goes along them. The other side stays where it was;
 * `symmetric` (Alt) grows both sides around the center; `keepRatio` (Shift, on a corner) keeps
 * the proportion.
 */
export function shapeResize(
  start: { w: number; h: number },
  handle: Handle,
  delta: { du: number; dv: number },
  opts: { symmetric?: boolean; keepRatio?: boolean } = {},
): { w: number; h: number; shiftX: number; shiftY: number } {
  const L = SHAPE_LIMITS;
  const k = opts.symmetric ? 2 : 1;
  let w = handle.sx ? start.w + handle.sx * delta.du * k : start.w;
  let h = handle.sy ? start.h + handle.sy * delta.dv * k : start.h;
  if (opts.keepRatio && handle.sx && handle.sy) {
    const lo = Math.max(L.minW / start.w, L.minH / start.h);
    const hi = Math.min(L.maxW / start.w, L.maxH / start.h);
    const f = Math.min(hi, Math.max(lo, Math.max(w / start.w, h / start.h)));
    w = start.w * f;
    h = start.h * f;
  } else {
    w = Math.min(L.maxW, Math.max(L.minW, w));
    h = Math.min(L.maxH, Math.max(L.minH, h));
  }
  w = Math.round(w);
  h = Math.round(h);
  return {
    w,
    h,
    shiftX: opts.symmetric ? 0 : (handle.sx * (w - start.w)) / 2,
    shiftY: opts.symmetric ? 0 : (handle.sy * (h - start.h)) / 2,
  };
}
