import type { HookEvent } from "./helperProtocol.ts";

/**
 * The native helper's events on the take's clock: QPC milliseconds become seconds of the video
 * across its parts (shared/cursorData.ts builds the cursor.json from them).
 */

export interface CaptureSegment {
  /** QueryPerformanceCounter milliseconds of the first frame. */
  start: number;
  /** Seconds of video. */
  duration: number;
}

/** Maps a QPC time to video seconds across segments; -1 when it fell in a pause. */
export function toVideoTime(segments: readonly CaptureSegment[], t: number): number {
  let offset = 0;
  for (const g of segments) {
    if (t >= g.start && t <= g.start + g.duration * 1000) return offset + (t - g.start) / 1000;
    offset += g.duration;
  }
  return -1;
}

const timeOf = (e: HookEvent): number => ("t" in e ? e.t : Number.NEGATIVE_INFINITY);

/**
 * One stream from two copies of it (memory and the journal), in time order. Each event appears
 * once; cursor images, which have no time, come first.
 */
export function mergeHookEvents(...copies: readonly (readonly HookEvent[])[]): HookEvent[] {
  const seen = new Set<string>();
  const merged: HookEvent[] = [];
  for (const copy of copies)
    for (const event of copy) {
      const key = JSON.stringify(event);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(event);
    }
  return merged
    .map((event, index) => ({ event, index }))
    .sort((a, b) => timeOf(a.event) - timeOf(b.event) || a.index - b.index)
    .map((entry) => entry.event);
}

/** What the journal keeps at the end: events inside the segments, and the cursor images. */
export const insideSegments = (event: HookEvent, segments: readonly CaptureSegment[]): boolean =>
  "t" in event ? toVideoTime(segments, event.t) >= 0 : event.e === "img";
