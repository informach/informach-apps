import { clipEnd, sourceAt } from "./timeline.ts";
import type { Clip } from "./types.ts";
export interface TextCue {
  start: number;
  end: number;
  text: string;
}
const stamp = (time: number): string => {
  const ms = Math.max(0, Math.round(time * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
};
export function clipCues(cues: readonly TextCue[], clip?: Clip): TextCue[] {
  if (!clip) return [...cues];
  return cues
    .filter((cue) => cue.end > clip.start && cue.start < clipEnd(clip))
    .map((cue) => ({
      text: cue.text,
      start: sourceAt(clip, Math.max(clip.start, cue.start)),
      end: sourceAt(clip, Math.min(clipEnd(clip), cue.end)),
    }));
}
const usable = (cues: readonly TextCue[]): TextCue[] =>
  cues.filter(
    (cue) =>
      Number.isFinite(cue.start) &&
      Number.isFinite(cue.end) &&
      cue.end > cue.start &&
      cue.text.trim(),
  );

/** The same cues as SubRip (numbered, milliseconds after a comma); null when none has text. */
export function subRip(cues: readonly TextCue[]): string | null {
  const valid = usable(cues).sort((a, b) => a.start - b.start);
  if (!valid.length) return null;
  return valid
    .map(
      (cue, i) =>
        `${i + 1}\n${stamp(cue.start).replace(".", ",")} --> ${stamp(cue.end).replace(".", ",")}\n${cue.text
          .trim()
          .replace(/\r/g, "")
          .replace(/\n{2,}/g, "\n")}\n`,
    )
    .join("\n");
}

/** Emit genuine available text, never empty files or invented captions. */
export function webVtt(cues: readonly TextCue[]): string | null {
  const valid = usable(cues);
  if (!valid.length) return null;
  return `WEBVTT\n\n${[...valid]
    .sort((a, b) => a.start - b.start)
    .map(
      (cue) =>
        `${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text
          .trim()
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\r/g, "")
          .replace(/\n{2,}/g, "\n")}\n`,
    )
    .join("\n")}`;
}
