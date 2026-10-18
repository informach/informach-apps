import { z } from "zod";
import type { CursorData, CursorShapeInfo } from "./cursorData.ts";
import { HOLD_REASONS, type HoldRecord } from "./frameClock.ts";
import { GUIDED_ACTIONS, type GuidedAction, type GuidedViewport } from "./guidedPlan.ts";
import { smoothPointer } from "./guidedRecording.ts";
import { CURSOR_SHAPES, type CursorShape } from "./recording.ts";

/**
 * The pointer of a guided take in the lesson window, which no real cursor drew. While the take
 * runs, main/guidedCapture.ts appends what the runner and the page driver did to
 * guided-log.jsonl, in seconds of the video (the frame count): glides, buttons, wheel, keys,
 * cursor shapes, steps and holds. Finalizing the take (main/recording/finalize.ts, also after a
 * crash) turns it into:
 *
 * - cursor.json (version 2, shared/cursorData.ts) through synthesizeCursor: a move per frame
 *   while the pointer travels, through the click point at the click's own second; clicks with
 *   how long they were held (a drag is a long one with moves in between); the wheel; keys with
 *   the shortcut's label; the shape from the computed CSS cursor under the pointer;
 * - guided-run.json (GuidedRun below), which the editor keeps on the screen asset
 *   (Asset.guidedRun): the steps with their planned and actual seconds, every interaction and
 *   every hold.
 *
 * guided-run.json, version 1, is a stable format: fields are only added, never renamed. All
 * times are seconds of the video; a hold has no length in the video (it is where the writer
 * stopped), its `duration` is wall seconds.
 */

export const GUIDED_LOG_FILE = "guided-log.jsonl";
export const GUIDED_RUN_FILE = "guided-run.json";

export const GUIDED_INTERACTIONS = [
  "click",
  "doubleClick",
  "rightClick",
  "drag",
  "wheel",
  "key",
  "type",
] as const;
export type GuidedInteraction = (typeof GUIDED_INTERACTIONS)[number];

/** One step of a take. */
export interface GuidedRunStep {
  /** Index in the plan. */
  index: number;
  id: string;
  speech: string;
  action: GuidedAction;
  /** As planned: the pointer starts towards the target, the action's moment, the end of the
   *  observation time. */
  start: number;
  act: number;
  end: number;
  /** As it ran: when the step began and finished (absent when it never got there). */
  began?: number;
  finished?: number;
  status: "done" | "failed" | "pending";
  message?: string;
}

/** An interaction of the take: from its first second to its last (a drag, typing, a scroll). */
export interface GuidedRunAction {
  t: number;
  until: number;
  kind: GuidedInteraction;
  /** Index in the plan of the step that did it. */
  step: number;
}

/** guided-run.json */
export interface GuidedRun {
  version: 1;
  planId: string;
  planName: string;
  /** shared/guidedPlan.ts planTiming of the plan this take followed. */
  timing: string;
  fps: number;
  viewport: GuidedViewport;
  /** First step of the plan this take recorded (0, or k after "Continuar da etapa k"). */
  from: number;
  /** Second of the take where narration second 0 sits (negative when the take starts inside it). */
  narrationOffset: number;
  /** Seconds of video. */
  duration: number;
  status: "done" | "failed" | "stopped";
  steps: GuidedRunStep[];
  actions: GuidedRunAction[];
  holds: HoldRecord[];
}

// ---- the log ------------------------------------------------------------------------------

const t = z
  .number()
  .finite()
  .min(0)
  .max(7 * 86400);
const coordinate = z.number().finite().min(-1e6).max(1e6);
const point = z.object({ x: coordinate, y: coordinate });
const button = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const plannedStep = z.object({
  index: z.int().nonnegative(),
  id: z.string().max(200),
  speech: z.string().max(4000),
  action: z.enum(GUIDED_ACTIONS),
  start: t,
  act: t,
  end: t,
});

export const guidedLogLineSchema = z.discriminatedUnion("k", [
  z.object({
    k: z.literal("begin"),
    v: z.literal(1),
    planId: z.string().max(200),
    planName: z.string().max(200),
    timing: z.string().max(64),
    fps: z.number().positive().max(240),
    viewport: z.object({ width: z.int().positive(), height: z.int().positive() }),
    from: z.int().nonnegative(),
    narrationOffset: z.number().finite(),
    steps: z.array(plannedStep).max(300),
  }),
  /** The pointer is placed at a point without travelling. */
  z.object({ k: z.literal("move"), t, x: coordinate, y: coordinate }),
  /** smoothPointer from `from` at `t` to `to` at `until`; `drag` with the left button held. */
  z.object({
    k: z.literal("glide"),
    t,
    until: t,
    from: point,
    to: point,
    drag: z.literal(true).optional(),
  }),
  z.object({ k: z.literal("down"), t, x: coordinate, y: coordinate, b: button }),
  z.object({ k: z.literal("up"), t, x: coordinate, y: coordinate, b: button }),
  /** Wheel in CSS pixels, down and right positive (the page's convention). */
  z.object({
    k: z.literal("wheel"),
    t,
    x: coordinate,
    y: coordinate,
    dx: z.number(),
    dy: z.number(),
  }),
  z.object({ k: z.literal("key"), t, label: z.string().max(60) }),
  /** Computed CSS cursor under the pointer, and whether that element takes typing. */
  z.object({
    k: z.literal("shape"),
    t,
    cursor: z.string().max(200),
    editable: z.boolean().optional(),
  }),
  z.object({
    k: z.literal("step"),
    t,
    index: z.int().nonnegative(),
    status: z.enum(["start", "done", "failed"]),
    message: z.string().max(4000).optional(),
  }),
  z.object({
    k: z.literal("act"),
    t,
    until: t,
    kind: z.enum(GUIDED_INTERACTIONS),
    step: z.int().nonnegative(),
  }),
  z.object({
    k: z.literal("hold"),
    at: t,
    duration: z.number().nonnegative(),
    reason: z.enum(HOLD_REASONS),
    step: z.int().nonnegative().optional(),
  }),
  z.object({ k: z.literal("end"), t, status: z.enum(["done", "failed", "stopped"]) }),
]);
export type GuidedLogLine = z.infer<typeof guidedLogLineSchema>;
export type GuidedLogBegin = Extract<GuidedLogLine, { k: "begin" }>;

/** guided-log.jsonl read back; a line cut off by a crash is left out. */
export function parseGuidedLog(text: string): GuidedLogLine[] {
  const lines: GuidedLogLine[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      continue;
    }
    const parsed = guidedLogLineSchema.safeParse(value);
    if (parsed.success) lines.push(parsed.data);
  }
  return lines;
}

// ---- cursor.json --------------------------------------------------------------------------

/** The editor's shape for a computed CSS cursor (grab and grabbing are drawn as the hand for now). */
export function cursorShapeFor(css: string, editable = false): CursorShape {
  // "url(a.cur), pointer": the keyword after the images.
  const keyword = css.split(",").at(-1)?.trim().toLowerCase() ?? "";
  switch (keyword) {
    case "pointer":
    case "grab":
    case "grabbing":
    case "-webkit-grab":
    case "-webkit-grabbing":
      return "hand";
    case "text":
    case "vertical-text":
      return "text";
    case "wait":
      return "wait";
    case "progress":
      return "busy";
    case "crosshair":
    case "cell":
      return "cross";
    case "move":
    case "all-scroll":
      return "move";
    case "not-allowed":
    case "no-drop":
      return "no";
    case "ew-resize":
    case "col-resize":
    case "e-resize":
    case "w-resize":
      return "ew";
    case "ns-resize":
    case "row-resize":
    case "n-resize":
    case "s-resize":
      return "ns";
    case "nwse-resize":
    case "nw-resize":
    case "se-resize":
      return "nwse";
    case "nesw-resize":
    case "ne-resize":
    case "sw-resize":
      return "nesw";
    case "none":
      return "hidden";
    case "auto":
      return editable ? "text" : "arrow";
    default:
      return "arrow";
  }
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
/** Seconds between two typing moments in cursor.json. */
const TYPING_EVERY = 0.5;
const px = (v: number): number => Math.round(v);
const EPS = 1e-6;

type Segment =
  | {
      kind: "glide";
      t: number;
      until: number;
      from: { x: number; y: number };
      to: { x: number; y: number };
    }
  | { kind: "move"; t: number; x: number; y: number };

/** Walks the pointer frame by frame: the last placement, or the glide under way. */
function pointerWalk(segments: readonly Segment[], start: { x: number; y: number }) {
  let next = 0;
  let rest = start;
  let active: Extract<Segment, { kind: "glide" }> | null = null;
  return (at: number): { x: number; y: number } => {
    while (next < segments.length && segments[next].t <= at + EPS) {
      const s = segments[next++];
      if (s.kind === "move") {
        rest = { x: s.x, y: s.y };
        active = null;
      } else active = s;
    }
    if (!active) return rest;
    if (at >= active.until - EPS) {
      rest = active.to;
      active = null;
      return rest;
    }
    const k = smoothPointer((at - active.t) / Math.max(EPS, active.until - active.t));
    return {
      x: active.from.x + (active.to.x - active.from.x) * k,
      y: active.from.y + (active.to.y - active.from.y) * k,
    };
  };
}

/**
 * cursor.json of a guided take of `duration` seconds at `fps`, in pixels of the viewport (CSS
 * pixels of the page captured at device scale 1). A move goes out on every frame where the
 * pointer or its shape changed, so it passes through each click point at the click's second.
 */
export function synthesizeCursor(
  log: readonly GuidedLogLine[],
  viewport: GuidedViewport,
  fps: number,
  duration: number,
): CursorData {
  const shapes: CursorShapeInfo[] = CURSOR_SHAPES.map((name) => ({
    id: name,
    std: name,
    w: 0,
    h: 0,
    hotX: 0,
    hotY: 0,
  }));
  const data: CursorData = {
    version: 2,
    width: viewport.width,
    height: viewport.height,
    shapes,
    moves: [],
    clicks: [],
    wheel: [],
    markers: [],
    keys: [],
    typing: [],
    pauses: [],
    hidden: [],
    gaps: [],
  };
  const segments: Segment[] = [];
  const shapeChanges: { t: number; shape: number }[] = [];
  const downs = new Map<number, [number, number, number, number, number]>();
  for (const line of log) {
    switch (line.k) {
      case "move":
        segments.push({ kind: "move", t: line.t, x: line.x, y: line.y });
        break;
      case "glide":
        segments.push({
          kind: "glide",
          t: line.t,
          until: line.until,
          from: line.from,
          to: line.to,
        });
        break;
      case "shape":
        shapeChanges.push({
          t: line.t,
          shape: CURSOR_SHAPES.indexOf(cursorShapeFor(line.cursor, line.editable)),
        });
        break;
      case "down": {
        const click: [number, number, number, number, number] = [
          round(line.t),
          px(line.x),
          px(line.y),
          line.b,
          0,
        ];
        data.clicks.push(click);
        downs.set(line.b, click);
        break;
      }
      case "up": {
        const down = downs.get(line.b);
        if (down) down[4] = round(Math.max(0, line.t - down[0]));
        downs.delete(line.b);
        break;
      }
      case "wheel":
        if (line.dy)
          data.wheel.push([
            round(line.t),
            px(line.x),
            px(line.y),
            Math.max(-32768, Math.min(32767, Math.round(-line.dy * 1.2))),
          ]);
        break;
      case "key":
        data.keys.push([round(line.t), line.label]);
        break;
      case "act":
        // Typing shows as moments, at most one every half second, never which keys (as the
        // helper's "ty" does).
        if (line.kind === "type")
          for (let t = line.t; t <= line.until + 1e-9; t += TYPING_EVERY)
            data.typing.push(round(t));
        break;
      default:
        break;
    }
  }
  segments.sort((a, b) => a.t - b.t);
  shapeChanges.sort((a, b) => a.t - b.t);
  const first = segments[0];
  const start = first
    ? first.kind === "move"
      ? { x: first.x, y: first.y }
      : first.from
    : { x: viewport.width / 2, y: viewport.height / 2 };
  const frames = Math.max(1, Math.floor(duration * fps + EPS) + 1);
  let last: [number, number, number] | null = null;
  let shapeIndex = 0;
  let nextShape = 0;
  const pointer = pointerWalk(segments, start);
  for (let i = 0; i < frames; i++) {
    const at = i / fps;
    while (nextShape < shapeChanges.length && shapeChanges[nextShape].t <= at + EPS) {
      shapeIndex = shapeChanges[nextShape].shape;
      nextShape++;
    }
    const p = pointer(at);
    const row: [number, number, number] = [px(p.x), px(p.y), shapeIndex];
    if (!last || row[0] !== last[0] || row[1] !== last[1] || row[2] !== last[2]) {
      data.moves.push([round(at), row[0], row[1], row[2]]);
      last = row;
    }
  }
  // A click between frames (never on the web clock, but a log may say so) still gets its point.
  for (const c of data.clicks) {
    const at = data.moves.findIndex((m) => m[0] >= c[0] - EPS);
    const here = at >= 0 ? data.moves[at] : undefined;
    if (here && Math.abs(here[0] - c[0]) < EPS && here[1] === c[1] && here[2] === c[2]) continue;
    const before = at < 0 ? data.moves.at(-1) : data.moves[at - 1];
    const move: [number, number, number, number] = [c[0], c[1], c[2], before?.[3] ?? shapeIndex];
    if (here && Math.abs(here[0] - c[0]) < EPS) data.moves[at] = move;
    else data.moves.splice(at < 0 ? data.moves.length : at, 0, move);
  }
  return data;
}

// ---- guided-run.json ----------------------------------------------------------------------

/** guided-run.json of a take from its log and its length in seconds of video. */
export function buildGuidedRun(log: readonly GuidedLogLine[], duration: number): GuidedRun | null {
  const begin = log.find((l): l is GuidedLogBegin => l.k === "begin");
  if (!begin) return null;
  const steps: GuidedRunStep[] = begin.steps.map((s) => ({ ...s, status: "pending" as const }));
  const byIndex = new Map(steps.map((s) => [s.index, s]));
  const actions: GuidedRunAction[] = [];
  const holds: HoldRecord[] = [];
  let status: GuidedRun["status"] = "stopped";
  for (const line of log) {
    if (line.k === "step") {
      const step = byIndex.get(line.index);
      if (!step) continue;
      if (line.status === "start") step.began = round(line.t);
      else {
        step.finished = round(line.t);
        step.status = line.status === "done" ? "done" : "failed";
        if (line.message) step.message = line.message;
      }
    } else if (line.k === "act")
      actions.push({
        t: round(line.t),
        until: round(line.until),
        kind: line.kind,
        step: line.step,
      });
    else if (line.k === "hold")
      holds.push({
        at: round(line.at),
        duration: line.duration,
        reason: line.reason,
        ...(line.step !== undefined ? { step: line.step } : {}),
      });
    else if (line.k === "end") status = line.status;
  }
  return {
    version: 1,
    planId: begin.planId,
    planName: begin.planName,
    timing: begin.timing,
    fps: begin.fps,
    viewport: begin.viewport,
    from: begin.from,
    narrationOffset: begin.narrationOffset,
    duration: round(duration),
    status,
    steps,
    actions,
    holds,
  };
}

const runStep = z.looseObject({
  index: z.int().nonnegative(),
  id: z.string(),
  speech: z.string(),
  action: z.enum(GUIDED_ACTIONS),
  start: z.number(),
  act: z.number(),
  end: z.number(),
  began: z.number().optional(),
  finished: z.number().optional(),
  status: z.enum(["done", "failed", "pending"]),
  message: z.string().optional(),
});
export const guidedRunSchema = z.looseObject({
  version: z.literal(1),
  planId: z.string(),
  planName: z.string(),
  timing: z.string(),
  fps: z.number().positive(),
  viewport: z.object({ width: z.number().positive(), height: z.number().positive() }),
  from: z.int().nonnegative(),
  narrationOffset: z.number(),
  duration: z.number().nonnegative(),
  status: z.enum(["done", "failed", "stopped"]),
  steps: z.array(runStep),
  actions: z.array(
    z.looseObject({
      t: z.number(),
      until: z.number(),
      kind: z.enum(GUIDED_INTERACTIONS),
      step: z.int().nonnegative(),
    }),
  ),
  holds: z.array(
    z.looseObject({
      at: z.number(),
      duration: z.number(),
      reason: z.enum(HOLD_REASONS),
      step: z.int().nonnegative().optional(),
    }),
  ),
}) satisfies z.ZodType<GuidedRun>;

/** guided-run.json as written by any version of the app; throws when it is not one. */
export function normalizeGuidedRun(raw: unknown): GuidedRun {
  const parsed = guidedRunSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Esse arquivo não descreve uma gravação guiada do EdiAula.");
  return parsed.data;
}
