import type { CueStyle } from "@shared/captions";
import type { TimelineWord } from "@shared/cleanup";
import { clipEnd, sourceAt } from "@shared/timeline";
import type { Project, Transcript } from "@shared/types";
import {
  transcriptView,
  type WordChange,
  withEditEverywhere,
  withWordEdit,
} from "@shared/wordEdits";
import { useProject } from "@/state/project";
import { addToGlossary, projectCorrectionTerms } from "./glossaryStore";
import { loadTranscript } from "./transcripts";

/**
 * Hand corrections of the transcript and of the captions. Every one is an undoable edit
 * (`commit`); they live in the project (Asset.wordEdits, captionBreaks, cueStyles), so the
 * captions, SRT, karaoke, preview and AI all follow them.
 */

/** "asset:index" → the media and the word's index as recognized. */
export function wordRef(key: string): { assetId: string; i: number } | null {
  const at = key.lastIndexOf(":");
  const i = Number(key.slice(at + 1));
  return at > 0 && Number.isInteger(i) && i >= 0 ? { assetId: key.slice(0, at), i } : null;
}

/** The letters of a typed correction, without the punctuation around them. */
const bareText = (text: string): string =>
  text.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Transcripts as recognized of every transcribed media of the project. */
async function recognized(p: Project): Promise<Map<string, Transcript>> {
  const ready = p.assets.flatMap((a) =>
    a.transcript && a.transcriptStatus === "ready" ? [{ id: a.id, path: a.transcript }] : [],
  );
  return new Map(
    await Promise.all(ready.map(async (a) => [a.id, await loadTranscript(a.path)] as const)),
  );
}

export interface WordEditOptions {
  /** Write the same text over every word that reads like this one, in every media. */
  everywhere?: boolean;
  /** Add the text to the course glossary, which corrects it in the other lessons too. */
  glossary?: boolean;
}

/**
 * Corrects one word of the transcript: new text, removed from the text (`del`, the video is not
 * cut) or new times. One Ctrl+Z undoes it, occurrences included.
 */
export async function editWord(
  word: TimelineWord,
  change: WordChange,
  opts: WordEditOptions = {},
): Promise<void> {
  const ref = wordRef(word.key);
  const { project } = useProject.getState();
  if (!ref || !project) return;
  const raws = await recognized(project);
  if (!raws.get(ref.assetId)) return;
  const typed = change.text?.trim() ?? "";
  const core = bareText(typed);
  const terms = opts.everywhere && core ? await projectCorrectionTerms(project) : [];
  useProject.getState().commit((p) => ({
    ...p,
    assets: p.assets.map((a) => {
      const raw = raws.get(a.id);
      if (!raw) return a;
      let edits = a.wordEdits;
      if (opts.everywhere && core) {
        const view = transcriptView(raw, edits, terms).words;
        edits = withEditEverywhere(edits, raw.words, view, word.text, core);
      }
      if (a.id === ref.assetId) edits = withWordEdit(edits, raw.words, ref.i, change);
      if (edits === a.wordEdits) return a;
      const next = { ...a };
      if (edits?.length) next.wordEdits = edits;
      else delete next.wordEdits;
      return next;
    }),
  }));
  if (opts.glossary && core) await addToGlossary(project.course ?? "", core);
}

/** Moves the start or the end of a word to a moment of the timeline (within the word's clip). */
export async function retimeWord(
  word: TimelineWord,
  edge: "start" | "end",
  timelineTime: number,
): Promise<void> {
  const clip = useProject.getState().project?.clips.find((c) => c.id === word.clipId);
  if (!clip) return;
  const t = Math.min(Math.max(timelineTime, clip.start), clipEnd(clip));
  await editWord(word, { [edge]: Math.max(0, sourceAt(clip, t)) });
}

/** Starts a caption at this word, or lets it join the caption before again. */
export function toggleCaptionBreak(key: string): void {
  useProject.getState().commit((p) => {
    const breaks = new Set(p.captionBreaks ?? []);
    if (breaks.has(key)) breaks.delete(key);
    else breaks.add(key);
    const next = { ...p };
    if (breaks.size) next.captionBreaks = [...breaks];
    else delete next.captionBreaks;
    return next;
  });
}

/** Gives one caption (by its first word) its own look; null goes back to the project's. */
export function setCueStyle(key: string, style: CueStyle | null): void {
  useProject.getState().commit((p) => {
    const rest = (p.cueStyles ?? []).filter((s) => s.key !== key);
    const own = { ...(p.cueStyles ?? []).find((s) => s.key === key), ...style, key };
    const keep = style && (own.position || own.size || own.color);
    const cueStyles = keep ? [...rest, own] : rest;
    const next = { ...p };
    if (cueStyles.length) next.cueStyles = cueStyles;
    else delete next.cueStyles;
    return next;
  });
}
