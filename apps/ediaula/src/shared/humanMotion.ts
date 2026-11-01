import type { Point } from "./locators.ts";

/**
 * How a person moves the mouse, for the guided recording: never a straight line at a fixed speed.
 * The pointer leaves slowly, speeds up and slows down again on arrival (minimum jerk), along a
 * slight arc whose side and size vary from one move to the next, and on a small or far target it
 * goes a little past it and comes back. How long it takes depends on the distance and on the size
 * of the target (Fitts's law). Everything comes from a seed, so the same move is drawn again the
 * same way: the video's cursor is made from the log afterwards (shared/guidedCursor.ts).
 */

export const MOTION_PROFILES = ["crianca", "professora"] as const;
export type MotionProfile = (typeof MOTION_PROFILES)[number];

export const MOTION_LABELS: Record<MotionProfile, string> = {
  crianca: "Como uma criança",
  professora: "Como a professora",
};

/** A move as drawn: the curve's control points, and how far past the target it goes. */
export interface HumanPath {
  from: Point;
  to: Point;
  c1: Point;
  c2: Point;
  /** Overshoot, in CSS pixels past `to` along the direction of the move (0: none). */
  over: number;
}

/** A small deterministic generator (mulberry32): the same seed gives the same moves. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for a move from where it starts and ends (and which move of the take it is). */
export const moveSeed = (from: Point, to: Point, index = 0): number =>
  (Math.round(from.x) * 73856093) ^
  (Math.round(from.y) * 19349663) ^
  (Math.round(to.x) * 83492791) ^
  (Math.round(to.y) * 2654435761) ^
  (index * 40503);

/** Below this many pixels a move is a nudge: straight, no arc, no overshoot. */
const NUDGE = 12;

/**
 * The path of a move from `from` to `to`: a cubic curve bowed to one side by 3 to 12% of the
 * distance, and, on a far or small target, a short overshoot that comes back.
 */
export function humanPath(from: Point, to: Point, seed: number, targetSize = 40): HumanPath {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < NUDGE) return { from, to, c1: from, c2: to, over: 0 };
  const random = seeded(seed);
  const side = random() < 0.5 ? -1 : 1;
  const bow = (0.03 + random() * 0.09) * distance * side;
  // The perpendicular of the move, for the arc.
  const nx = -dy / distance;
  const ny = dx / distance;
  const along = (k: number, off: number): Point => ({
    x: from.x + dx * k + nx * off,
    y: from.y + dy * k + ny * off,
  });
  const c1 = along(0.25 + random() * 0.1, bow);
  const c2 = along(0.7 + random() * 0.1, bow * (0.4 + random() * 0.4));
  // Far moves and small targets go a little past; the larger the target, the less.
  const difficulty = Math.log2(1 + distance / Math.max(8, targetSize));
  const over = difficulty > 3.2 ? Math.min(14, (difficulty - 3) * 4 * (0.5 + random() * 0.5)) : 0;
  return { from, to, c1, c2, over };
}

/** Minimum jerk: slow out, fast in the middle, slow in (the velocity curve of a hand). */
export const minimumJerk = (t: number): number => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * u * (10 - 15 * u + 6 * u * u);
};

const bezier = (p: HumanPath, k: number): Point => {
  const m = 1 - k;
  const a = m * m * m;
  const b = 3 * m * m * k;
  const c = 3 * m * k * k;
  const d = k * k * k;
  return {
    x: a * p.from.x + b * p.c1.x + c * p.c2.x + d * p.to.x,
    y: a * p.from.y + b * p.c1.y + c * p.c2.y + d * p.to.y,
  };
};

/** Share of the move spent going out to the overshoot; the rest comes back to the target. */
const OUT = 0.86;

/** Where the pointer is at `t` (0 to 1) of the move. */
export function pathAt(p: HumanPath, t: number): Point {
  const u = Math.max(0, Math.min(1, t));
  if (u >= 1) return p.to;
  if (!p.over) return bezier(p, minimumJerk(u));
  const dx = p.to.x - p.from.x;
  const dy = p.to.y - p.from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const past = { x: (dx / distance) * p.over, y: (dy / distance) * p.over };
  if (u < OUT) {
    // Out along the curve, ending the overshoot's length past the target.
    const k = minimumJerk(u / OUT);
    const q = bezier(p, k);
    return { x: q.x + past.x * k, y: q.y + past.y * k };
  }
  // A short, slow correction back onto the target.
  const k = minimumJerk((u - OUT) / (1 - OUT));
  return { x: p.to.x + past.x * (1 - k), y: p.to.y + past.y * (1 - k) };
}

/** Seconds each profile takes: a fixed part and one per bit of difficulty (Fitts), with bounds. */
const FITTS: Record<MotionProfile, { a: number; b: number; min: number; max: number }> = {
  crianca: { a: 0.35, b: 0.2, min: 0.55, max: 2.4 },
  professora: { a: 0.2, b: 0.13, min: 0.35, max: 1.6 },
};

/** How long a move takes: farther and smaller targets take longer, as a person's hand would. */
export function humanDuration(
  distance: number,
  targetSize: number,
  profile: MotionProfile,
): number {
  if (distance < NUDGE) return 0.15;
  const f = FITTS[profile];
  const seconds = f.a + f.b * Math.log2(1 + distance / Math.max(8, targetSize));
  return Math.round(Math.min(f.max, Math.max(f.min, seconds)) * 1000) / 1000;
}

/**
 * The seconds between typed characters: a person's rhythm, around `base`, a little slower after a
 * space or punctuation, never twice the same.
 */
export function typingGaps(text: string, seed: number, base = 0.09): number[] {
  const random = seeded(seed);
  return [...text].map((char, i) => {
    const before = i > 0 ? text[i - 1] : "";
    const pause = /[\s.,;:!?]/.test(before) ? 0.08 : 0;
    return Math.round((base * (0.6 + random() * 0.8) + pause) * 1000) / 1000;
  });
}

/**
 * A wheel scroll of `delta` pixels as a person does it: small steps that speed up and slow down
 * (minimum jerk), one per frame over `seconds`. Returns the pixels of each step.
 */
export function smoothScroll(delta: number, seconds: number, fps: number): number[] {
  const frames = Math.max(1, Math.round(seconds * fps));
  const steps: number[] = [];
  let done = 0;
  for (let i = 1; i <= frames; i++) {
    const at = Math.round(delta * minimumJerk(i / frames));
    steps.push(at - done);
    done = at;
  }
  return steps.filter((s) => s !== 0);
}

/** Seconds a scroll of `delta` pixels takes: about a screenful a second, at least a third of one. */
export const scrollSeconds = (delta: number): number =>
  Math.round(Math.min(2.5, Math.max(0.35, Math.abs(delta) / 900)) * 1000) / 1000;
