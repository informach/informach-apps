import { type CursorData, shapeName } from "./cursorData.ts";
import { CURSOR_SHAPES, type CursorShape } from "./recording.ts";

/**
 * The pointer of an EdiAula screen recording is drawn by the editor (the video has none), so it
 * can be bigger, move smoothly, show clicks and fade out when idle. This module computes where
 * it is and how it looks at any moment; the preview draws it live and the export pre-renders it
 * with the same numbers.
 */

export interface CursorFx {
  /** Manual positions in source seconds and recording pixels; original movement outside this span. */
  path?: CursorPoint[];
  /** Later edits override only their selected source interval. Empty points restore recorded motion. */
  pathEdits?: { start: number; end: number; points: CursorPoint[] }[];
  /** Pointer size relative to the standard Windows pointer on a 1080p screen. */
  size: number;
  /** 0 = raw movement, 1 = very smooth. */
  smooth: number;
  /** Expanding ring where the mouse was clicked. */
  clicks: boolean;
  /** Soft halo around the pointer, easy to follow for children. */
  halo: boolean;
  /** Fades the pointer out after a few seconds without movement. */
  hideIdle: boolean;
  /** Draw nothing (the recording stays without a pointer). */
  hidden?: boolean;
  /** Show the shortcut keys pressed while recording (when they were recorded). Default on. */
  keys?: boolean;
  /**
   * How the pointer is drawn: "vector" always draws the editor's shapes, "real" the images the
   * helper saved of the system's own cursors (vector where there is none), and "auto" (default)
   * the vectors for the standard shapes and the real image for an application's own cursor.
   */
  pointer?: CursorPointer;
  /** Halo color ('#RRGGBB', from the lesson's palette); default yellow. */
  haloColor?: string;
  /** Magnifier: a circle around the pointer showing the screen enlarged. */
  magnifier?: boolean;
  /** Radius of the magnifier, as a fraction of the recording's height. */
  magnifierRadius?: number;
  /** How much the magnifier enlarges (2 = twice). */
  magnifierZoom?: number;
  /** Spotlight: everything but a circle around the pointer gets darker. */
  spotlight?: boolean;
  /** Radius of the lit circle, as a fraction of the recording's height. */
  spotlightRadius?: number;
  /** How dark the rest of the screen gets (0 to 1). */
  spotlightDim?: number;
  /** A short click sound at each mouse press, in the preview and in the export. */
  clickSound?: boolean;
  /** Volume of the click sound (0 to 1). */
  clickVolume?: number;
  /** Effects turned on or off for a stretch of the recording (source seconds); the last wins. */
  ranges?: CursorRange[];
}

export const CURSOR_POINTERS = ["auto", "vector", "real"] as const;
export type CursorPointer = (typeof CURSOR_POINTERS)[number];

/** What a stretch of the recording may turn on or off; sizes and colors stay the recording's. */
export const CURSOR_RANGE_KEYS = [
  "halo",
  "clicks",
  "magnifier",
  "spotlight",
  "clickSound",
  "hidden",
] as const;
export type CursorRangeKey = (typeof CURSOR_RANGE_KEYS)[number];
export type CursorRangeFx = Partial<Record<CursorRangeKey, boolean>>;

export interface CursorRange {
  id: string;
  /** Source seconds. */
  start: number;
  end: number;
  fx: CursorRangeFx;
}

export interface CursorPoint {
  t: number;
  x: number;
  y: number;
  /** Bezier handles relative to the anchor; moving the anchor carries its handles. */
  inHandle?: { x: number; y: number };
  outHandle?: { x: number; y: number };
}

export function editedCursorAt(fx: CursorFx, t: number): { x: number; y: number } | null {
  for (let i = (fx.pathEdits?.length ?? 0) - 1; i >= 0; i--) {
    const edit = fx.pathEdits![i];
    if (t >= edit.start && t <= edit.end) {
      if (!edit.points.length) return null;
      // Removing endpoint anchors must not resurrect recorded movement inside an edited interval.
      const first = edit.points[0],
        last = edit.points[edit.points.length - 1];
      const point = cursorPathAt(edit.points, Math.max(first.t, Math.min(last.t, t)));
      return point && { x: point.x, y: point.y };
    }
  }
  return cursorPathAt(fx.path, t);
}

export function cursorControls(
  a: CursorPoint,
  b: CursorPoint,
): [{ x: number; y: number }, { x: number; y: number }] {
  return [
    a.outHandle
      ? { x: a.x + a.outHandle.x, y: a.y + a.outHandle.y }
      : { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
    b.inHandle
      ? { x: b.x + b.inHandle.x, y: b.y + b.inHandle.y }
      : { x: b.x - (b.x - a.x) / 3, y: b.y - (b.y - a.y) / 3 },
  ];
}

/** Same cubic segments used by playback, drawn as an editable vector in the UI. */
export function cursorPathGeometry(path: CursorPoint[]): string {
  if (!path.length) return "";
  let d = `M ${path[0].x} ${path[0].y}`;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = cursorControls(path[i - 1], path[i]);
    d += ` C ${a.x} ${a.y} ${b.x} ${b.y} ${path[i].x} ${path[i].y}`;
  }
  return d;
}

/** Split a cubic at the requested source time, preserving its geometric shape. */
export function insertCursorPoint(path: CursorPoint[], t: number): CursorPoint[] {
  if (path.some((p) => Math.abs(p.t - t) < 0.001)) return path;
  const index = path.findIndex((p, i) => i > 0 && path[i - 1].t < t && t < p.t);
  if (index < 1) return path;
  const a = path[index - 1],
    b = path[index];
  const u = (t - a.t) / (b.t - a.t),
    k = u * u * (3 - 2 * u);
  const mix = (p: { x: number; y: number }, q: { x: number; y: number }) => ({
    x: p.x + (q.x - p.x) * k,
    y: p.y + (q.y - p.y) * k,
  });
  const delta = (p: { x: number; y: number }, q: { x: number; y: number }) => ({
    x: p.x - q.x,
    y: p.y - q.y,
  });
  const [c, d] = cursorControls(a, b);
  const ac = mix(a, c),
    cd = mix(c, d),
    db = mix(d, b);
  const left = mix(ac, cd),
    right = mix(cd, db),
    p = mix(left, right);
  return [
    ...path.slice(0, index - 1),
    { ...a, outHandle: delta(ac, a) },
    { t, ...p, inHandle: delta(left, p), outHandle: delta(right, p) },
    { ...b, inHandle: delta(db, b) },
    ...path.slice(index + 1),
  ];
}

export function nearestCursorTime(path: CursorPoint[], x: number, y: number): number | null {
  if (path.length < 2) return null;
  let best = path[0].t,
    distance = Infinity;
  for (let i = 1; i < path.length; i++) {
    const segment = [path[i - 1], path[i]];
    for (let j = 0; j <= 64; j++) {
      const t = segment[0].t + ((segment[1].t - segment[0].t) * j) / 64;
      const p = cursorPathAt(segment, t)!;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < distance) {
        distance = d;
        best = t;
      }
    }
  }
  return best;
}

export function cursorPathAt(
  path: CursorPoint[] | undefined,
  t: number,
): { x: number; y: number } | null {
  if (!path?.length || t < path[0].t || t > path[path.length - 1].t) return null;
  for (let i = 1; i < path.length; i++) {
    if (t <= path[i].t) {
      const a = path[i - 1],
        b = path[i];
      const u = Math.max(0, Math.min(1, (t - a.t) / Math.max(1e-6, b.t - a.t)));
      const k = u * u * (3 - 2 * u);
      const [c, d] = cursorControls(a, b);
      const v = 1 - k;
      return {
        x: v ** 3 * a.x + 3 * v * v * k * c.x + 3 * v * k * k * d.x + k ** 3 * b.x,
        y: v ** 3 * a.y + 3 * v * v * k * c.y + 3 * v * k * k * d.y + k ** 3 * b.y,
      };
    }
  }
  return path[path.length - 1];
}

export function normalizeCursorPath(
  path: CursorPoint[],
  width: number,
  height: number,
  duration: number,
): CursorPoint[] {
  const points = new Map<number, CursorPoint>();
  for (const p of path) {
    if (![p.t, p.x, p.y].every(Number.isFinite)) continue;
    const t = Math.max(0, Math.min(duration, p.t));
    const point: CursorPoint = {
      t,
      x: Math.max(0, Math.min(width, p.x)),
      y: Math.max(0, Math.min(height, p.y)),
    };
    for (const key of ["inHandle", "outHandle"] as const) {
      const h = p[key];
      if (h && Number.isFinite(h.x) && Number.isFinite(h.y))
        point[key] = {
          x: Math.max(0, Math.min(width, point.x + h.x)) - point.x,
          y: Math.max(0, Math.min(height, point.y + h.y)) - point.y,
        };
    }
    points.set(t, point);
  }
  return [...points.values()].sort((a, b) => a.t - b.t);
}

export const DEFAULT_CURSOR_FX: CursorFx = {
  size: 1.6,
  smooth: 0.5,
  clicks: true,
  halo: false,
  hideIdle: false,
};

/** Defaults of the effects that are off until asked for. */
export const CURSOR_EFFECT_DEFAULTS = {
  haloColor: "#ffe240",
  magnifierRadius: 0.13,
  magnifierZoom: 2,
  spotlightRadius: 0.2,
  spotlightDim: 0.55,
  clickVolume: 0.6,
} as const;

/** Bump when the drawing changes so cached pointer videos are rebuilt. */
export const CURSOR_VERSION = 3;

/** Samples per second of the smoothed track. */
const RATE = 120;
export const RIPPLE_SECONDS = 0.45;
const IDLE_AFTER = 2.5;
const IDLE_FADE = 0.4;

export interface CursorTrack {
  rate: number;
  x: Float32Array;
  y: Float32Array;
  /** Index into the recording's shapes (cursorData.ts), so an image of the take is kept. */
  shape: Uint8Array;
  /** The standard shape each index is (or resembles). */
  names: CursorShape[];
  /** 0..1 visibility (idle fade). */
  alpha: Float32Array;
}

export interface CursorState {
  x: number;
  y: number;
  shape: CursorShape;
  /** Index into the recording's shapes: past the standard ones, an image of the take. */
  index: number;
  alpha: number;
}

/** The effects in force at source second `t`: the recording's, changed by the stretches over it. */
export function fxAt(fx: CursorFx, t: number): CursorFx {
  const ranges = fx.ranges;
  if (!ranges?.length) return fx;
  let out = fx;
  for (const r of ranges) if (t >= r.start && t < r.end) out = { ...out, ...r.fx };
  return out;
}

/**
 * Source stretches where `on` holds for the effects in force, in order and without overlaps:
 * the recording's own settings outside the stretches, each stretch's inside it (the last wins).
 */
export function fxWhere(
  fx: CursorFx,
  on: (effects: CursorFx) => boolean,
  duration: number,
): [number, number][] {
  const cuts = new Set<number>([0, duration]);
  for (const r of fx.ranges ?? []) {
    if (r.start > 0 && r.start < duration) cuts.add(r.start);
    if (r.end > 0 && r.end < duration) cuts.add(r.end);
  }
  const edges = [...cuts].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 1; i < edges.length; i++) {
    const a = edges[i - 1];
    const b = edges[i];
    if (b - a < 1e-6 || !on(fxAt(fx, (a + b) / 2))) continue;
    const last = out.at(-1);
    if (last && Math.abs(last[1] - a) < 1e-6) last[1] = b;
    else out.push([a, b]);
  }
  return out;
}

/** Source stretches where one effect is on. */
export const fxIntervals = (
  fx: CursorFx,
  key: CursorRangeKey,
  duration: number,
): [number, number][] => fxWhere(fx, (f) => !!f[key], duration);

/** Press times (source seconds) that sound a click. */
export function clickSoundTimes(data: Pick<CursorData, "clicks">, fx: CursorFx): number[] {
  // A click of a moment the pointer is hidden makes no sound, as it makes no ripple.
  return data.clicks
    .filter((c) => {
      const f = fxAt(fx, c[0]);
      return f.clickSound && !f.hidden;
    })
    .map((c) => c[0]);
}

/** Radius of the magnifier in recording pixels, and how much it enlarges. */
export const magnifierRadius = (data: Pick<CursorData, "height">, fx: CursorFx): number =>
  Math.max(8, data.height * (fx.magnifierRadius ?? CURSOR_EFFECT_DEFAULTS.magnifierRadius));
export const magnifierZoom = (fx: CursorFx): number =>
  Math.max(1.1, Math.min(6, fx.magnifierZoom ?? CURSOR_EFFECT_DEFAULTS.magnifierZoom));
/** Radius of the spotlight in recording pixels, and how dark the rest gets. */
export const spotlightRadius = (data: Pick<CursorData, "height">, fx: CursorFx): number =>
  Math.max(8, data.height * (fx.spotlightRadius ?? CURSOR_EFFECT_DEFAULTS.spotlightRadius));
export const spotlightDim = (fx: CursorFx): number =>
  Math.max(0, Math.min(0.95, fx.spotlightDim ?? CURSOR_EFFECT_DEFAULTS.spotlightDim));

/** Side of the square the magnifier enlarges, in recording pixels (even, inside the frame). */
export function magnifierSide(data: Pick<CursorData, "width" | "height">, fx: CursorFx): number {
  const side = Math.round((2 * magnifierRadius(data, fx)) / magnifierZoom(fx) / 2) * 2;
  return Math.max(
    2,
    Math.min(side, Math.floor(data.width / 2) * 2, Math.floor(data.height / 2) * 2),
  );
}

/**
 * The part of the recording the magnifier shows around (cx, cy): the square of magnifierSide,
 * kept inside the frame (the export's crop clamps the same way).
 */
export function magnifierSource(
  data: Pick<CursorData, "width" | "height">,
  fx: CursorFx,
  cx: number,
  cy: number,
): { x: number; y: number; side: number } {
  const side = magnifierSide(data, fx);
  const clamp = (v: number, max: number): number => Math.max(0, Math.min(max - side, v));
  return {
    x: clamp(Math.round(cx - side / 2), data.width),
    y: clamp(Math.round(cy - side / 2), data.height),
    side,
  };
}

const smoothstep = (p: number): number => {
  const c = Math.max(0, Math.min(1, p));
  return c * c * (3 - 2 * c);
};

/** One pass of an exponential follower over `v` (weight `a` for the new value), in place. */
function follow(v: Float32Array, a: number, backward: boolean): void {
  const n = v.length;
  if (backward) for (let i = n - 2; i >= 0; i--) v[i] = v[i + 1] + a * (v[i] - v[i + 1]);
  else for (let i = 1; i < n; i++) v[i] = v[i - 1] + a * (v[i] - v[i - 1]);
}

/**
 * Smoothed, evenly sampled pointer track for a whole recording.
 *
 * The smoothing is a critically damped spring (two exponential followers) run forward and then
 * backward over the recorded positions: the pointer moves without lag, and since every pass only
 * averages positions it never overshoots where it goes. Around each click the track is pinned to
 * the click: the weight of the clicked point rises over [tc − L, tc], stays 1 while the button is
 * held (following a drag as recorded) and falls over L after the release, with
 * L = 0.08 + 0.25 · smooth seconds. The pointer is exactly where it clicked when it clicks.
 */
export function buildTrack(data: CursorData, fx: CursorFx, duration: number): CursorTrack {
  const n = Math.max(1, Math.ceil(duration * RATE) + 1);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const shape = new Uint8Array(n);
  const alpha = new Float32Array(n);
  const names: CursorShape[] = data.shapes.length
    ? data.shapes.map((_, i) => shapeName(data, i))
    : [...CURSOR_SHAPES];
  const moves = data.moves;
  const dt = 1 / RATE;
  // The recorded positions, held between moves.
  const rx = new Float32Array(n);
  const ry = new Float32Array(n);
  let j = 0;
  let lastMove = -Infinity;
  let lastRaw: [number, number] = [
    moves[0]?.[1] ?? data.width / 2,
    moves[0]?.[2] ?? data.height / 2,
  ];
  const indexOf = (i: number): number => (i >= 0 && i < names.length && i < 256 ? i : 0);
  let curShape = indexOf(moves[0]?.[3] ?? 0);
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    while (j < moves.length && moves[j][0] <= t) {
      const m = moves[j];
      if (Math.abs(m[1] - lastRaw[0]) + Math.abs(m[2] - lastRaw[1]) > 1) lastMove = m[0];
      lastRaw = [m[1], m[2]];
      curShape = indexOf(m[3]);
      j++;
    }
    shape[i] = curShape;
    rx[i] = lastRaw[0];
    ry[i] = lastRaw[1];
    const idle = t - lastMove;
    alpha[i] =
      !fx.hideIdle || idle < IDLE_AFTER ? 1 : Math.max(0, 1 - (idle - IDLE_AFTER) / IDLE_FADE);
  }
  x.set(rx);
  y.set(ry);
  if (fx.smooth > 0.02) {
    // The forward-only spring of earlier versions had a rate of √stiffness; running it forward
    // and back doubles the smoothing, so each pass is √2 quicker.
    const stiffness = 900 * (1 - Math.min(0.95, fx.smooth)) ** 2 + 30;
    const a = 1 - Math.exp(-Math.sqrt(stiffness) * Math.SQRT2 * dt);
    for (const v of [x, y]) {
      follow(v, a, false);
      follow(v, a, false);
      follow(v, a, true);
      follow(v, a, true);
    }
  }
  pinToClicks(data, fx, x, y, rx, ry);
  // Clicks wake the pointer up.
  if (fx.hideIdle)
    for (const c of data.clicks) {
      const a = Math.max(0, Math.floor((c[0] - 0.2) * RATE));
      const b = Math.min(n - 1, Math.ceil((c[0] + IDLE_AFTER) * RATE));
      for (let i = a; i <= b; i++) alpha[i] = 1;
    }
  if (fx.path?.length || fx.pathEdits?.length) {
    const edited = {
      ...fx,
      path: normalizeCursorPath(fx.path ?? [], data.width, data.height, duration),
      pathEdits: fx.pathEdits?.map((e) => ({
        ...e,
        points: normalizeCursorPath(e.points, data.width, data.height, duration),
      })),
    };
    for (let i = 0; i < n; i++) {
      const point = editedCursorAt(edited, i / RATE);
      if (point) {
        x[i] = point.x;
        y[i] = point.y;
        alpha[i] = 1;
      }
    }
  }
  return { rate: RATE, x, y, shape, names, alpha };
}

/** The recorded position at source second `t` (the last move up to it). */
function recordedAt(
  moves: CursorData["moves"],
  t: number,
  fallback: [number, number],
): [number, number] {
  let lo = 0;
  let hi = moves.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (moves[mid][0] <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? fallback : [moves[found][1], moves[found][2]];
}

/** Pins the smoothed track (x, y) to each click, as buildTrack describes. */
function pinToClicks(
  data: CursorData,
  fx: CursorFx,
  x: Float32Array,
  y: Float32Array,
  rx: Float32Array,
  ry: Float32Array,
): void {
  if (!data.clicks.length) return;
  const n = x.length;
  const dt = 1 / RATE;
  const L = 0.08 + 0.25 * Math.max(0, Math.min(1, fx.smooth));
  const weight = new Float32Array(n);
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  const fallback: [number, number] = [rx[0], ry[0]];
  for (const [tc, cx, cy, , held] of data.clicks) {
    const [ax, ay] = recordedAt(data.moves, tc, fallback);
    const release = tc + Math.max(0, held);
    const from = Math.max(0, Math.ceil((tc - L) * RATE));
    const to = Math.min(n - 1, Math.floor((release + L) * RATE));
    for (let i = from; i <= to; i++) {
      const t = i * dt;
      let w: number;
      let px: number;
      let py: number;
      if (t <= tc - dt) {
        // On the way to the click: drawn towards the clicked point, fully one sample early so the
        // pointer is on it at the click whichever two samples the click falls between.
        w = smoothstep((t - (tc - L)) / Math.max(dt, L - dt));
        px = cx;
        py = cy;
      } else if (t <= tc) {
        w = 1;
        px = cx;
        py = cy;
      } else {
        // Held (a drag follows the recording from the clicked point), then let go.
        w = t <= release ? 1 : 1 - smoothstep((t - release) / L);
        px = cx + rx[i] - ax;
        py = cy + ry[i] - ay;
      }
      if (w >= weight[i]) {
        weight[i] = w;
        tx[i] = px;
        ty[i] = py;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const w = weight[i];
    if (w <= 0) continue;
    x[i] += (tx[i] - x[i]) * w;
    y[i] += (ty[i] - y[i]) * w;
  }
}

export function cursorAt(track: CursorTrack, t: number): CursorState {
  const f = Math.max(0, Math.min(track.x.length - 1, t * track.rate));
  const i = Math.floor(f);
  const k = f - i;
  const j = Math.min(track.x.length - 1, i + 1);
  const index = track.shape[i];
  return {
    x: track.x[i] + (track.x[j] - track.x[i]) * k,
    y: track.y[i] + (track.y[j] - track.y[i]) * k,
    shape: track.names[index] ?? CURSOR_SHAPES[index] ?? "arrow",
    index,
    alpha: track.alpha[i] + (track.alpha[j] - track.alpha[i]) * k,
  };
}

export interface Ripple {
  x: number;
  y: number;
  /** 0..1 through the animation. */
  progress: number;
  button: number;
}

export function ripplesAt(data: CursorData, t: number, fx?: CursorFx): Ripple[] {
  const out: Ripple[] = [];
  for (const c of data.clicks) {
    if (c[0] > t) break;
    const p = (t - c[0]) / RIPPLE_SECONDS;
    // A stretch with the click rings off leaves out the clicks made in it.
    if (fx?.ranges?.length && !fxAt(fx, c[0]).clicks) continue;
    const point = fx ? editedCursorAt(fx, c[0]) : null;
    if (p < 1) out.push({ x: point?.x ?? c[1], y: point?.y ?? c[2], progress: p, button: c[3] });
  }
  return out;
}

/** Pointer height in video pixels: the standard pointer is ~26 px on a 1080p screen. */
export const cursorScale = (data: Pick<CursorData, "height">, fx: CursorFx): number =>
  (data.height / 1080) * fx.size;

/** Whether the magnifier is on anywhere in the recording (its ring is part of the sprite). */
export const magnifies = (fx: CursorFx): boolean =>
  !!fx.magnifier || !!fx.ranges?.some((r) => r.fx.magnifier);

/** Whether the spotlight is on anywhere in the recording. */
export const spotlights = (fx: CursorFx): boolean =>
  !!fx.spotlight || !!fx.ranges?.some((r) => r.fx.spotlight);

/**
 * Square sprite (video pixels) that holds the pointer, its halo, click rings and the magnifier's
 * ring, centered on the hotspot.
 */
export const spriteSize = (data: Pick<CursorData, "height">, fx: CursorFx): number =>
  Math.ceil(
    Math.max(140 * cursorScale(data, fx), magnifies(fx) ? 2 * (magnifierRadius(data, fx) + 6) : 0) /
      2,
  ) * 2;

/** The stretches' switches that change the pointer sprite (the spotlight and the sound do not). */
const SPRITE_RANGE_KEYS: readonly CursorRangeKey[] = ["halo", "clicks", "magnifier", "hidden"];

export const cursorFxId = (fx: CursorFx): string => {
  let hash = 2166136261;
  const ranges = (fx.ranges ?? [])
    .map((r) => ({
      a: r.start,
      b: r.end,
      on: SPRITE_RANGE_KEYS.map((key) => (r.fx[key] === undefined ? -1 : Number(r.fx[key]))),
    }))
    .filter((r) => r.on.some((v) => v >= 0));
  const looks = [
    fx.pointer ?? "auto",
    fx.halo || fx.ranges?.some((r) => r.fx.halo) ? (fx.haloColor ?? "") : "",
    magnifies(fx) ? [!!fx.magnifier, fx.magnifierRadius ?? 0] : 0,
  ];
  for (const char of JSON.stringify([fx.path ?? [], fx.pathEdits ?? [], ranges, looks]))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return [
    CURSOR_VERSION,
    fx.size.toFixed(2),
    fx.smooth.toFixed(2),
    +fx.clicks,
    +fx.halo,
    +fx.hideIdle,
    (hash >>> 0).toString(16),
  ].join("_");
};

/** Editable anchors from the actual recorded track, retaining turns and pauses in source time. */
export function recordedCursorPath(
  track: CursorTrack,
  start: number,
  end: number,
  tolerance = 6,
): CursorPoint[] {
  const last = (track.x.length - 1) / track.rate;
  start = Math.max(0, Math.min(last, start));
  end = Math.max(start, Math.min(last, end));
  const count = Math.max(1, Math.min(12000, Math.ceil((end - start) * 12)));
  const samples = Array.from({ length: count + 1 }, (_, i) => {
    const t = start + ((end - start) * i) / count;
    const p = cursorAt(track, t);
    return { t, x: p.x, y: p.y };
  });
  const keep = new Set([0, count]);
  const stack: [number, number][] = [[0, count]];
  while (stack.length && keep.size < 512) {
    const [a, b] = stack.pop()!;
    let worst = -1,
      error = tolerance;
    for (let i = a + 1; i < b; i++) {
      const p = cursorPathAt([samples[a], samples[b]], samples[i].t)!;
      const distance = Math.hypot(p.x - samples[i].x, p.y - samples[i].y);
      if (distance > error) {
        error = distance;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep.add(worst);
      stack.push([a, worst], [worst, b]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => samples[i]);
}

/** Top-left of the sprite for each frame at `fps`, in video pixels (the export moves it with these). */
export function spritePositions(
  track: CursorTrack,
  fps: number,
  duration: number,
  size: number,
): Int32Array {
  const n = Math.ceil(duration * fps);
  const out = new Int32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const s = cursorAt(track, i / fps);
    out[i * 2] = Math.round(s.x - size / 2);
    out[i * 2 + 1] = Math.round(s.y - size / 2);
  }
  return out;
}
