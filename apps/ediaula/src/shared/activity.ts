import { type CursorData, normalizeCursorData } from "./cursorData.ts";
import { sourceEnd, timelineAt } from "./timeline.ts";
import type { Asset, Project } from "./types.ts";

/**
 * What happens on the screen of a recording while nobody speaks: the picture itself changing
 * (an animation, a page loading, a game playing), clicks, drags, scrolling, shortcuts, typing,
 * any movement of the pointer, and the steps and waits of a guided recording. A silent
 * demonstration is still the lesson: the cleanup only cuts a pause where the screen is frozen and
 * nobody speaks, and words said again around activity are a demonstration, not a repeat.
 */

export type ActivityKind =
  | "screen"
  | "click"
  | "drag"
  | "wheel"
  | "keys"
  | "typing"
  | "move"
  | "guided";

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
/** Wheel turns, key presses, typing and pointer moves this close together are one burst. */
const BURST_GAP = 0.6;
const BURST_BEFORE = 0.3;
const BURST_AFTER = 0.8;
/** A burst of pointer moves shorter than this path (pixels) is a bump of the mouse, not a gesture. */
const MOVE_MIN_PX = 3;
/** Around a stretch where the picture changes, this much counts too (seconds). */
const SCREEN_PAD = 0.3;

/**
 * Where the picture of a video does not change (freezedetect over the video, main/ffmpeg.ts
 * screenMotion), in seconds of the video. The rest of it moves.
 */
export interface ScreenMotion {
  frozen: [number, number][];
}

/**
 * guided-run.json beside a guided recording (shared/guidedCursor.ts, version 1): the steps the
 * guided mode played and the stretches around where it held the recording waiting, in seconds of
 * the video.
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

const spans = (value: unknown): [number, number][] =>
  (Array.isArray(value) ? value : []).flatMap((s) => {
    const r = span(s);
    return r && r[1] > r[0] ? [r] : [];
  });

/**
 * A hold has no length in the video (the writer stopped while the page went on): the picture
 * jumps there. This much on each side of it is kept.
 */
export const HOLD_PAD = 0.5;

/**
 * Reads a guided-run.json (version 1 of shared/guidedCursor.ts, or the plain spans of earlier
 * files); whatever is not a span of time is left out. A step counts from where the pointer set
 * off to where its observation time ended, or as far as it really went; a step the take never
 * reached is not in the video. Every interaction is kept with the margins of a click, and a hold
 * (`at`, wall `duration`) with HOLD_PAD around the second it happened.
 */
export function normalizeGuidedRun(raw: unknown): GuidedRun {
  const field = (key: string): unknown =>
    raw && typeof raw === "object" ? Reflect.get(raw, key) : undefined;
  const list = (key: string): unknown[] => {
    const value = field(key);
    return Array.isArray(value) ? value : [];
  };
  const steps = list("steps").flatMap((s) => {
    if (s && typeof s === "object" && Reflect.get(s, "status") === "pending") return [];
    const r = span(s);
    if (!r) return [];
    const began = s && typeof s === "object" ? Reflect.get(s, "began") : undefined;
    const finished = s && typeof s === "object" ? Reflect.get(s, "finished") : undefined;
    const start = finite(began) ? Math.min(r[0], began) : r[0];
    const end = finite(finished) ? Math.max(r[1], finished) : r[1];
    return end > start ? [{ start, end }] : [];
  });
  for (const a of list("actions")) {
    const t = a && typeof a === "object" ? Reflect.get(a, "t") : undefined;
    const until = a && typeof a === "object" ? Reflect.get(a, "until") : undefined;
    if (finite(t) && finite(until) && until >= t)
      steps.push({ start: t - CLICK_BEFORE, end: until + CLICK_AFTER });
  }
  const holds = list("holds").flatMap((h): [number, number][] => {
    const r = span(h);
    if (r) return r[1] > r[0] ? [r] : [];
    const at = h && typeof h === "object" ? Reflect.get(h, "at") : undefined;
    return finite(at) ? [[Math.max(0, at - HOLD_PAD), at + HOLD_PAD]] : [];
  });
  return { steps, holds };
}

/** Reads a motion analysis file ({version: 1, frozen: [[a, b], …]}). */
export function normalizeScreenMotion(raw: unknown): ScreenMotion {
  const frozen = raw && typeof raw === "object" ? Reflect.get(raw, "frozen") : undefined;
  return { frozen: spans(frozen).sort((a, b) => a[0] - b[0]) };
}

/**
 * The screen recordings on the timeline: videos the recorder made (their screen part) or that
 * came with cursor data. Their pauses are only cut where the picture stands still.
 */
export function screenRecordings(project: Pick<Project, "assets" | "clips">): Asset[] {
  const used = new Set(project.clips.map((c) => c.assetId));
  return project.assets.filter(
    (a) =>
      used.has(a.id) &&
      a.kind === "video" &&
      !a.generated &&
      (a.recording?.role === "screen" || !!a.cursor),
  );
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

/**
 * Every stretch where the pointer moves, slowly or fast: a teacher pointing at something is
 * showing it. Moves over the recorder or where the helper was not watching are left out.
 */
function pointerMoves(data: CursorData): [number, number][] {
  // The pen of the drawing mode moves on the recorder window, not on the lesson.
  const blind = [...data.hidden, ...data.gaps, ...(data.drawing ?? [])];
  const out: [number, number][] = [];
  let run: { from: number; to: number; path: number; x: number; y: number } | null = null;
  const flush = (): void => {
    if (run && run.path >= MOVE_MIN_PX) out.push([run.from - BURST_BEFORE, run.to + BURST_AFTER]);
    run = null;
  };
  for (const [t, x, y] of data.moves) {
    if (blind.some(([a, b]) => t >= a && t <= b)) {
      flush();
      continue;
    }
    if (run && t - run.to <= BURST_GAP) {
      run.path += Math.hypot(x - run.x, y - run.y);
      run.to = t;
      run.x = x;
      run.y = y;
    } else {
      flush();
      run = { from: t, to: t, path: 0, x, y };
    }
  }
  flush();
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

/** What the pointer, the keyboard and a guided run did in one recording, in seconds of its video. */
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
  for (const [a, b] of bursts(data.typing))
    out.push({ kind: "typing", start: a - BURST_BEFORE, end: b + BURST_AFTER });
  for (const [a, b] of pointerMoves(data)) out.push({ kind: "move", start: a, end: b });
  return out.map((a) => ({ ...a, start: Math.max(0, a.start) }));
}

/**
 * Where the picture of a video changes, in its seconds: all of it until it was analyzed (null),
 * then everything outside the frozen stretches.
 */
export function screenActivity(motion: ScreenMotion | null, duration: number): Activity[] {
  if (!motion) return [{ kind: "screen", start: 0, end: duration }];
  const out: Activity[] = [];
  let at = 0;
  for (const [a, b] of motion.frozen) {
    if (a > at)
      out.push({ kind: "screen", start: Math.max(0, at - SCREEN_PAD), end: a + SCREEN_PAD });
    at = Math.max(at, b);
  }
  if (duration > at)
    out.push({ kind: "screen", start: Math.max(0, at - SCREEN_PAD), end: duration });
  return out;
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
 * the same way. `screens` lists the screen recordings with their motion analysis: null while it
 * is not done, and then all of that video counts as activity.
 */
export function activityRanges(
  project: Pick<Project, "clips" | "assets">,
  cursors: ReadonlyMap<string, unknown>,
  guidedRuns: ReadonlyMap<string, unknown> = new Map(),
  screens: ReadonlyMap<string, ScreenMotion | null> = new Map(),
): Activity[] {
  const bySource = new Map<string, Activity[]>();
  const ids = new Set([...cursors.keys(), ...guidedRuns.keys(), ...screens.keys()]);
  const duration = new Map(project.assets.map((a) => [a.id, a.duration]));
  for (const id of ids) {
    const raw = cursors.get(id);
    const list = guidedRuns.has(id)
      ? sourceActivity(
          raw === undefined ? null : normalizeCursorData(raw),
          normalizeGuidedRun(guidedRuns.get(id)),
        )
      : raw === undefined
        ? []
        : cursorActivity(raw);
    const screen = screens.has(id)
      ? screenActivity(screens.get(id) ?? null, duration.get(id) ?? Number.MAX_SAFE_INTEGER)
      : [];
    bySource.set(id, [...list, ...screen]);
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
