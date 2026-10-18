import { clipEnd } from "./clipTime.ts";
import type { Clip } from "./types.ts";

/**
 * The timeline's magnet: every moment an edit may want to land on (clip edges, the playhead,
 * the start and end of each spoken word, silences, recording markers, the selected interval) in
 * one sorted array, looked up by binary search, so dragging over a lesson with thousands of
 * clips and words costs a few comparisons per move. Landing on the edges of words is the point:
 * cuts fall where the speech starts and stops. When nothing is near, the time still lands on the
 * frame grid.
 */

export const SNAP_KINDS = [
  "edge",
  "playhead",
  "interval",
  "marker",
  "word",
  "silence",
  "zero",
] as const;
export type SnapKind = (typeof SNAP_KINDS)[number] | "frame";

export interface SnapIndex {
  /** Ascending times. */
  times: Float64Array;
  /** SNAP_KINDS index of each time. */
  kinds: Uint8Array;
}

export interface SnapSources {
  clips: readonly Pick<Clip, "id" | "start" | "duration">[];
  /** Clips being dragged: their own edges are not targets. */
  exclude?: ReadonlySet<string>;
  playhead?: number;
  /** Timeline words (start and end are both targets). */
  words?: readonly { start: number; end: number }[];
  /** Quiet stretches on the timeline. */
  silences?: readonly (readonly [number, number])[];
  markers?: readonly number[];
  interval?: { start: number; end: number } | null;
}

export function buildSnapIndex(s: SnapSources): SnapIndex {
  const points: [number, number][] = [[0, SNAP_KINDS.indexOf("zero")]];
  const push = (t: number, kind: (typeof SNAP_KINDS)[number]): void => {
    if (Number.isFinite(t) && t >= 0) points.push([t, SNAP_KINDS.indexOf(kind)]);
  };
  for (const c of s.clips) {
    if (s.exclude?.has(c.id)) continue;
    push(c.start, "edge");
    push(clipEnd(c), "edge");
  }
  if (s.playhead !== undefined) push(s.playhead, "playhead");
  if (s.interval) {
    push(s.interval.start, "interval");
    push(s.interval.end, "interval");
  }
  for (const m of s.markers ?? []) push(m, "marker");
  for (const w of s.words ?? []) {
    push(w.start, "word");
    push(w.end, "word");
  }
  for (const [a, b] of s.silences ?? []) {
    push(a, "silence");
    push(b, "silence");
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const times = new Float64Array(points.length);
  const kinds = new Uint8Array(points.length);
  points.forEach(([t, k], i) => {
    times[i] = t;
    kinds[i] = k;
  });
  return { times, kinds };
}

/** First index whose time is not below `t`. */
function lowerBound(times: Float64Array, t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface Snapped {
  time: number;
  /** What it landed on; "frame" when nothing was near and it only went to the frame grid. */
  kind?: SnapKind;
}

/**
 * The target closest to `t` within `threshold` seconds (on a tie, the kind listed first in
 * SNAP_KINDS: an edge before a word). Without one, `t` on the frame grid when `fps` is given.
 */
export function snapTo(index: SnapIndex, t: number, threshold: number, fps?: number): Snapped {
  const { times, kinds } = index;
  let best = -1;
  let bestDistance = threshold;
  const consider = (i: number): void => {
    const d = Math.abs(times[i] - t);
    if (d < bestDistance || (best >= 0 && d === bestDistance && kinds[i] < kinds[best])) {
      best = i;
      bestDistance = d;
    }
  };
  const at = lowerBound(times, t);
  for (let i = at; i < times.length && times[i] - t < threshold; i++) consider(i);
  for (let i = at - 1; i >= 0 && t - times[i] < threshold; i--) consider(i);
  if (best >= 0) return { time: times[best], kind: SNAP_KINDS[kinds[best]] };
  if (fps && fps > 0) {
    const frame = Math.max(0, Math.round(t * fps)) / fps;
    return { time: frame, kind: "frame" };
  }
  return { time: t };
}

/** Whether the snap is worth a guide line on the timeline (the frame grid is not). */
export const shownSnap = (s: Snapped): boolean => !!s.kind && s.kind !== "frame";
