import type { Crop } from "./compose.ts";

/**
 * Dragging a clip's mask on the preview (editor/MaskTarget.tsx). The mask is the clip's crop:
 * what is cut off each side, as shares of the picture, so the picture never moves with it.
 */

/** Smallest mask, as a share of the picture's side. */
export const MASK_MIN = 0.02;

export type MaskHandle = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const MASK_HANDLES: Exclude<MaskHandle, "move">[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/** A mask as edges, in pixels of the whole picture (0..fw, 0..fh). */
export interface Edges {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const round = (v: number): number => Math.round(v * 10000) / 10000;

export function cropToEdges(c: Crop, fw: number, fh: number): Edges {
  return { x0: c.left * fw, y0: c.top * fh, x1: (1 - c.right) * fw, y1: (1 - c.bottom) * fh };
}

export function edgesToCrop(e: Edges, fw: number, fh: number): Crop {
  // A side that lands within rounding of the picture's edge is the edge itself.
  const side = (v: number): number => {
    const r = round(v);
    return Math.abs(r) < 1e-4 ? 0 : r;
  };
  return {
    left: side(e.x0 / fw),
    top: side(e.y0 / fh),
    right: side(1 - e.x1 / fw),
    bottom: side(1 - e.y1 / fh),
  };
}

/**
 * The mask after dragging `handle` by (dx, dy) pixels (in the picture's own directions): moved
 * whole, or one side or corner pulled. With `lock` its proportion stays (the circle always): a
 * corner keeps the opposite corner still, a side keeps the opposite side and stays centered the
 * other way. It never leaves the picture nor gets smaller than MASK_MIN.
 */
export function dragMask(
  start: Edges,
  handle: MaskHandle,
  dx: number,
  dy: number,
  fw: number,
  fh: number,
  lock: boolean,
): Edges {
  const minW = MASK_MIN * fw;
  const minH = MASK_MIN * fh;
  if (handle === "move") {
    const w = start.x1 - start.x0;
    const h = start.y1 - start.y0;
    const x0 = Math.min(fw - w, Math.max(0, start.x0 + dx));
    const y0 = Math.min(fh - h, Math.max(0, start.y0 + dy));
    return { x0, y0, x1: x0 + w, y1: y0 + h };
  }
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const e = { ...start };
  if (west) e.x0 = Math.min(start.x1 - minW, Math.max(0, start.x0 + dx));
  if (east) e.x1 = Math.max(start.x0 + minW, Math.min(fw, start.x1 + dx));
  if (north) e.y0 = Math.min(start.y1 - minH, Math.max(0, start.y0 + dy));
  if (south) e.y1 = Math.max(start.y0 + minH, Math.min(fh, start.y1 + dy));
  if (!lock) return e;

  const ratio = (start.x1 - start.x0) / (start.y1 - start.y0);
  let w = e.x1 - e.x0;
  let h = e.y1 - e.y0;
  // The side pulled leads; at a corner, whichever grew more.
  const byWidth = (west || east) && (!(north || south) || w / ratio >= h);
  if (byWidth) h = w / ratio;
  else w = h * ratio;
  // Room to grow from the still corner or side, inside the picture.
  const cx = (start.x0 + start.x1) / 2;
  const cy = (start.y0 + start.y1) / 2;
  const roomW =
    west && !east ? start.x1 : east && !west ? fw - start.x0 : 2 * Math.min(cx, fw - cx);
  const roomH =
    north && !south ? start.y1 : south && !north ? fh - start.y0 : 2 * Math.min(cy, fh - cy);
  const fit = Math.min(1, roomW / w, roomH / h);
  w *= fit;
  h *= fit;
  const x0 = west && !east ? start.x1 - w : east && !west ? start.x0 : cx - w / 2;
  const y0 = north && !south ? start.y1 - h : south && !north ? start.y0 : cy - h / 2;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}
