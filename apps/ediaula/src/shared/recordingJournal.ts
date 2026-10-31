import { z } from "zod";
import { type CaptureSegment, toVideoTime } from "./cursorCapture.ts";
import {
  BOARD_COLORS,
  BOARD_KINDS,
  DRAWING_TOOLS,
  type Drawing,
  type DrawingBoard,
  type DrawingTool,
  limitDrawing,
  MAX_STROKE_POINTS,
} from "./drawing.ts";
import { CAPTURE_SOURCES, RECORD_MODES } from "./recording.ts";

/**
 * sessao.jsonl: what the main process knows about a take, one JSON object per line, written as
 * it happens (main/recording/journal.ts). After a crash it says which files belong to the take,
 * where each one starts on the shared clock and which stretches were paused, so the folder can be
 * finalized like a take that was stopped. Times `qpc` are QueryPerformanceCounter milliseconds,
 * the clock of the cursor helper and of process.hrtime.
 */

export const JOURNAL_FILE = "sessao.jsonl";
export const RESULT_FILE = "gravacao.json";

const qpc = z.number().nonnegative();
const source = z.enum(CAPTURE_SOURCES);
/** Sources with files of their own. */
export const MEDIA_SOURCES = ["screen", "mic", "camera", "system"] as const;
export type MediaSource = (typeof MEDIA_SOURCES)[number];
const media = z.enum(MEDIA_SOURCES);
const rect = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
/** A file of this folder: a plain name, never a path. */
const fileName = z.string().regex(/^[\w.-]{1,80}$/);

const beginLine = z.object({
  k: z.literal("begin"),
  v: z.literal(1),
  /** Date.now() when the take was prepared. */
  at: z.number(),
  qpc,
  fps: z.number().positive(),
  /** Physical pixels of the virtual desktop; absent without the screen. */
  monitor: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .nullable(),
  region: rect.nullable(),
  encoder: z.string().nullable(),
  sources: z.object({
    screen: z.boolean(),
    microphone: z.string().nullable(),
    camera: z.string().nullable(),
    system: z.boolean(),
    keys: z.boolean(),
  }),
  /** Absent in a screen take (and in journals written before the voice modes). */
  mode: z.enum(RECORD_MODES).optional(),
  over: z
    .object({
      from: z.number().nonnegative(),
      to: z.number().nonnegative().optional(),
      replace: z.boolean().optional(),
    })
    .optional(),
});
export type JournalBegin = z.infer<typeof beginLine>;

export const journalLineSchema = z.discriminatedUnion("k", [
  beginLine,
  /** A part's first sample, already moved back by the input's known latency. */
  z.object({ k: z.literal("first"), src: media, part: z.int().nonnegative(), qpc, file: fileName }),
  /** A part ended on its own clock (the computer's sound reports it; others end with the file). */
  z.object({ k: z.literal("end"), src: media, part: z.int().nonnegative(), qpc }),
  z.object({ k: z.literal("pause"), qpc }),
  z.object({ k: z.literal("resume"), qpc }),
  z.object({ k: z.literal("marker"), qpc, kind: z.enum(["marker", "retake"]) }),
  /** A note for whoever edits the lesson, at the moment it was opened ("Recado"). */
  z.object({ k: z.literal("note"), qpc, text: z.string().min(1).max(200) }),
  z.object({ k: z.literal("fail"), src: source, qpc, message: z.string().max(4000) }),
  z.object({ k: z.literal("health"), qpc, note: z.string().max(4000) }),
  z.object({
    k: z.literal("uiRects"),
    qpc,
    rects: z.array(z.object({ x: z.int(), y: z.int(), w: z.int(), h: z.int() })).max(32),
  }),
  /** The teleprompter moved to this line. */
  z.object({ k: z.literal("line"), qpc, index: z.int().nonnegative() }),
  /**
   * "Tela sobre a narração": at `qpc` the teacher heard the lesson's voice at timeline second
   * `at` (the output latency already taken off). Written when it starts and at every resume.
   */
  z.object({ k: z.literal("over"), qpc, at: z.number().nonnegative() }),
  /**
   * "Trecho acelerado": the voice held at timeline second `at` while the screen goes on (start),
   * and where it goes on from (end).
   */
  z.object({
    k: z.literal("lapse"),
    qpc,
    edge: z.enum(["start", "end"]),
    at: z.number().nonnegative(),
  }),
  /**
   * The guided recording's narration (copied into the folder), where it starts in seconds of
   * the recorder's clock, and the first-frame estimate that clock counted from then.
   */
  z.object({
    k: z.literal("narration"),
    file: fileName,
    offset: z.number(),
    origin: qpc.optional(),
    /** The narration is the voice taken from a video (the presenter's render). */
    video: z.literal(true).optional(),
  }),
  /**
   * A stroke drawn on the screen (shared/drawing.ts), written when the pen lifts: when it started,
   * its color, thickness (pixels of a 1080-pixel frame) and points [x, y, ms after `qpc`], x and y
   * as fractions of the recorded region.
   */
  z.object({
    k: z.literal("draw"),
    qpc,
    color: z.string().regex(/^#[\da-f]{6}$/i),
    width: z.number().positive().max(200),
    points: z
      .array(z.tuple([z.number().min(-1).max(2), z.number().min(-1).max(2), z.number().min(0)]))
      .min(1)
      .max(MAX_STROKE_POINTS),
    /** Absent: the pen. */
    tool: z.enum(DRAWING_TOOLS).optional(),
  }),
  /** "Apagar tudo": the strokes drawn so far are gone from here on. */
  z.object({ k: z.literal("drawClear"), qpc }),
  /** A board put over the recorded region (`on`, of a kind) or taken away. */
  z.object({ k: z.literal("drawBoard"), qpc, on: z.boolean(), kind: z.enum(BOARD_KINDS) }),
  /** "Página nova": the board stays, the strokes on it are gone. */
  z.object({ k: z.literal("drawPage"), qpc }),
  /** Ctrl+Z while drawing: the last stroke still on screen is taken back. */
  z.object({ k: z.literal("drawUndo"), qpc }),
  /** The drawing mode turned on or off: clicks while it is on are the pen, not the lesson. */
  z.object({ k: z.literal("drawMode"), qpc, on: z.boolean() }),
  z.object({ k: z.literal("stop"), qpc }),
  z.object({ k: z.literal("finalized"), qpc }),
  /** The editor placed the take in a project (Date.now()); until then it is offered again. */
  z.object({ k: z.literal("imported"), at: z.number() }),
]);
export type JournalLine = z.infer<typeof journalLineSchema>;

/** Sources whose failure pauses the take: without them there is nothing worth recording. */
export const ESSENTIAL_SOURCES: readonly string[] = ["screen", "mic"];

export interface JournalPart {
  part: number;
  /** First sample, QPC milliseconds. */
  qpc: number;
  file: string;
  /** Where it ended on its own clock, when that was reported. */
  end?: number;
}

export interface JournalReplay {
  begin: JournalBegin | null;
  parts: Record<MediaSource, JournalPart[]>;
  /** QPC ranges cut from the take: pauses, failures until the take went on, and everything
   *  after the stop. An open range ends at Infinity. */
  pauses: [number, number][];
  markers: { qpc: number; kind: "marker" | "retake" }[];
  notes: { qpc: number; text: string }[];
  failures: { src: string; qpc: number; message: string }[];
  lines: { qpc: number; index: number }[];
  over: { qpc: number; at: number }[];
  /** Time-lapses over the narration: QPC and voice second at each edge (no end: cut short). */
  lapses: { from: number; at: number; to?: number; end?: number }[];
  narration: { file: string; offset: number; origin?: number; video?: true } | null;
  /** Strokes drawn on the screen, "apagar tudo" moments and the stretches the pen was out. */
  strokes: {
    qpc: number;
    color: string;
    width: number;
    points: [number, number, number][];
    tool?: DrawingTool;
  }[];
  clears: number[];
  /** Boards put up (QPC, an open one ends at Infinity), new pages and undos. */
  boards: { from: number; to: number; kind: (typeof BOARD_KINDS)[number] }[];
  pages: number[];
  undos: number[];
  drawModes: [number, number][];
  stop: number | null;
  finalized: boolean;
  imported: boolean;
  /** Latest time any line mentions. */
  lastQpc: number;
  /** Lines that were not valid, such as a last line cut off by a crash. */
  skipped: number;
}

/** Reads sessao.jsonl back, tolerating a truncated last line and a take that never resumed. */
export function replayJournal(text: string): JournalReplay {
  const replay: JournalReplay = {
    begin: null,
    parts: { screen: [], mic: [], camera: [], system: [] },
    pauses: [],
    markers: [],
    notes: [],
    failures: [],
    lines: [],
    over: [],
    lapses: [],
    narration: null,
    strokes: [],
    clears: [],
    boards: [],
    pages: [],
    undos: [],
    drawModes: [],
    stop: null,
    finalized: false,
    imported: false,
    lastQpc: 0,
    skipped: 0,
  };
  let pausedAt: number | null = null;
  let drawingFrom: number | null = null;
  let boardFrom: { qpc: number; kind: (typeof BOARD_KINDS)[number] } | null = null;
  const pause = (at: number): void => {
    if (pausedAt === null) pausedAt = at;
  };
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      replay.skipped++;
      continue;
    }
    const parsed = journalLineSchema.safeParse(value);
    if (!parsed.success) {
      replay.skipped++;
      continue;
    }
    const line = parsed.data;
    if ("qpc" in line) replay.lastQpc = Math.max(replay.lastQpc, line.qpc);
    switch (line.k) {
      case "begin":
        replay.begin = line;
        break;
      case "first": {
        // The estimate only gets earlier as FFmpeg reports more; the earliest one holds.
        const known = replay.parts[line.src].find((p) => p.part === line.part);
        if (known) known.qpc = Math.min(known.qpc, line.qpc);
        else replay.parts[line.src].push({ part: line.part, qpc: line.qpc, file: line.file });
        break;
      }
      case "end": {
        const part = replay.parts[line.src].find((p) => p.part === line.part);
        if (part) part.end = line.qpc;
        break;
      }
      case "pause":
        pause(line.qpc);
        break;
      case "resume":
        if (pausedAt !== null && replay.stop === null) {
          if (line.qpc > pausedAt) replay.pauses.push([pausedAt, line.qpc]);
          pausedAt = null;
        }
        break;
      case "marker":
        replay.markers.push({ qpc: line.qpc, kind: line.kind });
        break;
      case "note":
        replay.notes.push({ qpc: line.qpc, text: line.text });
        break;
      case "fail":
        replay.failures.push({ src: line.src, qpc: line.qpc, message: line.message });
        // The process was writing nothing from here: as good as a pause until it resumes.
        if (ESSENTIAL_SOURCES.includes(line.src)) pause(line.qpc);
        break;
      case "line":
        replay.lines.push({ qpc: line.qpc, index: line.index });
        break;
      case "lapse":
        if (line.edge === "start") replay.lapses.push({ from: line.qpc, at: line.at });
        else {
          const open = replay.lapses.at(-1);
          if (open && open.to === undefined && line.qpc >= open.from) {
            open.to = line.qpc;
            open.end = line.at;
          }
        }
        break;
      case "over":
        replay.over.push({ qpc: line.qpc, at: line.at });
        break;
      case "narration":
        replay.narration = {
          file: line.file,
          offset: line.offset,
          ...(line.origin !== undefined ? { origin: line.origin } : {}),
          ...(line.video ? { video: true as const } : {}),
        };
        break;
      case "draw":
        replay.strokes.push({
          qpc: line.qpc,
          color: line.color,
          width: line.width,
          points: line.points,
          ...(line.tool ? { tool: line.tool } : {}),
        });
        break;
      case "drawClear":
        replay.clears.push(line.qpc);
        break;
      case "drawBoard":
        // A board of another kind closes the one up and opens its own.
        if (boardFrom)
          replay.boards.push({ from: boardFrom.qpc, to: line.qpc, kind: boardFrom.kind });
        boardFrom = line.on ? { qpc: line.qpc, kind: line.kind } : null;
        break;
      case "drawPage":
        replay.pages.push(line.qpc);
        break;
      case "drawUndo":
        replay.undos.push(line.qpc);
        break;
      case "drawMode":
        if (line.on) drawingFrom ??= line.qpc;
        else if (drawingFrom !== null) {
          replay.drawModes.push([drawingFrom, line.qpc]);
          drawingFrom = null;
        }
        break;
      case "stop":
        replay.stop ??= line.qpc;
        // What the processes wrote while they were closing is not part of the take.
        pause(line.qpc);
        break;
      case "finalized":
        replay.finalized = true;
        break;
      case "imported":
        replay.imported = true;
        break;
      default:
        break;
    }
  }
  if (pausedAt !== null) replay.pauses.push([pausedAt, Number.POSITIVE_INFINITY]);
  if (drawingFrom !== null) replay.drawModes.push([drawingFrom, Number.POSITIVE_INFINITY]);
  if (boardFrom)
    replay.boards.push({ from: boardFrom.qpc, to: Number.POSITIVE_INFINITY, kind: boardFrom.kind });
  for (const list of Object.values(replay.parts)) list.sort((a, b) => a.part - b.part);
  return replay;
}

/**
 * Which source sets the take's clock: the screen when it was recorded, else the microphone.
 * Its parts are laid end to end; every other source is placed on them.
 */
export function referenceSource(replay: JournalReplay): "screen" | "mic" | null {
  if (replay.parts.screen.length) return "screen";
  if (replay.parts.mic.length) return "mic";
  return null;
}

/** The take's clock: each reference part, its first sample and its length in seconds. */
export function takeSegments(
  parts: readonly JournalPart[],
  durations: ReadonlyMap<string, number>,
): CaptureSegment[] {
  return parts.flatMap((p) => {
    const duration = durations.get(p.file) ?? 0;
    return duration > 0 ? [{ start: p.qpc, duration }] : [];
  });
}

/** Seconds of the take where each segment starts. */
export function segmentOffsets(segments: readonly CaptureSegment[]): number[] {
  let at = 0;
  return segments.map((g) => {
    const start = at;
    at += g.duration;
    return start;
  });
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * QPC ranges (pauses, gaps of the cursor helper) in seconds of the take: each range keeps the
 * part of it each segment recorded, merged where they touch.
 */
export function rangesInTake(
  ranges: readonly [number, number][],
  segments: readonly CaptureSegment[],
): [number, number][] {
  const offsets = segmentOffsets(segments);
  const out: [number, number][] = [];
  for (const [a, b] of ranges)
    segments.forEach((g, i) => {
      const end = g.start + g.duration * 1000;
      const from = Math.max(a, g.start);
      const to = Math.min(b, end);
      if (to - from < 1) return;
      out.push([
        round(offsets[i] + (from - g.start) / 1000),
        round(offsets[i] + (to - g.start) / 1000),
      ]);
    });
  out.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 0.001) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** A moment in seconds of the take; one that fell between segments goes to where the next starts. */
export function momentInTake(segments: readonly CaptureSegment[], t: number): number {
  const v = toVideoTime(segments, t);
  if (v >= 0) return round(v);
  return round(segments.reduce((sum, g) => (g.start < t ? sum + g.duration : sum), 0));
}

/** Seconds of the take kept on import: everything outside the pauses. */
export function keptRanges(
  pauses: readonly [number, number][],
  duration: number,
): [number, number][] {
  const kept: [number, number][] = [];
  let at = 0;
  for (const [a, b] of [...pauses].sort((x, y) => x[0] - y[0])) {
    if (a > at + 0.001) kept.push([at, Math.min(a, duration)]);
    at = Math.max(at, b);
  }
  if (duration > at + 0.001) kept.push([at, duration]);
  return kept.filter(([a, b]) => b - a > 0.001);
}

/**
 * The strokes drawn on the screen in seconds of the take (shared/drawing.ts): each starts where
 * its first point fell, and its points keep their own rhythm. Strokes started while paused, and
 * the clears, go to where the take goes on. An "apagar tudo" before the first stroke or board
 * takes nothing away and is left out. The drawing is held to the project's limits
 * (shared/drawing.ts limitDrawing); what that leaves out goes to `warnings`. Null when nothing
 * was drawn.
 */
export function drawingInTake(
  replay: Pick<JournalReplay, "strokes" | "clears"> &
    Partial<Pick<JournalReplay, "boards" | "pages" | "undos">>,
  segments: readonly CaptureSegment[],
  warnings: string[] = [],
): Drawing | null {
  const boardsQpc = replay.boards ?? [];
  if ((!replay.strokes.length && !boardsQpc.length) || !segments.length) return null;
  const at = (qpc: number): number => momentInTake(segments, qpc);
  const ordered = [...replay.strokes].sort((a, b) => a.qpc - b.qpc);
  // Each Ctrl+Z takes back the last stroke drawn before it that is still on screen.
  const undone = new Map<number, number>();
  const wipesQpc = [
    ...replay.clears,
    ...(replay.pages ?? []),
    ...boardsQpc.flatMap((b) => [b.from, b.to]),
  ];
  for (const u of [...(replay.undos ?? [])].sort((a, b) => a - b)) {
    for (let i = ordered.length - 1; i >= 0; i--) {
      const s = ordered[i];
      if (s.qpc > u || undone.has(i)) continue;
      // Wiped before the undo: not on screen any more.
      if (wipesQpc.some((c) => c > s.qpc && c <= u)) continue;
      undone.set(i, u);
      break;
    }
  }
  const strokes = ordered.map((s, i) => {
    const until = undone.get(i);
    return {
      t: at(s.qpc),
      color: s.color,
      width: s.width,
      points: s.points.map(([x, y, ms]) => [x, y, round(ms / 1000)] as [number, number, number]),
      ...(s.tool ? { tool: s.tool } : {}),
      ...(until !== undefined ? { until: at(until) } : {}),
    };
  });
  // A board still up at the stop lasts to the end of the take.
  const boards: DrawingBoard[] = boardsQpc
    .map((b) => ({ start: at(b.from), end: at(b.to), color: BOARD_COLORS[b.kind] }))
    .filter((b) => b.end > b.start);
  const first = Math.min(...strokes.map((s) => s.t), ...boards.map((b) => b.start));
  // Wiping before anything is on screen does nothing.
  const clears = replay.clears
    .map(at)
    .filter((c) => c > first)
    .sort((a, b) => a - b);
  const pages = (replay.pages ?? [])
    .map(at)
    .filter((c) => c > first)
    .sort((a, b) => a - b);
  const { drawing, cut } = limitDrawing({
    strokes,
    clears,
    ...(boards.length ? { boards } : {}),
    ...(pages.length ? { pages } : {}),
  });
  if (cut.strokes)
    warnings.push(
      `O desenho na tela passou de ${drawing.strokes.length} traços: os ${cut.strokes} últimos ficaram de fora.`,
    );
  if (cut.thinned)
    warnings.push(
      "O desenho na tela era muito longo: os traços foram simplificados para caber no projeto.",
    );
  return drawing;
}
