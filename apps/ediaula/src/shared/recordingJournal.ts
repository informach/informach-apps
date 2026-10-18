import { z } from "zod";
import { type CaptureSegment, toVideoTime } from "./cursorCapture.ts";
import { CAPTURE_SOURCES } from "./recording.ts";

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
  z.object({ k: z.literal("fail"), src: source, qpc, message: z.string().max(4000) }),
  z.object({ k: z.literal("health"), qpc, note: z.string().max(4000) }),
  z.object({
    k: z.literal("uiRects"),
    qpc,
    rects: z.array(z.object({ x: z.int(), y: z.int(), w: z.int(), h: z.int() })).max(32),
  }),
  /** The teleprompter moved to this line. */
  z.object({ k: z.literal("line"), qpc, index: z.int().nonnegative() }),
  /** The guided recording's narration (copied into the folder) and where it starts. */
  z.object({ k: z.literal("narration"), file: fileName, offset: z.number() }),
  z.object({ k: z.literal("stop"), qpc }),
  z.object({ k: z.literal("finalized"), qpc }),
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
  failures: { src: string; qpc: number; message: string }[];
  lines: { qpc: number; index: number }[];
  narration: { file: string; offset: number } | null;
  stop: number | null;
  finalized: boolean;
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
    failures: [],
    lines: [],
    narration: null,
    stop: null,
    finalized: false,
    lastQpc: 0,
    skipped: 0,
  };
  let pausedAt: number | null = null;
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
      case "fail":
        replay.failures.push({ src: line.src, qpc: line.qpc, message: line.message });
        // The process was writing nothing from here: as good as a pause until it resumes.
        if (ESSENTIAL_SOURCES.includes(line.src)) pause(line.qpc);
        break;
      case "line":
        replay.lines.push({ qpc: line.qpc, index: line.index });
        break;
      case "narration":
        replay.narration = { file: line.file, offset: line.offset };
        break;
      case "stop":
        replay.stop ??= line.qpc;
        // What the processes wrote while they were closing is not part of the take.
        pause(line.qpc);
        break;
      case "finalized":
        replay.finalized = true;
        break;
      default:
        break;
    }
  }
  if (pausedAt !== null) replay.pauses.push([pausedAt, Number.POSITIVE_INFINITY]);
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
