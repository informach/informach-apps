import { findLine, type InsertSource } from "./inserts.ts";
import { type ScriptSection, type SpeechItem, speechItems } from "./script.ts";
import type { Alignment } from "./scriptAlign.ts";
import type { Transcript, VoiceTake } from "./types.ts";
import { isUnrecorded } from "./voiceTakes.ts";

/**
 * "Regravar falas": the lines of the script that are not in the lesson, or only partly, recorded
 * again in "Só voz" with the teleprompter showing only them, one take each, and fitted back in
 * the lesson between the lines around them (planLineInsert) as a draft.
 */

/** A line with less than this share of its words found is not in the lesson. */
export const LINE_MISSING = 0.4;
/** Below this it is there only partly. */
export const LINE_PARTIAL = 0.8;

export interface RetakeLine {
  /** Index among the section's speech lines (the teleprompter's). */
  line: number;
  /** Index into section.items. */
  item: number;
  speaker: string;
  text: string;
  /** Share of its words found in the lesson. */
  share: number;
  state: "missing" | "partial";
}

/**
 * The lines to record again: speech lines of the teacher (not the presenter's video, not the
 * Zappy's nor marked "não gravar") with less than LINE_PARTIAL of their words in the lesson.
 */
export function retakeLines(section: ScriptSection, alignment: Alignment): RetakeLine[] {
  const speech = speechItems(section);
  const share = new Map(alignment.lines.map((l) => [l.item, l.matched / Math.max(1, l.total)]));
  const out: RetakeLine[] = [];
  speech.forEach((it, line) => {
    if (it.avatar || isUnrecorded(it)) return;
    const item = section.items.indexOf(it);
    const s = share.get(item) ?? 0;
    if (s >= LINE_PARTIAL) return;
    out.push({
      line,
      item,
      speaker: it.speaker,
      text: it.text,
      share: s,
      state: s < LINE_MISSING ? "missing" : "partial",
    });
  });
  return out;
}

/**
 * Where line `line` was said in a "Só voz" take: its last take that was not thrown away
 * (Ctrl+Shift+R), and inside it the words of the line when the take is transcribed
 * (findLine); without them, the whole take. Null when the line has no take.
 */
export function takeOfLine(
  assetId: string,
  takes: readonly VoiceTake[],
  line: number,
  text: string,
  transcript?: Transcript,
): InsertSource | null {
  const take = [...takes].reverse().find((t) => t.line === line && !t.retake);
  if (!take) return null;
  if (transcript) {
    // Only the words said during this take: the same line read in another take is another take.
    const inside: Transcript = {
      ...transcript,
      words: transcript.words.filter(
        (w) => w.start >= take.start - 0.05 && w.end <= take.end + 0.05,
      ),
    };
    const found = findLine(text, new Map([[assetId, inside]]));
    if (found) return found;
  }
  return { assetId, start: take.start, end: take.end };
}

/** The script item a teleprompter line is. */
export const speechItemAt = (section: ScriptSection, line: number): SpeechItem | undefined =>
  speechItems(section)[line];
