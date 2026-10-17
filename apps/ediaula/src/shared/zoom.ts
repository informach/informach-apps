import type { CursorData } from "./recording.ts";

/**
 * Zooms on a clip ("zoom automático" from clicks, or added by hand). Times are seconds of the
 * SOURCE file, like protected ranges, so a zoom stays on the same moment through cuts and trims.
 * The preview evaluates zoomAt(); the export evaluates the same curve as an ffmpeg expression.
 */

export interface ZoomFocus {
  /** Source seconds. */
  t: number;
  /** Point to keep in view, as fractions of the source frame. */
  x: number;
  y: number;
}

export interface Zoom {
  id: string;
  start: number;
  end: number;
  /** 1.8 = 180%. */
  scale: number;
  /** Where to look; the view pans smoothly between these. */
  focus: ZoomFocus[];
  /** Made by the automatic zoom (replaced when it runs again). */
  auto?: boolean;
  /** Seconds the zoom takes to go in and out (default ZOOM_EASE). */
  ease?: number;
}

/** Seconds to zoom in and out. */
export const ZOOM_EASE = 0.7;

/**
 * Zooms belong to the media (Asset.zooms), in its own seconds, like the cursor: every clip of
 * a recording shows the ones over its stretch of the source, so cutting, trimming and
 * trimming back never loses or duplicates one. These are the ones acting on [from, to).
 */
export const zoomsIn = (zooms: Zoom[] | undefined, from: number, to: number): Zoom[] =>
  (zooms ?? []).filter((z) => z.end > from && z.start < to);

/**
 * The media's zooms after editing the ones a clip shows (over [from, to)) with `fn`; the zooms
 * elsewhere in the recording stay as they are. undefined when none is left.
 */
export function editZoomsIn(
  zooms: Zoom[] | undefined,
  from: number,
  to: number,
  fn: (inside: Zoom[]) => Zoom[],
): Zoom[] | undefined {
  const inside = zoomsIn(zooms, from, to);
  const ids = new Set(inside.map((z) => z.id));
  const next = [...(zooms ?? []).filter((z) => !ids.has(z.id)), ...fn(inside)].sort(
    (a, b) => a.start - b.start,
  );
  return next.length ? next : undefined;
}

export interface View {
  scale: number;
  /** Center of the view, fractions of the source frame. */
  cx: number;
  cy: number;
}

const smooth = (p: number): number => {
  const c = Math.max(0, Math.min(1, p));
  return c * c * (3 - 2 * c);
};

function envelope(z: Zoom, t: number): number {
  if (t <= z.start || t >= z.end) return 0;
  const e = Math.min(z.ease ?? ZOOM_EASE, (z.end - z.start) / 2);
  return Math.min(smooth((t - z.start) / e), smooth((z.end - t) / e));
}

function focusAt(z: Zoom, t: number): [number, number] {
  const f = z.focus;
  if (!f.length) return [0.5, 0.5];
  if (t <= f[0].t) return [f[0].x, f[0].y];
  for (let i = 1; i < f.length; i++) {
    if (t < f[i].t) {
      const k = smooth((t - f[i - 1].t) / Math.max(1e-3, f[i].t - f[i - 1].t));
      return [f[i - 1].x + (f[i].x - f[i - 1].x) * k, f[i - 1].y + (f[i].y - f[i - 1].y) * k];
    }
  }
  return [f[f.length - 1].x, f[f.length - 1].y];
}

const clampCenter = (c: number, scale: number): number =>
  Math.max(0.5 / scale, Math.min(1 - 0.5 / scale, c));

export function zoomAt(zooms: Zoom[] | undefined, t: number): View {
  let scale = 1;
  let cx = 0.5;
  let cy = 0.5;
  for (const z of zooms ?? []) {
    const w = envelope(z, t);
    if (w <= 0) continue;
    const [fx, fy] = focusAt(z, t);
    scale += (z.scale - 1) * w;
    cx += (fx - 0.5) * w;
    cy += (fy - 0.5) * w;
  }
  return { scale, cx: clampCenter(cx, scale), cy: clampCenter(cy, scale) };
}

// ---- The same curve as an ffmpeg expression of the source time `t` (a sub-expression). ----

const num = (v: number): string => (Math.round(v * 10000) / 10000).toString();
const sm = (p: string): string => `(clip(${p},0,1)*clip(${p},0,1)*(3-2*clip(${p},0,1)))`;

function envelopeExpr(z: Zoom, t: string): string {
  const e = Math.min(z.ease ?? ZOOM_EASE, (z.end - z.start) / 2);
  return `if(between(${t},${num(z.start)},${num(z.end)}),min(${sm(`(${t}-${num(z.start)})/${num(e)}`)},${sm(`(${num(z.end)}-${t})/${num(e)}`)}),0)`;
}

function focusExpr(z: Zoom, t: string, axis: "x" | "y"): string {
  const f = z.focus;
  if (!f.length) return "0.5";
  let expr = num(f[f.length - 1][axis]);
  for (let i = f.length - 1; i >= 1; i--) {
    const a = f[i - 1];
    const b = f[i];
    const k = sm(`(${t}-${num(a.t)})/${num(Math.max(1e-3, b.t - a.t))}`);
    expr = `if(lt(${t},${num(b.t)}),${num(a[axis])}+(${num(b[axis] - a[axis])})*${k},${expr})`;
  }
  return `if(lte(${t},${num(f[0].t)}),${num(f[0][axis])},${expr})`;
}

/** ffmpeg expressions for the view at source time `t` (an expression), matching zoomAt(). */
export function zoomExprs(zooms: Zoom[], t: string): { scale: string; cx: string; cy: string } {
  const terms = zooms.map((z) => ({ w: envelopeExpr(z, t), z }));
  const scale = `(1${terms.map(({ w, z }) => `+${num(z.scale - 1)}*${w}`).join("")})`;
  const center = (axis: "x" | "y"): string => {
    const raw = `(0.5${terms.map(({ w, z }) => `+(${focusExpr(z, t, axis)}-0.5)*${w}`).join("")})`;
    return `clip(${raw},0.5/${scale},1-0.5/${scale})`;
  };
  return { scale, cx: center("x"), cy: center("y") };
}

// ---- Automatic zoom from the recorded clicks. ----

export interface AutoZoomOptions {
  scale: number;
  /** Clicks closer than this (seconds) share one zoom, panning between them. */
  gap: number;
  /** Seconds before the first click and after the last one. */
  lead: number;
  hold: number;
}

export const DEFAULT_AUTO_ZOOM: AutoZoomOptions = { scale: 1.8, gap: 3.5, lead: 0.9, hold: 1.8 };

function positionAt(data: CursorData, t: number): [number, number] | null {
  let best: [number, number] | null = null;
  for (const m of data.moves) {
    if (m[0] > t) break;
    best = [m[1], m[2]];
  }
  return best;
}

/**
 * One zoom per burst of clicks: it starts a little before the first click, pans to each click
 * (and follows a drag to where it was released) and ends a little after the last one.
 */
export function autoZooms(
  data: CursorData,
  duration: number,
  opts: AutoZoomOptions = DEFAULT_AUTO_ZOOM,
): Zoom[] {
  const W = data.width;
  const H = data.height;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x <= W && y <= H;
  const points: ZoomFocus[] = [];
  for (const c of data.clicks) {
    if (c[3] !== 0 || !inside(c[1], c[2])) continue;
    points.push({ t: c[0], x: c[1] / W, y: c[2] / H });
    // A drag (button held while moving) ends where it was released.
    if (c[4] > 0.25) {
      const end = positionAt(data, c[0] + c[4]);
      if (end && inside(end[0], end[1]) && Math.hypot(end[0] - c[1], end[1] - c[2]) > W * 0.03)
        points.push({ t: c[0] + c[4], x: end[0] / W, y: end[1] / H });
    }
  }
  const zooms: Zoom[] = [];
  let group: ZoomFocus[] = [];
  const flush = (): void => {
    if (!group.length) return;
    const start = Math.max(0, group[0].t - opts.lead);
    const end = Math.min(duration, group[group.length - 1].t + opts.hold);
    if (end - start >= 1.2)
      zooms.push({
        id: `z${zooms.length + 1}-${Math.round(start * 1000)}`,
        start,
        end,
        scale: opts.scale,
        focus: group,
        auto: true,
      });
    group = [];
  };
  for (const p of points) {
    if (group.length && p.t - group[group.length - 1].t > opts.gap) flush();
    group.push(p);
  }
  flush();
  // Zooms that would touch are joined, so the view pans instead of going out and back in.
  const merged: Zoom[] = [];
  for (const z of zooms) {
    const prev = merged[merged.length - 1];
    if (prev && z.start - prev.end < ZOOM_EASE * 2) {
      prev.end = z.end;
      prev.focus = [...prev.focus, ...z.focus];
    } else merged.push(z);
  }
  return merged;
}
