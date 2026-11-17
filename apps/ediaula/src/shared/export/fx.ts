/**
 * Fixed effects of a clip that do not change from frame to frame: the shape (rounded corners or
 * circle), the border ring and the drop shadow of that shape. Each one is a single picture made
 * by the FFmpeg graph below; the app renders it once per key as a PNG (main/export/fxAssets.ts)
 * and the export graph only multiplies or overlays it, instead of evaluating the shape pixel by
 * pixel in every frame. Without a cached PNG (tests, the plan built in one go) the same graph
 * runs inside the export, once.
 */

import type { Polygon, PolygonPoint } from "../compose.ts";
import { type DimHole, triangleCorners } from "../dim.ts";
import { type Device, deviceGeometry, type Rect } from "../look.ts";

/**
 * An ellipse or a polygon instead of the rounded box, and a soft edge inward (shared/compose.ts
 * maskShape). The polygon's corners are fractions of the picture.
 */
interface ShapeExtras {
  ellipse?: boolean;
  feather?: number;
  polygon?: Polygon;
}

export type FxAsset =
  /** Gray picture: 255 inside the shape, 0 outside, antialiased at the edge (or soft). */
  | ({ kind: "mask"; w: number; h: number; radius: number } & ShapeExtras)
  /** RGBA: the border color, opaque outside the content area (inside the border width). */
  | ({
      kind: "ring";
      w: number;
      h: number;
      radius: number;
      border: number;
      color: string;
    } & ShapeExtras)
  /**
   * RGBA: the shadow of the shape on a canvas `margin` pixels larger on every side, already
   * offset, blurred and multiplied by its opacity (and the clip's).
   */
  | ({
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
    } & ShapeExtras)
  /** Gray: 255 inside, softening to 0 over `feather` pixels at the edges (region blur). */
  | { kind: "feather"; w: number; h: number; feather: number }
  /**
   * RGBA, the whole frame: black at `darkness` around the rectangle (x, y, rw, rh) and clear
   * inside it, with the soft edge of shared/look.ts spotlightAlpha.
   */
  | {
      kind: "spotlight";
      w: number;
      h: number;
      x: number;
      y: number;
      rw: number;
      rh: number;
      radius: number;
      feather: number;
      darkness: number;
    }
  /**
   * RGBA, the whole frame: black at `darkness` around a Destaque's box and clear inside it, with
   * a pixel of antialiasing (shared/dim.ts DimHole: center, size, shape and turn).
   */
  | { kind: "dim"; w: number; h: number; hole: DimHole }
  /** RGBA: a laptop, tablet or phone around a transparent screen (shared/look.ts deviceGeometry). */
  | { kind: "device"; device: Device; w: number; h: number }
  /** RGB: the lesson's background gradient (shared/look.ts gradientAt). */
  | { kind: "gradient"; w: number; h: number; from: string; to: string; angle: number };

/** Path of the cached PNG for an asset, or null to make it inside the export graph. */
export type FxProvider = (asset: FxAsset) => string | null;

const n = (v: number): string => (Math.round(v * 1000) / 1000).toString();

/** The ellipse and the soft edge in a key (nothing for the shapes made before them). */
const extrasKey = (a: ShapeExtras): string =>
  `${a.ellipse ? ":e" : ""}${a.feather ? `:f${n(a.feather)}` : ""}${a.polygon ? `:p${a.polygon.map((outline) => outline.map(([x, y]) => `${fine(x)},${fine(y)}`).join(";")).join("|")}` : ""}`;

/** A number with the digits a polygon's sides need (no exponent, which FFmpeg reads otherwise). */
const fine = (v: number): string => {
  const text = v.toFixed(9).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
};

/**
 * Signed distance to the polygon's edge, negative inside (even-odd), for a picture of w × h:
 * the same formula as shared/compose.ts polygonDistance, with every side's constants worked
 * out here so FFmpeg does as little as possible per pixel.
 */
function polygonDistanceExpr(
  polygon: readonly (readonly PolygonPoint[])[],
  w: number,
  h: number,
  x = "(X+0.5)",
  y = "(Y+0.5)",
): string {
  const near: string[] = [];
  const crossings: string[] = [];
  // Every side of every outline: the nearest one gives the distance, and the crossings of all
  // of them say inside or out (even-odd).
  for (const points of polygon)
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const ax = points[j][0] * w;
      const ay = points[j][1] * h;
      const dx = points[i][0] * w - ax;
      const dy = points[i][1] * h - ay;
      const l2 = dx * dx + dy * dy;
      if (l2 > 0) {
        const k = `clip(${x}*${fine(dx / l2)}+${y}*${fine(dy / l2)}-${fine((ax * dx + ay * dy) / l2)},0,1)`;
        near.push(`hypot(${x}-${fine(ax)}-${k}*${fine(dx)},${y}-${fine(ay)}-${k}*${fine(dy)})`);
      } else near.push(`hypot(${x}-${fine(ax)},${y}-${fine(ay)})`);
      if (dy !== 0)
        crossings.push(
          `abs(gt(${fine(ay)},${y})-gt(${fine(ay + dy)},${y}))*lt(${x},${fine(ax)}+${fine(dx / dy)}*(${y}-${fine(ay)}))`,
        );
    }
  // A balanced tree of min(), so the expression stays shallow.
  let level = near;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2)
      next.push(i + 1 < level.length ? `min(${level[i]},${level[i + 1]})` : level[i]);
    level = next;
  }
  const inside = crossings.length ? `mod(${crossings.join("+")},2)` : "0";
  return `((1-2*${inside})*${level[0]})`;
}

/** A stable text naming the asset, for the cache. */
export function fxKey(a: FxAsset): string {
  switch (a.kind) {
    case "mask":
      return `mask:${a.w}x${a.h}:r${n(a.radius)}${extrasKey(a)}`;
    case "ring":
      return `ring:${a.w}x${a.h}:r${n(a.radius)}:b${n(a.border)}:${a.color.toLowerCase()}${extrasKey(a)}`;
    case "shadow":
      // "z": padded with zeros (the pictures cached before had a faint box around the shadow).
      return `shadow:${a.w}x${a.h}:r${n(a.radius)}:m${a.margin}:${a.dx},${a.dy}:s${n(a.sigma)}:o${n(a.opacity)}:${a.color.toLowerCase()}${extrasKey(a)}:z`;
    case "feather":
      return `feather:${a.w}x${a.h}:f${n(a.feather)}`;
    case "spotlight":
      return `spotlight:${a.w}x${a.h}:${a.x},${a.y},${a.rw},${a.rh}:r${n(a.radius)}:f${n(a.feather)}:d${n(a.darkness)}`;
    case "dim": {
      const o = a.hole;
      return `dim:${a.w}x${a.h}:${o.shape}:${n(o.cx)},${n(o.cy)},${n(o.w)},${n(o.h)}:r${n(o.radius)}:a${n(o.angle)}${o.flipV ? ":v" : ""}:d${n(o.darkness)}${extrasKey({ ...(o.polygon ? { polygon: o.polygon } : {}) })}`;
    }
    case "device":
      // "v2": the parts of each device (the frames cached before had no edge or buttons).
      return `device:${a.device}:${a.w}x${a.h}:v2`;
    case "gradient":
      return `gradient:${a.w}x${a.h}:${a.from.toLowerCase()}:${a.to.toLowerCase()}:${n(a.angle)}`;
  }
}

/** Distance outside the rounded box of w × h with corner radius R (geq pixel coordinates). */
const outside = (R: number): string =>
  `hypot(max(abs(X-W/2)-(W/2-${n(R)}),0),max(abs(Y-H/2)-(H/2-${n(R)}),0))`;

/** 1 inside the shape, 0 outside. */
export function insideExpr(radius: number): string {
  return radius > 0 ? `clip(${n(radius)}-${outside(radius)}+0.5,0,1)` : "1";
}

/**
 * Signed distance to the shape's edge, negative inside (pixel centers): the ellipse filling the
 * picture, or the box with rounded corners. Same formula as shared/compose.ts shapeDistance.
 */
function distanceExpr(radius: number, ellipse: boolean, inset = 0): string {
  const cx = "(X+0.5-W/2)";
  const cy = "(Y+0.5-H/2)";
  if (ellipse)
    return `((hypot(${cx}/(W/2-${n(inset)}),${cy}/(H/2-${n(inset)}))-1)*(min(W,H)/2-${n(inset)}))`;
  const R = Math.max(0, radius - inset);
  const qx = `(abs(${cx})-(W/2-${n(inset)}-${n(R)}))`;
  const qy = `(abs(${cy})-(H/2-${n(inset)}-${n(R)}))`;
  return `(hypot(max(${qx},0),max(${qy},0))+min(max(${qx},${qy}),0)-${n(R)})`;
}

/**
 * 1 inside the shape, 0 outside: the rounded box as before, or (with an ellipse or a soft edge)
 * from the signed distance, softening inward over `feather` pixels.
 */
export function shapeExpr(
  radius: number,
  extras: ShapeExtras = {},
  size?: { w: number; h: number },
): string {
  const feather = extras.feather ?? 0;
  const polygon = extras.polygon && size ? extras.polygon : undefined;
  if (!extras.ellipse && !polygon && feather <= 0) return insideExpr(radius);
  const d = polygon
    ? polygonDistanceExpr(polygon, size?.w ?? 0, size?.h ?? 0)
    : distanceExpr(radius, !!extras.ellipse);
  return feather > 0 ? `clip(-${d}/${n(feather)},0,1)` : `clip(0.5-${d},0,1)`;
}

/** 1 in the content area (inside the border), 0 on the border and outside. */
export function contentExpr(
  radius: number,
  border: number,
  ellipse = false,
  polygon?: { points: Polygon; w: number; h: number },
): string {
  if (border <= 0) return "1";
  if (polygon)
    return `clip(${n(0.5 - border)}-${polygonDistanceExpr(polygon.points, polygon.w, polygon.h)},0,1)`;
  if (ellipse) return `clip(0.5-${distanceExpr(0, true, border)},0,1)`;
  return radius > 0
    ? `clip(${n(radius - border)}-${outside(radius)}+0.5,0,1)`
    : `(gte(X,${n(border)})*gte(Y,${n(border)})*lt(X,W-${n(border)})*lt(Y,H-${n(border)}))`;
}

const hex = (color: string): string => `0x${color.slice(1, 7)}`;

/**
 * Pads a gray picture (w × h) onto a bigger one at (x, y) with zeros around it. FFmpeg's pad
 * fills a gray picture with video black, 16, which as transparency would leave a faint box.
 */
export function padGray(
  cw: number,
  ch: number,
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  return `pad=${cw}:${ch}:${x}:${y}:black,geq=lum='if(gte(X,${x})*lt(X,${x + w})*gte(Y,${y})*lt(Y,${y + h}),p(X,Y),0)'`;
}

/** Distance of (X, Y) outside the rounded box (x, y, w, h, radius R); negative inside. */
const boxDistance = (x: number, y: number, w: number, h: number, R: number): string => {
  const r = Math.min(R, w / 2, h / 2);
  return `(hypot(max(abs(X-${n(x + w / 2)})-${n(w / 2 - r)},0),max(abs(Y-${n(y + h / 2)})-${n(h / 2 - r)},0))-${n(r)})`;
};
/** 1 inside the rounded box, 0 outside, antialiased over a pixel. */
const inBox = (b: Rect, R: number): string => `clip(0.5-${boxDistance(b.x, b.y, b.w, b.h, R)},0,1)`;
const rgb = (color: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];

/**
 * Signed distance (pixels) of a pixel's center from the Destaque's shape, positive outside: the
 * pixel brought into the box's own unturned frame, then the rounded box's, the ellipse's or the
 * triangle's distance.
 */
function holeDistance(o: DimHole): string {
  const turn = (o.angle * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const x = `(X+0.5-${n(o.cx)})`;
  const y = `(Y+0.5-${n(o.cy)})`;
  const U = o.angle ? `(${x}*${n(cos)}+${y}*${n(sin)})` : x;
  const V = o.angle ? `(${y}*${n(cos)}-${x}*${n(sin)})` : y;
  // A polygon's corners are fractions of the box, from its top-left corner.
  if (o.polygon)
    return polygonDistanceExpr(o.polygon, o.w, o.h, `(${U}+${n(o.w / 2)})`, `(${V}+${n(o.h / 2)})`);
  if (o.shape === "ellipse") {
    const rx = Math.max(0.5, o.w / 2);
    const ry = Math.max(0.5, o.h / 2);
    return `((hypot(${U}/${n(rx)},${V}/${n(ry)})-1)*${n(Math.min(rx, ry))})`;
  }
  if (o.shape === "triangle") {
    const pts = triangleCorners(o);
    const edges = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      const third = pts[(i + 2) % pts.length];
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      // The normal pointing away from the third corner: outward.
      const out = dy * (third[0] - p[0]) - dx * (third[1] - p[1]) > 0 ? -1 : 1;
      const nx = (out * dy) / len;
      const ny = (-out * dx) / len;
      return `((${U}-${n(p[0])})*${n(nx)}+(${V}-${n(p[1])})*${n(ny)})`;
    });
    return `max(max(${edges[0]},${edges[1]}),${edges[2]})`;
  }
  // Rounded (or square) box: exact outside, the distance to the nearest side inside.
  const r = Math.min(o.radius, o.w / 2, o.h / 2);
  const qx = `(abs(${U})-${n(o.w / 2 - r)})`;
  const qy = `(abs(${V})-${n(o.h / 2 - r)})`;
  return `(hypot(max(${qx},0),max(${qy},0))+min(max(${qx},${qy}),0)-${n(r)})`;
}

/**
 * The FFmpeg graph (source filters only) whose output `[out]` is the asset's single frame, at
 * the export frame rate `rate`. `id` keeps its inner labels apart from the rest of a graph.
 */
export function fxGraph(a: FxAsset, rate: string, out: string, id = "fx"): string {
  const one = (w: number, h: number, color = "black"): string =>
    `color=c=${color}:s=${w}x${h}:r=${rate},trim=end_frame=1`;
  switch (a.kind) {
    case "mask":
      return `${one(a.w, a.h)},format=gray,geq=lum='255*${shapeExpr(a.radius, a, a)}'[${out}]`;
    case "ring": {
      const [r, g, b] = rgb(a.color);
      return `${one(a.w, a.h, hex(a.color))},format=rgba,geq=r=${r}:g=${g}:b=${b}:a='255*(1-${contentExpr(a.radius, a.border, a.ellipse, a.polygon && { points: a.polygon, w: a.w, h: a.h })})'[${out}]`;
    }
    case "feather": {
      // The distance to the nearest edge, over the feather, eased like the preview's mask.
      const f = Math.max(0.5, a.feather);
      return `${one(a.w, a.h)},format=gray,geq=lum='255*clip(min(min(X+0.5,W-X-0.5),min(Y+0.5,H-Y-0.5))/${n(f)},0,1)'[${out}]`;
    }
    case "spotlight": {
      const d = boxDistance(a.x, a.y, a.rw, a.rh, a.radius);
      const alpha =
        a.feather > 0 ? `if(lte(${d},0),0,clip(0.5+${d}/${n(2 * a.feather)},0,1))` : `gt(${d},0)`;
      return `${one(a.w, a.h)},format=rgba,geq=r=0:g=0:b=0:a='255*${n(a.darkness)}*${alpha}'[${out}]`;
    }
    case "dim":
      return `${one(a.w, a.h)},format=rgba,geq=r=0:g=0:b=0:a='255*${n(a.hole.darkness)}*clip(0.5+${holeDistance(a.hole)},0,1)'[${out}]`;
    case "device": {
      const g = deviceGeometry(a.device, a.w, a.h);
      // The preview's canvas, pixel by pixel: each part laid over the ones before it (colour
      // premultiplied by coverage), the screen cut out, then the parts over the picture.
      const color = ["0", "0", "0"];
      let alpha = "0";
      const lay = (k: string, rgbOf: [number, number, number] | null): void => {
        for (let i = 0; i < 3; i++)
          color[i] = `${rgbOf ? `${rgbOf[i]}*${k}+` : ""}(${color[i]})*(1-${k})`;
        alpha = `${rgbOf ? `${k}+` : ""}(${alpha})*(1-${k})`;
      };
      for (const p of g.frame) lay(inBox(p.rect, p.radius), rgb(p.color));
      lay(inBox(g.screen, g.screenRadius), null);
      for (const p of g.over) lay(inBox(p.rect, p.radius), rgb(p.color));
      const [r, gr, b] = color.map((c) => `'(${c})/max(${alpha},0.001)'`);
      return `${one(a.w, a.h)},format=rgba,geq=r=${r}:g=${gr}:b=${b}:a='255*(${alpha})'[${out}]`;
    }
    case "gradient": {
      const r = (Math.PI * a.angle) / 180;
      const length = Math.abs(a.w * Math.sin(r)) + Math.abs(a.h * Math.cos(r));
      const p = `clip(((X+0.5-${n(a.w / 2)})*${n(Math.sin(r))}-(Y+0.5-${n(a.h / 2)})*${n(Math.cos(r))})/${n(length)}+0.5,0,1)`;
      const [r0, g0, b0] = rgb(a.from);
      const [r1, g1, b1] = rgb(a.to);
      const mix = (u: number, v: number): string => `${u}+${v - u}*${p}`;
      return `${one(a.w, a.h)},format=rgb24,geq=r='${mix(r0, r1)}':g='${mix(g0, g1)}':b='${mix(b0, b1)}'[${out}]`;
    }
    case "shadow": {
      const cw = a.w + 2 * a.margin;
      const ch = a.h + 2 * a.margin;
      return (
        `${one(a.w, a.h)},format=gray,geq=lum='255*${n(a.opacity)}*${shapeExpr(a.radius, a, a)}',` +
        `${padGray(cw, ch, a.margin + a.dx, a.margin + a.dy, a.w, a.h)},gblur=sigma=${n(a.sigma)}[${id}a];` +
        `${one(cw, ch, hex(a.color))},format=rgba[${id}c];[${id}c][${id}a]alphamerge[${out}]`
      );
    }
  }
}
