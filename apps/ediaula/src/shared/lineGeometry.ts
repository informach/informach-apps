/**
 * A line or an arrow drawn on the preview, and its ends dragged afterwards (editor/LinePen.tsx,
 * editor/LineEndsControl.tsx). The annotation keeps saying it the way it always did: its center
 * in the clip's transform, `angle` (degrees, 0 = toward the right, 90 = down) and `length` in
 * pixels of a 1080p frame, from the start (the tail) to the end (the tip). These turn where the
 * person pressed and let go into those numbers, and back into the two ends on the screen.
 */

export interface Point {
  x: number;
  y: number;
}

/** Pointing straight, diagonally or sideways: Shift snaps a drawn line to steps of 45°. */
export const SNAP_DEGREES = 45;

/** A line shorter than this (screen pixels) is a click, not a drawing. */
export const MIN_DRAG_PX = 6;

const degrees = (radians: number): number => (radians * 180) / Math.PI;
const radians = (deg: number): number => (deg * Math.PI) / 180;

/** Normalized to (-180, 180]. */
export function normalAngle(deg: number): number {
  const n = ((((deg + 180) % 360) + 360) % 360) - 180;
  return n === -180 ? 180 : n;
}

/**
 * The end moved so the line from `start` points at a multiple of 45°, its length kept. Used while
 * Shift is held, the way drawing tools do.
 */
export function snapEnd(start: Point, end: Point): Point {
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  const step = radians(SNAP_DEGREES);
  const a = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / step) * step;
  return { x: start.x + Math.cos(a) * len, y: start.y + Math.sin(a) * len };
}

/**
 * A line drawn on the frame from `start` to `end` (fractions of the frame): where its center goes
 * (fractions) and its angle and length, in 1080p pixels of a picture at its natural size.
 */
export function lineFromDrag(
  start: Point,
  end: Point,
  frame: { width: number; height: number },
): { x: number; y: number; angle: number; length: number } {
  const dx = (end.x - start.x) * frame.width;
  const dy = (end.y - start.y) * frame.height;
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
    angle: normalAngle(degrees(Math.atan2(dy, dx))),
    length: (Math.hypot(dx, dy) * 1080) / frame.height,
  };
}

/** How the clip turns and mirrors its picture (shared/compose.ts Transform). */
export interface Turn {
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
}

/** The picture's angle as the screen shows it: mirrored first, then turned. */
function shownAngle(angle: number, turn: Turn): number {
  let a = angle;
  if (turn.flipH) a = 180 - a;
  if (turn.flipV) a = -a;
  return a + (turn.rotation ?? 0);
}

/** The inverse of shownAngle: the angle to save for a line the screen shows at `shown`. */
function savedAngle(shown: number, turn: Turn): number {
  let a = shown - (turn.rotation ?? 0);
  if (turn.flipV) a = -a;
  if (turn.flipH) a = 180 - a;
  return normalAngle(a);
}

/**
 * The two ends on the screen. `center` is the middle of the picture on the stage, `unit` screen
 * pixels per 1080p pixel of the annotation (its own scale included).
 */
export function lineEnds(
  center: Point,
  angle: number,
  length: number,
  unit: number,
  turn: Turn = {},
): { start: Point; end: Point } {
  const a = radians(shownAngle(angle, turn));
  const hx = (Math.cos(a) * length * unit) / 2;
  const hy = (Math.sin(a) * length * unit) / 2;
  return {
    start: { x: center.x - hx, y: center.y - hy },
    end: { x: center.x + hx, y: center.y + hy },
  };
}

/**
 * The line with its ends now at `start` and `end` on the screen (one of them dragged, the other
 * where it was): its angle and length to save, and how far its center moved, in screen pixels.
 */
export function lineThrough(
  start: Point,
  end: Point,
  oldCenter: Point,
  unit: number,
  turn: Turn = {},
): { angle: number; length: number; shift: Point } {
  return {
    angle: savedAngle(degrees(Math.atan2(end.y - start.y, end.x - start.x)), turn),
    length: Math.hypot(end.x - start.x, end.y - start.y) / unit,
    shift: { x: (start.x + end.x) / 2 - oldCenter.x, y: (start.y + end.y) / 2 - oldCenter.y },
  };
}
