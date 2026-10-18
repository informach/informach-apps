/**
 * Fixed effects of a clip that do not change from frame to frame: the shape (rounded corners or
 * circle), the border ring and the drop shadow of that shape. Each one is a single picture made
 * by the FFmpeg graph below; the app renders it once per key as a PNG (main/export/fxAssets.ts)
 * and the export graph only multiplies or overlays it, instead of evaluating the shape pixel by
 * pixel in every frame. Without a cached PNG (tests, the plan built in one go) the same graph
 * runs inside the export, once.
 */

export type FxAsset =
  /** Gray picture: 255 inside the shape, 0 outside, antialiased at the edge. */
  | { kind: "mask"; w: number; h: number; radius: number }
  /** RGBA: the border color, opaque outside the content area (inside the border width). */
  | { kind: "ring"; w: number; h: number; radius: number; border: number; color: string }
  /**
   * RGBA: the shadow of the shape on a canvas `margin` pixels larger on every side, already
   * offset, blurred and multiplied by its opacity (and the clip's).
   */
  | {
      kind: "shadow";
      w: number;
      h: number;
      radius: number;
      margin: number;
      dx: number;
      dy: number;
      sigma: number;
      opacity: number;
      color: string;
    };

/** Path of the cached PNG for an asset, or null to make it inside the export graph. */
export type FxProvider = (asset: FxAsset) => string | null;

const n = (v: number): string => (Math.round(v * 1000) / 1000).toString();

/** A stable text naming the asset, for the cache. */
export function fxKey(a: FxAsset): string {
  switch (a.kind) {
    case "mask":
      return `mask:${a.w}x${a.h}:r${n(a.radius)}`;
    case "ring":
      return `ring:${a.w}x${a.h}:r${n(a.radius)}:b${n(a.border)}:${a.color.toLowerCase()}`;
    case "shadow":
      return `shadow:${a.w}x${a.h}:r${n(a.radius)}:m${a.margin}:${a.dx},${a.dy}:s${n(a.sigma)}:o${n(a.opacity)}:${a.color.toLowerCase()}`;
  }
}

/** Distance outside the rounded box of w × h with corner radius R (geq pixel coordinates). */
const outside = (R: number): string =>
  `hypot(max(abs(X-W/2)-(W/2-${n(R)}),0),max(abs(Y-H/2)-(H/2-${n(R)}),0))`;

/** 1 inside the shape, 0 outside. */
export function insideExpr(radius: number): string {
  return radius > 0 ? `clip(${n(radius)}-${outside(radius)}+0.5,0,1)` : "1";
}

/** 1 in the content area (inside the border), 0 on the border and outside. */
export function contentExpr(radius: number, border: number): string {
  if (border <= 0) return "1";
  return radius > 0
    ? `clip(${n(radius - border)}-${outside(radius)}+0.5,0,1)`
    : `(gte(X,${n(border)})*gte(Y,${n(border)})*lt(X,W-${n(border)})*lt(Y,H-${n(border)}))`;
}

const hex = (color: string): string => `0x${color.slice(1, 7)}`;
const rgb = (color: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];

/**
 * The FFmpeg graph (source filters only) whose output `[out]` is the asset's single frame, at
 * the export frame rate `rate`. `id` keeps its inner labels apart from the rest of a graph.
 */
export function fxGraph(a: FxAsset, rate: string, out: string, id = "fx"): string {
  const one = (w: number, h: number, color = "black"): string =>
    `color=c=${color}:s=${w}x${h}:r=${rate},trim=end_frame=1`;
  switch (a.kind) {
    case "mask":
      return `${one(a.w, a.h)},format=gray,geq=lum='255*${insideExpr(a.radius)}'[${out}]`;
    case "ring": {
      const [r, g, b] = rgb(a.color);
      return `${one(a.w, a.h, hex(a.color))},format=rgba,geq=r=${r}:g=${g}:b=${b}:a='255*(1-${contentExpr(a.radius, a.border)})'[${out}]`;
    }
    case "shadow": {
      const cw = a.w + 2 * a.margin;
      const ch = a.h + 2 * a.margin;
      return (
        `${one(a.w, a.h)},format=gray,geq=lum='255*${n(a.opacity)}*${insideExpr(a.radius)}',` +
        `pad=${cw}:${ch}:${a.margin + a.dx}:${a.margin + a.dy}:black,gblur=sigma=${n(a.sigma)}[${id}a];` +
        `${one(cw, ch, hex(a.color))},format=rgba[${id}c];[${id}c][${id}a]alphamerge[${out}]`
      );
    }
  }
}
