import type { CursorData } from "./cursorData.ts";
import { sumExpr } from "./exprSum.ts";

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

/**
 * The points of `list` (sorted by `t`) that shape a curve between `from` and `to`: those inside
 * and the nearest one on each side, so a stretch of a long curve gets a short expression with the
 * same values over it (as gain.ts gainSlice does for the volume).
 */
export function sliceByTime<T extends { t: number }>(
  list: readonly T[],
  range?: readonly [number, number],
): T[] {
  if (!range) return [...list];
  const [from, to] = range;
  const first = list.findIndex((p) => p.t >= from);
  const lo = first < 0 ? list.length - 1 : Math.max(0, first - 1);
  let hi = list.findIndex((p) => p.t > to);
  hi = hi < 0 ? list.length - 1 : hi;
  return list.slice(Math.max(0, lo), hi + 1);
}

/**
 * A smooth curve through points (smoothstep between each pair, flat before the first and after
 * the last) as a sum: the first value plus each step's change times its smoothstep, which is 0
 * before the step and 1 after it. FFmpeg refuses deeply nested expressions; this one is summed
 * as a balanced tree (sumExpr), so its depth grows with the logarithm of the points. The changes
 * are taken between the rounded values, so the sum lands exactly on each of them.
 */
export function smoothSteps(
  points: readonly { t: number; v: number }[],
  t: string,
  round: (v: number) => string,
): string {
  if (!points.length) return "0";
  const vals = points.map((p) => Number(round(p.v)));
  const terms = [round(vals[0])];
  for (let i = 1; i < points.length; i++) {
    const rise = Number(round(vals[i] - vals[i - 1]));
    if (rise === 0) continue;
    const a = points[i - 1].t;
    const span = Math.max(1e-3, points[i].t - a);
    const from = round(a);
    const shifted = from.startsWith("-") ? `${t}+${from.slice(1)}` : `${t}-${from}`;
    terms.push(
      `${rise < 0 ? "-" : ""}${round(Math.abs(rise))}*${sm(`(${shifted})/${round(span)}`)}`,
    );
  }
  return sumExpr(terms);
}

function focusExpr(z: Zoom, t: string, axis: "x" | "y", range?: readonly [number, number]): string {
  if (!z.focus.length) return "0.5";
  const points = sliceByTime(z.focus, range).map((f) => ({ t: f.t, v: f[axis] }));
  return `(${smoothSteps(points, t, num)})`;
}

/**
 * ffmpeg expressions for the view at source time `t` (an expression), matching zoomAt(). With
 * `range` (source seconds), only the focus points that shape the view over it are written.
 */
export function zoomExprs(
  zooms: Zoom[],
  t: string,
  range?: readonly [number, number],
): { scale: string; cx: string; cy: string } {
  const terms = zooms.map((z) => ({ w: envelopeExpr(z, t), z }));
  const scale = `(${sumExpr(["1", ...terms.map(({ w, z }) => `${num(z.scale - 1)}*${w}`)])})`;
  const center = (axis: "x" | "y"): string => {
    const raw = `(${sumExpr(["0.5", ...terms.map(({ w, z }) => `(${focusExpr(z, t, axis, range)}-0.5)*${w}`)])})`;
    return `clip(${raw},0.5/${scale},1-0.5/${scale})`;
  };
  return { scale, cx: center("x"), cy: center("y") };
}

// ---- Automatic zoom from the recorded clicks and typing. ----

export interface AutoZoomOptions {
  scale: number;
  /** Clicks closer than this (seconds) share one zoom, panning between them. */
  gap: number;
  /** Seconds before the first click and after the last one. */
  lead: number;
  hold: number;
  /** Follow the text cursor while something is typed (default on). */
  typing?: boolean;
  /** Source stretches where no zoom starts from a click or typing (a board over the screen). */
  exclude?: readonly [number, number][];
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

const within = (ranges: readonly [number, number][], t: number): boolean =>
  ranges.some(([a, b]) => t >= a && t <= b);

/**
 * Where the text cursor was right after something typed at `t` (it moves a moment after the key):
 * the last place reported up to 0.3 s later, when there was one on screen.
 */
function caretAt(data: CursorData, t: number): [number, number] | null {
  let best: [number, number] | null = null;
  for (const c of data.caret ?? []) {
    if (c[0] > t + 0.3) break;
    best = c[4] > 0 ? [c[1] + c[3] / 2, c[2] + c[4] / 2] : null;
  }
  return best;
}

/**
 * One zoom per burst of clicks and typing: it starts a little before the first one, pans to
 * each click (and follows a drag to where it was released) and to the text cursor while
 * something is typed, and ends a little after the last one. Clicks over the recorder's own
 * controls (the stretches where the pointer was hidden) never get a zoom. Drawing on the screen
 * (CursorData.drawing, which holds the boards too) is a border: nothing in it makes a zoom, and
 * no zoom goes across it (the click before it and the one after it are two zooms, each kept off
 * the drawing). Each zoom gets an id of its own from `newId`.
 */
export function autoZooms(
  data: CursorData,
  duration: number,
  opts: AutoZoomOptions = DEFAULT_AUTO_ZOOM,
  newId: (n: number, start: number) => string = (n, start) => `z${n}-${Math.round(start * 1000)}`,
): Zoom[] {
  const W = data.width;
  const H = data.height;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x <= W && y <= H;
  const points: ZoomFocus[] = [];
  const borders = [...(data.drawing ?? []), ...(opts.exclude ?? [])];
  const excluded = (t: number): boolean => within(data.hidden, t) || within(borders, t);
  /** A border lies between seconds a and b. */
  const across = (a: number, b: number): boolean => borders.some(([x, y]) => x < b && y > a);
  for (const c of data.clicks) {
    if (c[3] !== 0 || !inside(c[1], c[2]) || excluded(c[0])) continue;
    points.push({ t: c[0], x: c[1] / W, y: c[2] / H });
    // A drag (button held while moving) ends where it was released.
    if (c[4] > 0.25) {
      const end = positionAt(data, c[0] + c[4]);
      if (end && inside(end[0], end[1]) && Math.hypot(end[0] - c[1], end[1] - c[2]) > W * 0.03)
        points.push({ t: c[0] + c[4], x: end[0] / W, y: end[1] / H });
    }
  }
  if (opts.typing !== false && data.caret?.length) {
    // The text cursor moves a letter at a time: a point only where the view would really move.
    let last: ZoomFocus | undefined;
    for (const t of data.typing) {
      if (excluded(t)) continue;
      const at = caretAt(data, t);
      if (!at || !inside(at[0], at[1])) continue;
      const p = { t, x: at[0] / W, y: at[1] / H };
      if (
        last &&
        p.t - last.t < 2 &&
        Math.abs(p.x - last.x) < 0.04 &&
        Math.abs(p.y - last.y) < 0.04
      )
        continue;
      points.push(p);
      last = p;
    }
  }
  const kept = points.sort((a, b) => a.t - b.t);
  const zooms: Zoom[] = [];
  let group: ZoomFocus[] = [];
  const flush = (): void => {
    if (!group.length) return;
    const first = group[0].t;
    const last = group[group.length - 1].t;
    // The lead and the hold stop at a border.
    const before = Math.max(0, ...borders.filter(([, y]) => y <= first).map(([, y]) => y));
    const after = Math.min(duration, ...borders.filter(([x]) => x >= last).map(([x]) => x));
    const start = Math.max(0, first - opts.lead, before);
    const end = Math.min(duration, last + opts.hold, after);
    if (end - start >= 1.2)
      zooms.push({ id: "", start, end, scale: opts.scale, focus: group, auto: true });
    group = [];
  };
  for (const p of kept) {
    const prev = group[group.length - 1];
    if (prev && (p.t - prev.t > opts.gap || across(prev.t, p.t))) flush();
    group.push(p);
  }
  flush();
  // Zooms that would touch are joined, so the view pans instead of going out and back in.
  const merged: Zoom[] = [];
  for (const z of zooms) {
    const prev = merged[merged.length - 1];
    if (prev && z.start - prev.end < ZOOM_EASE * 2 && !across(prev.end, z.start)) {
      prev.end = z.end;
      prev.focus = [...prev.focus, ...z.focus];
    } else merged.push(z);
  }
  return merged.map((z, i) => ({ ...z, id: newId(i + 1, z.start) }));
}

/**
 * "Zoom automático" run again over zooms already there: the automatic ones of before give way to
 * `fresh`; a zoom edited by hand stays, and no new automatic zoom goes over it.
 */
export function replaceAutoZooms(old: readonly Zoom[], fresh: readonly Zoom[]): Zoom[] {
  const kept = old.filter((z) => !z.auto);
  return [...kept, ...fresh.filter((z) => !kept.some((k) => k.end > z.start && k.start < z.end))];
}

// ---- Zoom where the screen changes a lot (a scene change found in the proxy). ----

/** How much of the picture has to change for FFmpeg's scene score to count it (0 to 1). */
export const SCENE_THRESHOLD = 0.25;

/**
 * FFmpeg arguments that print a line for every frame of `path` whose scene score passes the
 * threshold, on a small copy so it reads quickly (the proxy of the recording, when there is one).
 */
export const sceneArgs = (path: string): string[] => [
  ...["-hide_banner", "-nostdin", "-v", "info", "-i", path, "-map", "0:v:0", "-an", "-sn"],
  "-vf",
  `fps=10,scale=320:-2,select='gt(scene\\,${SCENE_THRESHOLD})',showinfo`,
  ...["-f", "null", "-"],
];

/** The moments (seconds) of the frames showinfo printed. */
export function parseSceneChanges(stderr: string): number[] {
  const out: number[] = [];
  for (const m of stderr.matchAll(/Parsed_showinfo[^\n]*?pts_time:\s*(-?[\d.]+)/g)) {
    const t = Number(m[1]);
    if (Number.isFinite(t) && t >= 0) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Proposed zooms after the screen changed a lot: a few seconds on the new screen, looking
 * where the pointer goes right after (or at the middle), skipping changes that come in a burst
 * (a video playing, scrolling) and any moment that already has a zoom.
 */
export function sceneZooms(
  changes: readonly number[],
  data: CursorData | null,
  duration: number,
  existing: readonly Zoom[] = [],
  opts: {
    scale?: number;
    lead?: number;
    length?: number;
    /** Source stretches with no zoom (a board over the screen); drawing on it is one already. */
    exclude?: readonly [number, number][];
  } = {},
): Zoom[] {
  const scale = opts.scale ?? 1.5;
  const lead = opts.lead ?? 0.3;
  const length = opts.length ?? 3;
  const borders = [...(data?.drawing ?? []), ...(opts.exclude ?? [])];
  const out: Zoom[] = [];
  for (let i = 0; i < changes.length; i++) {
    const t = changes[i];
    // Part of a burst: the screen keeps changing, a zoom would only chase it.
    if ((i > 0 && t - changes[i - 1] < 2.5) || (i + 1 < changes.length && changes[i + 1] - t < 2.5))
      continue;
    const start = t + lead;
    const end = Math.min(duration, start + length);
    if (end - start < 1.2) continue;
    if ([...existing, ...out].some((z) => z.end > start - 0.5 && z.start < end + 0.5)) continue;
    // A change on the board, or with the pen out: the screen is not what changes there.
    if (borders.some(([a, b]) => a < end && b > t)) continue;
    const at = data ? positionAt(data, t + 1) : null;
    const focus =
      at && data
        ? {
            t: start,
            x: Math.min(1, Math.max(0, at[0] / data.width)),
            y: Math.min(1, Math.max(0, at[1] / data.height)),
          }
        : { t: start, x: 0.5, y: 0.5 };
    out.push({ id: `s${Math.round(start * 1000)}`, start, end, scale, focus: [focus] });
  }
  return out;
}

// ---- Editing one zoom of a recording (the timeline and the side panel). ----

/** The shortest zoom an edit leaves. */
export const MIN_ZOOM_LENGTH = 0.4;

function editOne(
  zooms: readonly Zoom[] | undefined,
  id: string,
  fn: (z: Zoom) => Zoom | null,
): Zoom[] | undefined {
  const next = (zooms ?? []).flatMap((z) => {
    if (z.id !== id) return [z];
    const changed = fn(z);
    return changed ? [changed] : [];
  });
  next.sort((a, b) => a.start - b.start);
  return next.length ? next : undefined;
}

/**
 * Moves the start or the end of a zoom to source second `t`, at least MIN_ZOOM_LENGTH from the
 * other edge and inside the media; its focus points stay inside it. An edited automatic zoom is
 * kept when the automatic zoom runs again.
 */
export function moveZoomEdge(
  zooms: readonly Zoom[] | undefined,
  id: string,
  edge: "start" | "end",
  t: number,
  duration: number,
): Zoom[] | undefined {
  return editOne(zooms, id, (z) => {
    const start = edge === "start" ? Math.max(0, Math.min(t, z.end - MIN_ZOOM_LENGTH)) : z.start;
    // The end stays after the start, also for a zoom that went past the end of the media.
    const end = Math.max(
      start + MIN_ZOOM_LENGTH,
      edge === "end" ? Math.min(duration, Math.max(t, z.start + MIN_ZOOM_LENGTH)) : z.end,
    );
    const focus = z.focus.map((f) => ({ ...f, t: Math.min(end, Math.max(start, f.t)) }));
    const { auto: _auto, ...rest } = z;
    return { ...rest, start, end, focus };
  });
}

/** Changes how close a zoom gets (1.05× to 5×) and how long it takes to go in and out. */
export function updateZoom(
  zooms: readonly Zoom[] | undefined,
  id: string,
  patch: { scale?: number; ease?: number },
): Zoom[] | undefined {
  return editOne(zooms, id, (z) => {
    const { auto: _auto, ...rest } = z;
    return {
      ...rest,
      ...(patch.scale !== undefined ? { scale: Math.min(5, Math.max(1.05, patch.scale)) } : {}),
      ...(patch.ease !== undefined ? { ease: Math.min(5, Math.max(0.1, patch.ease)) } : {}),
    };
  });
}

/** The focus point of a zoom in force at source second `t` (the one edited by the rectangle). */
export function focusIndexAt(z: Pick<Zoom, "focus">, t: number): number {
  let index = 0;
  z.focus.forEach((f, i) => {
    if (f.t <= t + 1e-6) index = i;
  });
  return index;
}

/** Moves the focus point in force at `t` to (x, y), fractions of the frame. */
export function setZoomFocus(
  zooms: readonly Zoom[] | undefined,
  id: string,
  t: number,
  x: number,
  y: number,
): Zoom[] | undefined {
  return editOne(zooms, id, (z) => {
    const point = {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
    const { auto: _auto, ...rest } = z;
    if (!z.focus.length) return { ...rest, focus: [{ t: z.start, ...point }] };
    const index = focusIndexAt(z, t);
    return { ...rest, focus: z.focus.map((f, i) => (i === index ? { ...f, ...point } : f)) };
  });
}

/** Takes one zoom out. */
export const removeZoom = (zooms: readonly Zoom[] | undefined, id: string): Zoom[] | undefined =>
  editOne(zooms, id, () => null);
