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
  /** Soft yellow halo around the pointer, easy to follow for children. */
  halo: boolean;
  /** Fades the pointer out after a few seconds without movement. */
  hideIdle: boolean;
  /** Draw nothing (the recording stays without a pointer). */
  hidden?: boolean;
  /** Show the shortcut keys pressed while recording (when they were recorded). Default on. */
  keys?: boolean;
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

/** Bump when the drawing changes so cached pointer videos are rebuilt. */
export const CURSOR_VERSION = 2;

/** Samples per second of the smoothed track. */
const RATE = 120;
export const RIPPLE_SECONDS = 0.45;
const IDLE_AFTER = 2.5;
const IDLE_FADE = 0.4;

export interface CursorTrack {
  rate: number;
  x: Float32Array;
  y: Float32Array;
  shape: Uint8Array;
  /** 0..1 visibility (idle fade). */
  alpha: Float32Array;
}

export interface CursorState {
  x: number;
  y: number;
  shape: CursorShape;
  alpha: number;
}

/** Smoothed, evenly sampled pointer track for a whole recording. */
export function buildTrack(data: CursorData, fx: CursorFx, duration: number): CursorTrack {
  const n = Math.max(1, Math.ceil(duration * RATE) + 1);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const shape = new Uint8Array(n);
  const alpha = new Float32Array(n);
  const moves = data.moves;
  // Critically damped spring following the raw position: smooth but never overshooting.
  const stiffness = 900 * (1 - Math.min(0.95, fx.smooth)) ** 2 + 30;
  const omega = Math.sqrt(stiffness);
  const dt = 1 / RATE;
  let j = 0;
  let px = moves[0]?.[1] ?? data.width / 2;
  let py = moves[0]?.[2] ?? data.height / 2;
  let vx = 0;
  let vy = 0;
  let lastMove = -Infinity;
  let lastRaw: [number, number] = [px, py];
  // Images of the take are drawn as the standard shape they resemble, for now.
  const base = (index: number): number => CURSOR_SHAPES.indexOf(shapeName(data, index));
  let curShape = base(moves[0]?.[3] ?? 0);
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    while (j < moves.length && moves[j][0] <= t) {
      const m = moves[j];
      if (Math.abs(m[1] - lastRaw[0]) + Math.abs(m[2] - lastRaw[1]) > 1) lastMove = m[0];
      lastRaw = [m[1], m[2]];
      curShape = base(m[3]);
      j++;
    }
    shape[i] = curShape;
    const [tx, ty] = lastRaw;
    if (fx.smooth <= 0.02) {
      px = tx;
      py = ty;
    } else {
      const ax = omega * omega * (tx - px) - 2 * omega * vx;
      const ay = omega * omega * (ty - py) - 2 * omega * vy;
      vx += ax * dt;
      vy += ay * dt;
      px += vx * dt;
      py += vy * dt;
    }
    x[i] = px;
    y[i] = py;
    const idle = t - lastMove;
    alpha[i] =
      !fx.hideIdle || idle < IDLE_AFTER ? 1 : Math.max(0, 1 - (idle - IDLE_AFTER) / IDLE_FADE);
  }
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
  return { rate: RATE, x, y, shape, alpha };
}

export function cursorAt(track: CursorTrack, t: number): CursorState {
  const f = Math.max(0, Math.min(track.x.length - 1, t * track.rate));
  const i = Math.floor(f);
  const k = f - i;
  const j = Math.min(track.x.length - 1, i + 1);
  return {
    x: track.x[i] + (track.x[j] - track.x[i]) * k,
    y: track.y[i] + (track.y[j] - track.y[i]) * k,
    shape: CURSOR_SHAPES[track.shape[i]] ?? "arrow",
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
    const point = fx ? editedCursorAt(fx, c[0]) : null;
    if (p < 1) out.push({ x: point?.x ?? c[1], y: point?.y ?? c[2], progress: p, button: c[3] });
  }
  return out;
}

/** Pointer height in video pixels: the standard pointer is ~26 px on a 1080p screen. */
export const cursorScale = (data: Pick<CursorData, "height">, fx: CursorFx): number =>
  (data.height / 1080) * fx.size;

/** Square sprite (video pixels) that holds the pointer, its halo and click rings, centered on the hotspot. */
export const spriteSize = (data: Pick<CursorData, "height">, fx: CursorFx): number =>
  Math.ceil((140 * cursorScale(data, fx)) / 2) * 2;

export const cursorFxId = (fx: CursorFx): string => {
  let hash = 2166136261;
  for (const char of JSON.stringify([fx.path ?? [], fx.pathEdits ?? []]))
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
