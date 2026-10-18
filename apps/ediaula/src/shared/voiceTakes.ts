import type { RecordingResult } from "./recording.ts";
import { keptRanges } from "./recordingJournal.ts";
import type { VoiceTake } from "./types.ts";

/**
 * The "Só voz" recording, line by line: what the teleprompter showed (the journal's `line`
 * lines) and the Ctrl+Shift+R presses cut the take into takes of each script line; the pauses
 * are left out. The voice file starts at the take's second 0, so these seconds are also its own.
 */

/** A take shorter than this (a key pressed twice in a row) is not a take. */
const MIN_TAKE = 0.3;
const round = (v: number): number => Math.round(v * 1000) / 1000;

export function voiceTakes(
  result: Pick<RecordingResult, "duration" | "pauses" | "markers" | "lines">,
): VoiceTake[] {
  const lines = [...(result.lines ?? [])].sort((a, b) => a.t - b.t);
  const retakes = result.markers
    .filter((m) => m.kind === "retake")
    .map((m) => m.t)
    .sort((a, b) => a - b);
  const kept = keptRanges(result.pauses, result.duration);
  // The recorder names the line on screen right after the take starts: it was there from 0.
  let line = lines[0]?.index ?? 0;
  const cuts: { t: number; line?: number; retake?: boolean }[] = [
    ...lines.map((l) => ({ t: l.t, line: l.index })),
    ...retakes.map((t) => ({ t, retake: true })),
  ];
  // At the same moment, the redo closes the take before the line changes.
  cuts.sort((a, b) => a.t - b.t || (a.retake ? -1 : 1));
  const raw: VoiceTake[] = [];
  let from = 0;
  const close = (to: number, retake: boolean): void => {
    if (to > from) raw.push({ line, start: from, end: to, ...(retake ? { retake: true } : {}) });
    from = to;
  };
  for (const cut of cuts) {
    if (cut.retake) close(cut.t, true);
    else if (cut.line !== undefined && cut.line !== line) {
      close(cut.t, false);
      line = cut.line;
    }
  }
  close(result.duration, false);
  // Only what was recorded outside the pauses counts, and only takes with something in it.
  const out: VoiceTake[] = [];
  for (const take of raw) {
    const inside = kept
      .map(([a, b]): [number, number] => [Math.max(a, take.start), Math.min(b, take.end)])
      .filter(([a, b]) => b > a);
    const length = inside.reduce((sum, [a, b]) => sum + b - a, 0);
    if (length < MIN_TAKE) continue;
    out.push({
      ...take,
      start: round(inside[0][0]),
      end: round(inside[inside.length - 1][1]),
    });
  }
  return out;
}

/** A line of the teleprompter (shared/script.ts speech items) as the recorder sees it. */
export interface PrompterLine {
  speaker: string;
  text: string;
  avatar: boolean;
  /** The avatar insert it belongs to (F1P1-D01). */
  insertId?: string;
}

/** Lines nobody records: the Zappy's and those marked "não gravar". */
export const isUnrecorded = (line: Pick<PrompterLine, "speaker" | "text">): boolean =>
  /zappy|n[ãa]o gravar/i.test(line.speaker) || /\(n[ãa]o gravar\)/i.test(line.text);

/** The speakers of a section, each with whether the voice recording reads it by default. */
export function voiceSpeakers(lines: readonly PrompterLine[]): { name: string; on: boolean }[] {
  const out: { name: string; on: boolean }[] = [];
  for (const l of lines) {
    if (out.some((s) => s.name === l.speaker)) continue;
    out.push({ name: l.speaker, on: !isUnrecorded(l) });
  }
  return out;
}

/** Indexes of the lines read with these speakers on, in order. */
export const readLines = (
  lines: readonly PrompterLine[],
  speakers: ReadonlySet<string>,
): number[] => lines.flatMap((l, i) => (speakers.has(l.speaker) && !isUnrecorded(l) ? [i] : []));

/** The line after (or before, with step -1) `current` among `order`; the same one at the ends. */
export function stepLine(order: readonly number[], current: number, step: 1 | -1): number {
  if (!order.length) return current;
  const at = order.indexOf(current);
  if (at < 0) {
    const next =
      step > 0 ? order.find((i) => i > current) : [...order].reverse().find((i) => i < current);
    return next ?? (step > 0 ? order[order.length - 1] : order[0]);
  }
  return order[Math.max(0, Math.min(order.length - 1, at + step))];
}
