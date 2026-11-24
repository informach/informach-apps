import type { BalloonGeometry, Tail } from "./annotation.ts";
import { zoomsBetween } from "./regionFollow.ts";
import type { Project } from "./types.ts";
import { zoomAffine } from "./zoomLayer.ts";

/**
 * Balloons that point at something: the text broken into lines of about the same length, and
 * the tail aimed at a point of the frame (a button, the place of a recorded click), with the
 * body slid inside the frame and on the side facing that point.
 */

/** Letters per line of a balloon when nothing says otherwise (a short, readable line). */
export const BALLOON_CHARS_PER_LINE = 20;

/** The lines greedy wrapping makes at width `max`. A word wider than `max` stays on its own line. */
function greedy(words: readonly string[], measure: (s: string) => number, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Lines of about the same length, never wider than `max` (in the units of `measure`: letters, or
 * pixels of a canvas): as few lines as greedy wrapping at `max` needs, at the narrowest width that
 * still fits them in that many. A lone word on the last line takes the word before it along.
 * `\n` starts a new line where it is; each part is balanced on its own.
 */
export function balancedWrap(text: string, measure: (s: string) => number, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    const count = greedy(words, measure, max).length;
    let lines = greedy(words, measure, max);
    if (count > 1) {
      // The narrowest width that keeps the same number of lines.
      let lo = Math.max(...words.map(measure));
      let hi = Math.max(lo, max);
      for (let i = 0; i < 24 && hi - lo > 0.25; i++) {
        const mid = (lo + hi) / 2;
        if (greedy(words, measure, mid).length <= count) hi = mid;
        else lo = mid;
      }
      lines = greedy(words, measure, hi);
    }
    out.push(...noLoneWord(lines, measure, max));
  }
  return out;
}

/** A last line of one word (after a line of two or more) gets the word before it, when it fits. */
function noLoneWord(lines: string[], measure: (s: string) => number, max: number): string[] {
  if (lines.length < 2) return lines;
  const last = lines[lines.length - 1]!.split(" ");
  const before = lines[lines.length - 2]!.split(" ");
  if (last.length !== 1 || before.length < 2) return lines;
  const moved = `${before[before.length - 1]} ${last[0]}`;
  if (measure(moved) > max) return lines;
  return [...lines.slice(0, -2), before.slice(0, -1).join(" "), moved];
}

/**
 * Whether a part of `text` ends with a word alone on its line, in the lines it was drawn with
 * (`\n` parts that are one word long do not count: that is how they were typed).
 */
export function loneLastWord(text: string, lines: readonly string[]): boolean {
  const count = (s: string): number => s.split(/\s+/).filter(Boolean).length;
  let at = 0;
  for (const para of text.split("\n")) {
    const words = count(para);
    if (!words) {
      at++;
      continue;
    }
    // The lines this part was drawn on.
    const own: number[] = [];
    let seen = 0;
    while (at < lines.length && seen < words) {
      const n = count(lines[at++]!);
      own.push(n);
      seen += n;
    }
    if (words >= 3 && own.length >= 2 && own.at(-1) === 1 && (own.at(-2) ?? 0) >= 2) return true;
  }
  return false;
}

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

/** How the balloon picture is on the frame: its center (fractions), size and the body in it. */
export interface BalloonOnFrame {
  /** Frame pixels. */
  frame: { width: number; height: number };
  /** Frame pixels per pixel of the picture. */
  density: number;
  /** The whole picture on the frame, in frame pixels. */
  image: Rect;
  /** The body inside the picture, in picture pixels (balloonGeometry). */
  body: Pick<BalloonGeometry, "x" | "y" | "w" | "h">;
}

/** The body on the frame, in frame pixels. */
export function bodyOnFrame(b: BalloonOnFrame): Rect {
  return {
    x: b.image.x + b.body.x * b.density,
    y: b.image.y + b.body.y * b.density,
    w: b.body.w * b.density,
    h: b.body.h * b.density,
  };
}

/** Where the tail tip is on the frame, in frame pixels (`geometry` from the picture). */
export function tipOnFrame(
  image: Rect,
  density: number,
  geometry: Pick<BalloonGeometry, "tipX" | "tipY">,
): Point {
  return { x: image.x + geometry.tipX * density, y: image.y + geometry.tipY * density };
}

export interface BalloonAim {
  tail: Tail;
  /** The tip in fractions of the body (Annotation.tailPoint). */
  tailPoint: Point;
  /** Body move, in fractions of the frame. */
  move: { dx: number; dy: number };
  /** The body where it ends up, in frame pixels. */
  body: Rect;
}

/**
 * The tail of a balloon aimed at `target` (frame pixels). The body keeps its place unless
 * `place` asks for a new one or the target falls on it: then it goes just above the target (below
 * it when the target is high on the frame), centered on it. Either way it slides inside the frame,
 * `margin` from its edges, and the tip stays on the target. The tail leaves the side facing the
 * target: the top when the target is above the body, the bottom when it is below, a side when it
 * is level with the body.
 *
 * `size` is the body's size now (a text that changed makes it bigger or smaller); `gap` is how far
 * the body stays from the target when placed, in frame pixels.
 */
export function aimBalloon(
  current: Rect,
  size: { w: number; h: number },
  target: Point,
  frame: { width: number; height: number },
  opts: { place?: boolean; gap: number; margin: number },
): BalloonAim {
  const { width: W, height: H } = frame;
  const { gap, margin } = opts;
  const cx = current.x + current.w / 2;
  const cy = current.y + current.h / 2;
  const slideX = (x: number): number => Math.max(margin, Math.min(W - margin - size.w, x));
  const slideY = (y: number): number => Math.max(margin, Math.min(H - margin - size.h, y));
  // The body where it is now, at its new size, around the same center.
  let x = slideX(cx - size.w / 2);
  let y = slideY(cy - size.h / 2);
  const clear = (top: number): boolean =>
    target.y <= top - gap * 0.5 || target.y >= top + size.h + gap * 0.5;
  const onBody =
    target.x > x - gap * 0.5 &&
    target.x < x + size.w + gap * 0.5 &&
    target.y > y - gap * 0.5 &&
    target.y < y + size.h + gap * 0.5;
  if (opts.place || onBody) {
    x = slideX(target.x - size.w / 2);
    const above = slideY(target.y - gap - size.h);
    const below = slideY(target.y + gap);
    // Above, unless the target is high on the frame or there is no room above it.
    const first = target.y < H * 0.4 ? below : above;
    const second = first === above ? below : above;
    y = clear(first) ? first : clear(second) ? second : first;
  }
  const body = { x, y, w: size.w, h: size.h };
  const tail: Tail =
    target.y < body.y
      ? "top"
      : target.y > body.y + body.h
        ? "bottom"
        : target.x < body.x
          ? "left"
          : "right";
  return {
    tail,
    tailPoint: { x: (target.x - body.x) / body.w, y: (target.y - body.y) / body.h },
    move: { dx: (x + size.w / 2 - cx) / W, dy: (y + size.h / 2 - cy) / H },
    body,
  };
}

/**
 * Where a point of the screen (`target`, fractions of the frame without zoom layers) shows at
 * timeline second `t` for something on track `trackId`: the zoom layers below that track magnify
 * the screen and not it. In frame pixels. A track not in the lesson counts as the top one.
 */
export function targetOnFrame(
  p: Pick<Project, "clips" | "tracks" | "settings">,
  trackId: string | null,
  target: Point,
  t: number,
): Point {
  const W = p.settings.width;
  const H = p.settings.height;
  const own = trackId ? p.tracks.findIndex((tr) => tr.id === trackId) : -1;
  const A = zoomAffine(zoomsBetween(p, own, p.tracks.length, t), W, H);
  return { x: A.s * target.x * W + A.tx, y: A.s * target.y * H + A.ty };
}

/**
 * How far the target moves on the frame while the balloon is up (frame pixels): a zoom layer
 * that comes in or out under it takes the item away from the tip. The ends of the balloon's
 * entrance and exit are left out.
 */
export function targetDrift(
  p: Pick<Project, "clips" | "tracks" | "settings">,
  trackId: string | null,
  target: Point,
  from: number,
  to: number,
): number {
  const edge = Math.min(0.3, (to - from) / 4);
  const at = [from + edge, (from + to) / 2, to - edge];
  const points = at.map((t) => targetOnFrame(p, trackId, target, t));
  const mid = points[1]!;
  return Math.max(...points.map((q) => Math.hypot(q.x - mid.x, q.y - mid.y)));
}
