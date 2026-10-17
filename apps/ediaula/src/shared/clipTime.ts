import type { Clip } from "./types.ts";

/**
 * Time arithmetic of a clip (timeline seconds against seconds of its source file). Lives apart
 * from timeline.ts so the piece helper (pieces.ts) and the timeline operations can both use it.
 */

export const clipEnd = (c: Pick<Clip, "start" | "duration">): number => c.start + c.duration;

/** Playback speed of a clip (2 = twice as fast); 1 when not set. */
export const clipSpeed = (c: Pick<Clip, "speed">): number => c.speed ?? 1;
/** Source time (seconds of the original file) shown at timeline time `t`. */
export const sourceAt = (c: Pick<Clip, "start" | "in" | "speed">, t: number): number =>
  c.in + (t - c.start) * clipSpeed(c);
/** Timeline time at which source time `src` shows. */
export const timelineAt = (c: Pick<Clip, "start" | "in" | "speed">, src: number): number =>
  c.start + (src - c.in) / clipSpeed(c);
/** End of the clip's stretch of the source. */
export const sourceEnd = (c: Pick<Clip, "in" | "duration" | "speed">): number =>
  c.in + c.duration * clipSpeed(c);

export function newId(prefix = ""): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
