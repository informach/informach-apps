/** Words placed on a timeline, as the script aligner reads them (moved from EdiAula cleanup.ts). */

/**
 * Who speaks: the teacher (the narration and the microphone), the presenter (an avatar or a
 * person in a video with the background removed or recorded on a solid screen, a presenter's
 * video placed by the voice, a script insert) or something else (the computer's own sound, a music bed). Only the teacher's words
 * are cleaned of hesitations and repeats: the avatar's lines are acted and the computer's sound
 * is what it is.
 */
export type SpeakerRole = "teacher" | "avatar" | "other";

/** A transcribed word placed on the timeline. */
export interface TimelineWord {
  /** Stable key: asset + index in that asset's transcript. */
  key: string;
  clipId: string;
  text: string;
  start: number;
  end: number;
  p: number;
  /** Media it was said in (asset id); absent counts as one source. Repeats are looked for within one. */
  source?: string;
  /** Absent counts as the teacher. */
  role?: SpeakerRole;
  /** Not heard in the lesson (muted track, volume 0, under the presenter's own sound). */
  silent?: boolean;
}

/** A word folded for comparison: lower case, no accents, letters and digits only. */
export const strip = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");
