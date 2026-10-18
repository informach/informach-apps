import { sumExpr } from "./exprSum.ts";
import type { Clip } from "./types.ts";

/**
 * Volume envelope of a clip (clip.gain): points in dB at moments of the clip (seconds from its
 * start, like the movement keyframes), joined by straight lines in dB, flat before the first and
 * after the last. The export multiplies the clip's sound by it (volume='…':eval=frame) and the
 * preview by a WebAudio gain node, both from gainAt / gainExpr, so they sound the same.
 */

export interface GainPoint {
  /** Seconds from the clip's start (a piece keeps the points before it, like keyframes). */
  t: number;
  db: number;
}

export const GAIN_MIN_DB = -60;
export const GAIN_MAX_DB = 12;
export const GAIN_LIMIT = 2000;

const clampDb = (db: number): number => Math.min(GAIN_MAX_DB, Math.max(GAIN_MIN_DB, db));
export const dbToGain = (db: number): number => (db <= GAIN_MIN_DB ? 0 : 10 ** (db / 20));

const sorted = (points: readonly GainPoint[]): GainPoint[] => [...points].sort((a, b) => a.t - b.t);

/** dB of the envelope `local` seconds into the clip (0 without points). */
export function gainDbAt(points: readonly GainPoint[] | undefined, local: number): number {
  if (!points?.length) return 0;
  const list = sorted(points);
  if (local <= list[0].t) return clampDb(list[0].db);
  for (let i = 1; i < list.length; i++) {
    const b = list[i];
    if (local <= b.t) {
      const a = list[i - 1];
      const span = b.t - a.t;
      return clampDb(span <= 0 ? b.db : a.db + ((b.db - a.db) * (local - a.t)) / span);
    }
  }
  return clampDb(list[list.length - 1].db);
}

/** Linear factor of the envelope `local` seconds into the clip. */
export const gainAt = (points: readonly GainPoint[] | undefined, local: number): number =>
  dbToGain(gainDbAt(points, local));

const n = (v: number): string => (Math.round(v * 1e6) / 1e6).toString();

/**
 * The same envelope as an FFmpeg expression of `x` (clip seconds, e.g. "(t+1.5)"): the linear
 * factor, for volume='…':eval=frame. "1" without points. The dB line is a sum of ramps (the
 * first point's dB, plus each segment's slope over the part of it already played), so the
 * expression grows flat with the points: FFmpeg refuses deeply nested ones.
 */
export function gainExpr(points: readonly GainPoint[] | undefined, x: string): string {
  if (!points?.length) return "1";
  const list = sorted(points).map((p) => ({ t: p.t, db: clampDb(p.db) }));
  const terms = [n(list[0].db)];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1];
    const b = list[i];
    const rise = b.db - a.db;
    if (Math.abs(rise) < 1e-9) continue;
    const span = b.t - a.t;
    // Two points at the same moment: a step, taken right after it (as gainDbAt does).
    terms.push(
      span <= 0
        ? `${n(rise)}*gt(${x},${n(b.t)})`
        : `${n(rise / span)}*(clip(${x},${n(a.t)},${n(b.t)})-${n(a.t)})`,
    );
  }
  const db = sumExpr(terms);
  if (terms.length === 1) return n(dbToGain(list[0].db));
  return `if(lte(${db},${GAIN_MIN_DB}),0,pow(10,(${db})/20))`;
}

/**
 * The points that shape the envelope between `from` and `to` (clip seconds): those inside and
 * the nearest one on each side, so a piece of a long clip gets a short expression with the same
 * curve over its stretch.
 */
export function gainSlice(points: readonly GainPoint[], from: number, to: number): GainPoint[] {
  const list = sorted(points);
  const first = list.findIndex((p) => p.t >= from);
  const lo = first < 0 ? list.length - 1 : Math.max(0, first - 1);
  let hi = list.findIndex((p) => p.t > to);
  hi = hi < 0 ? list.length - 1 : hi;
  return list.slice(lo, hi + 1);
}

/** The envelope of a piece of `c` that starts `shift` seconds into it (pieces.ts, speed). */
export const shiftGain = (points: readonly GainPoint[], shift: number): GainPoint[] =>
  points.map((p) => ({ ...p, t: p.t - shift }));

/** A clip's gain points stretched by `k` (a new speed changes its length, keyframes alike). */
export const scaleGain = (c: Pick<Clip, "gain">, k: number): GainPoint[] | undefined =>
  c.gain?.map((p) => ({ ...p, t: p.t * k }));

/** A point added (or replaced within 40 ms) at `t` of the clip. */
export function upsertGain(
  points: readonly GainPoint[] | undefined,
  t: number,
  db: number,
): GainPoint[] {
  const rest = (points ?? []).filter((p) => Math.abs(p.t - t) > 0.04);
  return sorted([...rest, { t, db: clampDb(db) }]).slice(0, GAIN_LIMIT);
}
