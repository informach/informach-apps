import {
  CURSOR_EFFECT_DEFAULTS,
  type CursorFx,
  type CursorState,
  type CursorTrack,
  cursorAt,
  cursorScale,
  fxAt,
  magnifierRadius,
  magnifierSource,
  type Ripple,
  ripplesAt,
  spotlightDim,
  spotlightRadius,
} from "@shared/cursor";
import type { CursorData } from "@shared/cursorData";
import { CURSOR_SHAPES, type CursorShape } from "@shared/recording";
import type { CursorImages } from "./cursorImages";

/**
 * Draws the pointer, its halo, click rings and the cursor effects. Used by the preview (live,
 * over the video), to pre-render the pointer video for the export, by Estender quadro and by the
 * frames the AI looks at, so all of them look the same.
 * Shapes are in "pointer units": the standard arrow is ~24 units tall; `scale` = pixels per unit.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Paths with the hotspot at (0, 0).
const ARROW = new Path2D("M0 0 L0 20.5 L4.8 15.9 L8.2 23.6 L11.6 22.1 L8.3 14.6 L14.8 14.6 Z");
const HAND = new Path2D(
  "M-1 1.2 C-1 -0.6 2 -0.6 2 1.2 L2 9 L2.6 9 L2.6 7.7 C2.6 6.2 5.3 6.2 5.3 7.7 L5.3 9.4 L5.9 9.4 L5.9 8.6 C5.9 7.1 8.6 7.1 8.6 8.6 L8.6 10.1 L9.2 10.1 C9.2 8.8 11.8 8.8 11.8 10.1 L11.8 15.6 C11.8 19.6 9.6 22.2 6.2 22.2 L4 22.2 C1.9 22.2 0.4 21.2 -0.8 19.5 L-4.6 14 C-5.5 12.7 -3.9 11.1 -2.5 12.1 L-1 13.6 Z",
);
/** Four-way arrow ("move"), centered on the hotspot. */
const MOVE = new Path2D(
  "M0 -11 L3.6 -7 L1.3 -7 L1.3 -1.3 L7 -1.3 L7 -3.6 L11 0 L7 3.6 L7 1.3 L1.3 1.3 L1.3 7 L3.6 7 L0 11 L-3.6 7 L-1.3 7 L-1.3 1.3 L-7 1.3 L-7 3.6 L-11 0 L-7 -3.6 L-7 -1.3 L-1.3 -1.3 L-1.3 -7 L-3.6 -7 Z",
);
/** Double arrow along x, centered on the hotspot; the other resize shapes turn it. */
const DOUBLE = new Path2D(
  "M-11 0 L-6.4 -4.6 L-6.4 -1.5 L6.4 -1.5 L6.4 -4.6 L11 0 L6.4 4.6 L6.4 1.5 L-6.4 1.5 L-6.4 4.6 Z",
);
const TURN: Partial<Record<CursorShape, number>> = {
  ew: 0,
  ns: Math.PI / 2,
  nwse: Math.PI / 4,
  nesw: -Math.PI / 4,
};
const TEXT_SEGMENTS: [number, number, number, number][] = [
  [-3.4, -10, 3.4, -10],
  [0, -10, 0, 10],
  [-3.4, 10, 3.4, 10],
];
const CROSS_SEGMENTS: [number, number, number, number][] = [
  [-10, 0, -2, 0],
  [2, 0, 10, 0],
  [0, -10, 0, -2],
  [0, 2, 0, 10],
];
/** Shapes of the standard set: past them, an image of the take. */
const STANDARD = CURSOR_SHAPES.length;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex);
  return m
    ? [Number.parseInt(m[1], 16), Number.parseInt(m[2], 16), Number.parseInt(m[3], 16)]
    : [255, 226, 64];
}

/** Thin strokes with a dark core and a light edge (text bar, crosshair). */
function strokes(ctx: Ctx, segments: [number, number, number, number][]): void {
  for (const [w, color] of [
    [3.2, "#111"],
    [1.3, "#fff"],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (const [a, b, c, d] of segments) {
      ctx.moveTo(a, b);
      ctx.lineTo(c, d);
    }
    ctx.stroke();
    ctx.shadowColor = "transparent";
  }
}

/** A filled shape in the pointer's colours: white with a dark edge. */
function filled(ctx: Ctx, path: Path2D): void {
  ctx.fillStyle = "#fff";
  ctx.fill(path);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1.3;
  ctx.stroke(path);
}

/** The busy ring of Windows: a light circle with a blue arc. */
function ring(ctx: Ctx, cx: number, cy: number, r: number, width: number): void {
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = width + 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(17, 17, 17, 0.35)";
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#2b7de9";
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI);
  ctx.stroke();
  ctx.lineCap = "round";
}

/** The editor's drawing of a standard shape, at the origin (the hotspot). */
function vector(ctx: Ctx, shape: CursorShape): void {
  switch (shape) {
    case "text":
      strokes(ctx, TEXT_SEGMENTS);
      return;
    case "cross":
      strokes(ctx, CROSS_SEGMENTS);
      return;
    case "hand":
      filled(ctx, HAND);
      return;
    case "move":
      filled(ctx, MOVE);
      return;
    case "ew":
    case "ns":
    case "nwse":
    case "nesw":
      ctx.rotate(TURN[shape] ?? 0);
      filled(ctx, DOUBLE);
      return;
    case "wait":
      ring(ctx, 0, 0, 8, 3);
      return;
    case "busy":
      filled(ctx, ARROW);
      ring(ctx, 14, 19, 4.6, 2.2);
      return;
    case "no":
      for (const [w, color] of [
        [4.6, "#fff"],
        [2.4, "#111"],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.moveTo(-5.6, -5.6);
        ctx.lineTo(5.6, 5.6);
        ctx.stroke();
        ctx.shadowColor = "transparent";
      }
      return;
    default:
      filled(ctx, ARROW);
  }
}

/**
 * Whether a shape is drawn from the take's own image: "real" whenever there is one, "auto" for
 * the cursors of the programs (past the standard set, or one the helper could not name).
 */
export function drawsImage(state: CursorState, fx: CursorFx, images?: CursorImages): boolean {
  if (!images?.[state.index]) return false;
  const mode = fx.pointer ?? "auto";
  if (mode === "vector") return false;
  if (mode === "real") return true;
  return state.index >= STANDARD || state.shape === "other";
}

export function drawPointer(
  ctx: Ctx,
  state: CursorState,
  x: number,
  y: number,
  scale: number,
  fx: CursorFx,
  images?: CursorImages,
): void {
  if (fx.hidden || state.alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = state.alpha;
  if (fx.halo) {
    const [r, g, b] = hexToRgb(fx.haloColor ?? CURSOR_EFFECT_DEFAULTS.haloColor);
    const radius = 22 * scale;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.55)`);
    gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.28)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.shape !== "hidden") {
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 3 * scale;
    ctx.shadowOffsetY = 1 * scale;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const image = drawsImage(state, fx, images) ? images?.[state.index] : undefined;
    if (image) {
      // A 32-pixel cursor (Windows at 100%) is 32 units, whatever the screen's scaling was.
      const units = 32 / Math.max(32, image.w, image.h);
      ctx.scale(units, units);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image.bitmap, -image.hotX - image.pad, -image.hotY - image.pad);
    } else vector(ctx, state.shape === "other" ? "arrow" : state.shape);
  }
  ctx.restore();
}

export function drawRipples(
  ctx: Ctx,
  ripples: Ripple[],
  offsetX: number,
  offsetY: number,
  scale: number,
): void {
  for (const r of ripples) {
    const p = r.progress;
    const ease = 1 - (1 - p) ** 3;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = r.button === 1 ? "#9b7bff" : "#c8f031";
    ctx.lineWidth = (3.2 * (1 - p) + 1) * scale;
    ctx.beginPath();
    ctx.arc(r.x + offsetX, r.y + offsetY, (5 + 28 * ease) * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = r.button === 1 ? "rgba(155, 123, 255, 0.25)" : "rgba(200, 240, 49, 0.25)";
    ctx.globalAlpha = Math.max(0, 1 - p * 2);
    ctx.beginPath();
    ctx.arc(r.x + offsetX, r.y + offsetY, (5 + 14 * ease) * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** The magnifier's frame: a light ring with a thin dark edge, `radius` pixels around (x, y). */
export function drawMagnifierRing(
  ctx: Ctx,
  x: number,
  y: number,
  radius: number,
  pixel: number,
): void {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 6 * pixel;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3 * pixel;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(17, 17, 17, 0.55)";
  ctx.lineWidth = 1 * pixel;
  ctx.beginPath();
  ctx.arc(x, y, radius + 1.8 * pixel, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * The spotlight: a `width` × `height` area darkened by `dim` except a soft circle of `radius`
 * around (x, y). The export draws it once on a picture twice the recording's size and moves it
 * with the pointer, so both use this.
 */
export function drawSpotlight(
  ctx: Ctx,
  x: number,
  y: number,
  radius: number,
  dim: number,
  width: number,
  height: number,
): void {
  const outer = radius * 1.15;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, outer);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.74, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, `rgba(0, 0, 0, ${dim})`);
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/** What draws a magnified picture: the recording itself, `width` × `height` pixels of it. */
export interface MagnifierSource {
  image: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * Everything the recorded pointer shows at source second `t`, in recording pixels times `k`:
 * the spotlight, the magnifier (from `source`, when there is one), the click rings and the
 * pointer, with the effects in force at that moment.
 */
export function drawCursorScene(
  ctx: Ctx,
  o: {
    data: CursorData;
    track: CursorTrack;
    fx: CursorFx;
    t: number;
    /** Canvas pixels per recording pixel. */
    k: number;
    images?: CursorImages;
    source?: MagnifierSource;
    /** Where the canvas starts inside the recording, in canvas pixels (a cropped frame). */
    offset?: { x: number; y: number };
  },
): void {
  const { data, track, t, k } = o;
  const fx = fxAt(o.fx, t);
  if (fx.hidden) return;
  const ox = o.offset?.x ?? 0;
  const oy = o.offset?.y ?? 0;
  const state = cursorAt(track, t);
  const unit = cursorScale(data, fx) * 1.1 * k;
  const cx = state.x * k - ox;
  const cy = state.y * k - oy;
  // The spotlight and the magnifier follow the pointer even while it fades out when idle (the
  // export moves them by the same positions, whatever the pointer's opacity).
  if (fx.spotlight) {
    ctx.save();
    drawSpotlight(
      ctx,
      cx,
      cy,
      spotlightRadius(data, fx) * k,
      spotlightDim(fx),
      ctx.canvas.width,
      ctx.canvas.height,
    );
    ctx.restore();
  }
  if (fx.magnifier) {
    const radius = Math.round(magnifierRadius(data, fx));
    if (o.source) {
      const from = magnifierSource(data, fx, state.x, state.y);
      const sx = o.source.width / data.width;
      const sy = o.source.height / data.height;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * k, 0, Math.PI * 2);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        o.source.image,
        from.x * sx,
        from.y * sy,
        from.side * sx,
        from.side * sy,
        cx - radius * k,
        cy - radius * k,
        radius * 2 * k,
        radius * 2 * k,
      );
      ctx.restore();
    }
    drawMagnifierRing(ctx, cx, cy, radius * k, (data.height / 1080) * k);
  }
  if (fx.clicks) {
    ctx.save();
    ctx.translate(-ox, -oy);
    ctx.scale(k, k);
    drawRipples(ctx, ripplesAt(data, t, o.fx), 0, 0, unit / k);
    ctx.restore();
  }
  drawPointer(ctx, state, cx, cy, unit, fx, o.images);
}
