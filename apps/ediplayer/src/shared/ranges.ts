/** A stretch of the source, in seconds. */
export interface Range {
  start: number;
  end: number;
}

/** Ranges shorter than this are dropped: nothing a person can see or hear. */
export const MIN_RANGE = 0.05;

/** Clamps to [0, duration], drops empty ranges, sorts and merges overlaps. */
export function normalizeRanges(ranges: readonly Range[], duration: number): Range[] {
  const clamped = ranges
    .map((r) => ({
      start: Math.max(0, Math.min(duration, Math.min(r.start, r.end))),
      end: Math.max(0, Math.min(duration, Math.max(r.start, r.end))),
    }))
    .filter((r) => r.end - r.start >= MIN_RANGE)
    .sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of clamped) {
    const last = out.at(-1);
    if (last && r.start <= last.end + 1e-6) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** What is left of [0, duration] outside the ranges. */
export function invertRanges(ranges: readonly Range[], duration: number): Range[] {
  const out: Range[] = [];
  let cursor = 0;
  for (const r of normalizeRanges(ranges, duration)) {
    if (r.start - cursor >= MIN_RANGE) out.push({ start: cursor, end: r.start });
    cursor = r.end;
  }
  if (duration - cursor >= MIN_RANGE) out.push({ start: cursor, end: duration });
  return out;
}

export type MarkMode = "remove" | "keep";

/**
 * The stretches that end up in the result. No marks keeps everything; "remove" drops the marked
 * stretches, "keep" keeps only them.
 */
export function keptRanges(marks: readonly Range[], mode: MarkMode, duration: number): Range[] {
  if (!marks.length) return duration >= MIN_RANGE ? [{ start: 0, end: duration }] : [];
  return mode === "keep" ? normalizeRanges(marks, duration) : invertRanges(marks, duration);
}

export const totalDuration = (ranges: readonly Range[]): number =>
  ranges.reduce((sum, r) => sum + (r.end - r.start), 0);

/**
 * Where a cut without re-encoding really starts: the last keyframe at or before `t`. Keyframes
 * come sorted; with none known the cut stays where it was asked.
 */
export function keyframeAtOrBefore(t: number, keyframes: readonly number[]): number {
  let lo = 0,
    hi = keyframes.length - 1,
    found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const k = keyframes.at(mid) ?? 0;
    if (k <= t + 1e-3) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? (keyframes.length ? 0 : t) : (keyframes.at(found) ?? t);
}

/** The kept ranges as a cut without re-encoding will produce them: starts move to keyframes. */
export function snapToKeyframes(ranges: readonly Range[], keyframes: readonly number[]): Range[] {
  return ranges.map((r) => ({ start: keyframeAtOrBefore(r.start, keyframes), end: r.end }));
}

/** How far the lossless result differs from what was asked, in seconds (shown before saving). */
export function snapDrift(ranges: readonly Range[], keyframes: readonly number[]): number {
  return ranges.reduce(
    (max, r) => Math.max(max, r.start - keyframeAtOrBefore(r.start, keyframes)),
    0,
  );
}

/** Split points for "a cada N minutos": every `every` seconds, never a last piece under 1 s. */
export function evenSplitPoints(duration: number, every: number): number[] {
  if (!(every > 0) || !(duration > every)) return [];
  const points: number[] = [];
  for (let t = every; t < duration - 1; t += every) points.push(Math.round(t * 1000) / 1000);
  return points;
}

/** The pieces a list of split points makes of [0, duration]. */
export function piecesFromPoints(points: readonly number[], duration: number): Range[] {
  const cuts = [...new Set(points.filter((p) => p > MIN_RANGE && p < duration - MIN_RANGE))].sort(
    (a, b) => a - b,
  );
  const edges = [0, ...cuts, duration];
  const out: Range[] = [];
  for (let i = 0; i + 1 < edges.length; i++)
    out.push({ start: edges.at(i) ?? 0, end: edges.at(i + 1) ?? duration });
  return out;
}

/** "12:04", "1:02:15"; tenths when asked ("12:04,3"). */
export function clock(seconds: number, tenths = false): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const whole = tenths ? Math.floor(safe) : Math.round(safe);
  const h = Math.floor(whole / 3600),
    m = Math.floor((whole % 3600) / 60),
    s = whole % 60;
  const base = h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return tenths ? `${base},${Math.floor((safe - whole) * 10)}` : base;
}
