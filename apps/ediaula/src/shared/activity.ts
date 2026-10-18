import { type CursorData, normalizeCursorData } from "./cursorData.ts";
import { sourceEnd, timelineAt } from "./timeline.ts";
import type { Project } from "./types.ts";

/**
 * What happens on the screen of a recording while nobody speaks: clicks, drags, scrolling,
 * shortcuts, wide pointer movements and the steps and waits of a guided recording. A silent
 * demonstration is still the lesson, so the cleanup never cuts a pause across one, and words
 * said again around one are a demonstration, not a repeat.
 */

export type ActivityKind = "click" | "drag" | "wheel" | "keys" | "move" | "guided";

export interface Activity {
  kind: ActivityKind;
  /** Timeline seconds (sourceActivity: seconds of the video). */
  start: number;
  end: number;
}

/** Before a click the pointer is on its way; after it the screen answers. */
export const CLICK_BEFORE = 0.6;
export const CLICK_AFTER = 0.8;
/** A press that moves the pointer farther than this (pixels) is a drag. */
export const DRAG_PX = 8;
/** Wheel turns and key presses this close together are one burst. */
const BURST_GAP = 0.6;
const BURST_BEFORE = 0.3;
const BURST_AFTER = 0.8;
/** A movement across this share of the frame width in less than WIDE_SECONDS is a gesture. */
export const WIDE_SHARE = 0.15;
export const WIDE_SECONDS = 2;
const MOVE_PAD = 0.3;
/** Moves are looked at this often when finding wide ones. */
const MOVE_STEP = 0.1;

/**
 * guided-run.json beside a guided recording: the steps the guided mode played and the stretches
 * where it held the recording waiting, in seconds of the video.
 */
export interface GuidedRun {
  steps: { start: number; end: number }[];
  holds: [number, number][];
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A span written as [a, b] or as {start, end} (also moveAt and endAt, as a schedule has them). */
function span(raw: unknown): [number, number] | null {
  if (Array.isArray(raw)) return finite(raw[0]) && finite(raw[1]) ? [raw[0], raw[1]] : null;
  if (!raw || typeof raw !== "object") return null;
  const a = Reflect.get(raw, "start") ?? Reflect.get(raw, "moveAt");
  const b = Reflect.get(raw, "end") ?? Reflect.get(raw, "endAt");
  return finite(a) && finite(b) ? [a, b] : null;
}

/** Reads a guided-run.json; whatever is not a span of time is left out. */
export function normalizeGuidedRun(raw: unknown): GuidedRun {
  const list = (key: string): unknown[] => {
    const v = raw && typeof raw === "object" ? Reflect.get(raw, key) : undefined;
    return Array.isArray(v) ? v : [];
  };
  const spans = (key: string): [number, number][] =>
    list(key).flatMap((s) => {
      const r = span(s);
      return r && r[1] > r[0] ? [r] : [];
    });
  return {
    steps: spans("steps").map(([start, end]) => ({ start, end })),
    holds: spans("holds"),
  };
}

/** Groups instants into bursts: [first, last] of each run closer than BURST_GAP. */
function bursts(times: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && t - last[1] <= BURST_GAP) last[1] = t;
    else out.push([t, t]);
  }
  return out;
}

/** Moves outside the stretches where the pointer was over the recorder or not watched. */
function visibleMoves(data: CursorData): CursorData["moves"] {
  const blind = [...data.hidden, ...data.gaps];
  return data.moves.filter(([t]) => !blind.some(([a, b]) => t >= a && t <= b));
}

/** Wide movements: farther than WIDE_SHARE of the width within WIDE_SECONDS. */
function wideMoves(data: CursorData): [number, number][] {
  const moves = visibleMoves(data);
  // One position per MOVE_STEP is enough to see a gesture and keeps long takes cheap.
  const points: [number, number, number][] = [];
  for (const [t, x, y] of moves) {
    const last = points[points.length - 1];
    if (last && t - last[0] < MOVE_STEP) {
      last[1] = x;
      last[2] = y;
    } else points.push([t, x, y]);
  }
  const far = WIDE_SHARE * data.width;
  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    for (let k = i + 1; k < points.length && points[k][0] - points[i][0] <= WIDE_SECONDS; k++) {
      if (Math.hypot(points[k][1] - points[i][1], points[k][2] - points[i][2]) > far) {
        out.push([points[i][0] - MOVE_PAD, points[k][0] + MOVE_PAD]);
        break;
      }
    }
  }
  return out;
}

/** Index of the first move at or after `t` (moves are in time order). */
function firstMove(moves: CursorData["moves"], t: number): number {
  let lo = 0;
  let hi = moves.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (moves[mid][0] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Whether the pointer moved farther than DRAG_PX from (x, y) between t0 and t1. */
function dragged(data: CursorData, t0: number, t1: number, x: number, y: number): boolean {
  for (let i = firstMove(data.moves, t0); i < data.moves.length && data.moves[i][0] <= t1; i++)
    if (Math.hypot(data.moves[i][1] - x, data.moves[i][2] - y) > DRAG_PX) return true;
  return false;
}

/** What happens on screen in one recording, in seconds of its video. */
export function sourceActivity(data: CursorData | null, run?: GuidedRun): Activity[] {
  const out: Activity[] = [];
  for (const s of run?.steps ?? []) out.push({ kind: "guided", start: s.start, end: s.end });
  for (const [a, b] of run?.holds ?? []) out.push({ kind: "guided", start: a, end: b });
  if (!data) return out;
  for (const [t, x, y, , held] of data.clicks) {
    const drag = held > 0 && dragged(data, t, t + held, x, y);
    out.push({
      kind: drag ? "drag" : "click",
      start: t - CLICK_BEFORE,
      end: t + Math.max(0, held) + CLICK_AFTER,
    });
  }
  for (const [a, b] of bursts(data.wheel.map(([t]) => t)))
    out.push({ kind: "wheel", start: a - BURST_BEFORE, end: b + BURST_AFTER });
  for (const [a, b] of bursts(data.keys.map(([t]) => t)))
    out.push({ kind: "keys", start: a - BURST_BEFORE, end: b + BURST_AFTER });
  for (const [a, b] of wideMoves(data)) out.push({ kind: "move", start: a, end: b });
  return out.map((a) => ({ ...a, start: Math.max(0, a.start) }));
}

/** The activity of a cursor file, worked out once per file read (the loaders keep the object). */
const byFile = new WeakMap<object, Activity[]>();
function cursorActivity(raw: unknown): Activity[] {
  const known = raw && typeof raw === "object" ? byFile.get(raw) : undefined;
  if (known) return known;
  const list = sourceActivity(normalizeCursorData(raw));
  if (raw && typeof raw === "object") byFile.set(raw, list);
  return list;
}

/**
 * Screen activity of every recording on the timeline, in timeline seconds and in time order:
 * each clip of a recording shows the activity of its own stretch of the video. `cursors` holds
 * the cursor data of each recording by asset id, in any version the app wrote (v1 or v2;
 * anything else throws, as normalizeCursorData does). `guidedRuns` holds guided-run.json files
 * the same way.
 */
export function activityRanges(
  project: Pick<Project, "clips">,
  cursors: ReadonlyMap<string, unknown>,
  guidedRuns: ReadonlyMap<string, unknown> = new Map(),
): Activity[] {
  const bySource = new Map<string, Activity[]>();
  const ids = new Set([...cursors.keys(), ...guidedRuns.keys()]);
  for (const id of ids) {
    const raw = cursors.get(id);
    if (guidedRuns.has(id)) {
      const data = raw === undefined ? null : normalizeCursorData(raw);
      bySource.set(id, sourceActivity(data, normalizeGuidedRun(guidedRuns.get(id))));
    } else bySource.set(id, cursorActivity(raw));
  }
  const out: Activity[] = [];
  for (const c of project.clips) {
    const list = bySource.get(c.assetId);
    if (!list?.length) continue;
    const from = c.in;
    const to = sourceEnd(c);
    for (const a of list) {
      const s = Math.max(a.start, from);
      const e = Math.min(a.end, to);
      if (e > s) out.push({ kind: a.kind, start: timelineAt(c, s), end: timelineAt(c, e) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
