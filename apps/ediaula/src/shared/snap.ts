import { clipEnd } from "./clipTime.ts";
import type { Clip } from "./types.ts";

/**
 * The timeline's magnet: every moment an edit may want to land on (clip edges, the playhead,
 * the start and end of each spoken word, silences, recording markers, the selected interval) in
 * one sorted array, looked up by binary search, so dragging over a lesson with thousands of
 * clips and words costs a few comparisons per move. The array is made once per state of the
 * lesson (the timeline keeps it while the clips, words and interval stay the same); the clips
 * being dragged and the playhead, which change per gesture, are handled by the search. Landing on the edges of words is the point:
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
  /** The clip each edge belongs to (undefined for the other targets). */
  owners: (string | undefined)[];
}

export interface SnapSources {
  clips: readonly Pick<Clip, "id" | "start" | "duration">[];
  /** Timeline words (start and end are both targets). */
  words?: readonly { start: number; end: number }[];
  /** Quiet stretches on the timeline. */
  silences?: readonly (readonly [number, number])[];
  markers?: readonly number[];
  interval?: { start: number; end: number } | null;
}

export function buildSnapIndex(s: SnapSources): SnapIndex {
  const points: [number, number, string | undefined][] = [
    [0, SNAP_KINDS.indexOf("zero"), undefined],
  ];
  const push = (t: number, kind: (typeof SNAP_KINDS)[number], owner?: string): void => {
    if (Number.isFinite(t) && t >= 0) points.push([t, SNAP_KINDS.indexOf(kind), owner]);
  };
  for (const c of s.clips) {
    push(c.start, "edge", c.id);
    push(clipEnd(c), "edge", c.id);
  }
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
  const owners = points.map((p) => p[2]);
  points.forEach(([t, k], i) => {
    times[i] = t;
    kinds[i] = k;
  });
  return { times, kinds, owners };
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

export interface SnapGesture {
  /** Clips being dragged: their own edges are not targets. */
  exclude?: ReadonlySet<string>;
  playhead?: number;
}

/**
 * The target closest to `t` within `threshold` seconds (on a tie, the kind listed first in
 * SNAP_KINDS: an edge before a word). Without one, `t` on the frame grid when `fps` is given.
 */
export function snapTo(
  index: SnapIndex,
  t: number,
  threshold: number,
  fps?: number,
  gesture: SnapGesture = {},
): Snapped {
  const { times, kinds, owners } = index;
  const { exclude, playhead } = gesture;
  let best = -1;
  let bestDistance = threshold;
  const consider = (i: number): void => {
    const owner = owners[i];
    if (owner !== undefined && exclude?.has(owner)) return;
    const d = Math.abs(times[i] - t);
    if (d < bestDistance || (best >= 0 && d === bestDistance && kinds[i] < kinds[best])) {
      best = i;
      bestDistance = d;
    }
  };
  const at = lowerBound(times, t);
  for (let i = at; i < times.length && times[i] - t < threshold; i++) consider(i);
  for (let i = at - 1; i >= 0 && t - times[i] < threshold; i--) consider(i);
  const head = SNAP_KINDS.indexOf("playhead");
  if (playhead !== undefined && playhead >= 0) {
    const d = Math.abs(playhead - t);
    if (d < bestDistance || (best >= 0 && d === bestDistance && head < kinds[best]))
      return { time: playhead, kind: "playhead" };
  }
  if (best >= 0) return { time: times[best], kind: SNAP_KINDS[kinds[best]] };
  if (fps && fps > 0) {
    const frame = Math.max(0, Math.round(t * fps)) / fps;
    return { time: frame, kind: "frame" };
  }
  return { time: t };
}

/** Whether the snap is worth a guide line on the timeline (the frame grid is not). */
export const shownSnap = (s: Snapped): boolean => !!s.kind && s.kind !== "frame";
