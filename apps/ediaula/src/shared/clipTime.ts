import type { Asset, Clip } from "./types.ts";

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

/**
 * Source seconds a clip of `asset` may reach on each side: the ends of the file (no end for a
 * still image), and the pauses of a take beside the clip (Asset.recording.paused), whose content
 * never goes into the lesson (shared/pausedMedia.ts).
 */
export function sourceRoom(
  c: Pick<Clip, "in" | "duration" | "speed">,
  asset: Pick<Asset, "kind" | "duration" | "recording"> | undefined,
): [number, number] {
  let lo = 0;
  let hi =
    !asset || asset.kind === "image" || asset.duration <= 0
      ? Number.POSITIVE_INFINITY
      : asset.duration;
  const from = c.in;
  const to = sourceEnd(c);
  for (const [a, b] of asset?.recording?.paused ?? []) {
    if (b <= from + 1e-6) lo = Math.max(lo, b);
    if (a >= to - 1e-6) hi = Math.min(hi, a);
  }
  return [lo, hi];
}

export function newId(prefix = ""): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
