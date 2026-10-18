import type { CursorData } from "./cursorData.ts";

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
 * controls (the stretches where the pointer was hidden) never get a zoom.
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
  const excluded = (t: number): boolean => within(data.hidden, t) || within(opts.exclude ?? [], t);
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
  for (const p of kept) {
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
  opts: { scale?: number; lead?: number; length?: number } = {},
): Zoom[] {
  const scale = opts.scale ?? 1.5;
  const lead = opts.lead ?? 0.3;
  const length = opts.length ?? 3;
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
    const end = edge === "end" ? Math.min(duration, Math.max(t, z.start + MIN_ZOOM_LENGTH)) : z.end;
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
