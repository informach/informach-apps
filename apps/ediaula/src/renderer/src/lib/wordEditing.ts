import type { CueStyle } from "@shared/captions";
import { type TimelineWord, timelineWords } from "@shared/cleanup";
import { clipSpeed } from "@shared/timeline";
import type { Asset, Project, Transcript, Word } from "@shared/types";
import {
  nudged,
  type RemovedReason,
  removedWords,
  transcriptView,
  type WordChange,
  withEditEverywhere,
  withRestored,
  withShownEdit,
  wordsLike,
} from "@shared/wordEdits";
import { useEffect, useMemo, useState } from "react";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { projectCorrectionTerms } from "./glossaryStore";
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
export const bareText = (text: string): string =>
  text.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

const transcribed = (p: Project): (Asset & { transcript: string })[] =>
  p.assets.filter(
    (a): a is Asset & { transcript: string } => !!a.transcript && a.transcriptStatus === "ready",
  );

/** Transcripts as recognized of every transcribed media of the project. */
async function recognized(p: Project): Promise<Map<string, Transcript>> {
  return new Map(
    await Promise.all(
      transcribed(p).map(async (a) => [a.id, await loadTranscript(a.transcript)] as const),
    ),
  );
}

/** Words shown in every media, by "asset:index" (the key of TimelineWord). */
export function shownByKey(transcripts: Map<string, Transcript>): Map<string, Word> {
  const out = new Map<string, Word>();
  for (const [assetId, tr] of transcripts)
    for (const w of tr.words) if (w.i !== undefined) out.set(`${assetId}:${w.i}`, w);
  return out;
}

/** How many shown words, in every media, read like `like` (what "all occurrences" changes). */
export function countLike(transcripts: Map<string, Transcript>, like: string): number {
  let n = 0;
  for (const tr of transcripts.values()) n += wordsLike(tr.words, like).length;
  return n;
}

export interface WordEditOptions {
  /** Write the same text over every word that reads like this one, in every media. */
  everywhere?: boolean;
}

/**
 * Corrects one shown word of the transcript: new text, removed from the text (`del`, the video
 * is not cut) or new times. A word the glossary joined changes as a whole. One Ctrl+Z undoes it,
 * occurrences included.
 */
export async function editWord(
  word: TimelineWord,
  change: WordChange,
  opts: WordEditOptions = {},
): Promise<void> {
  const ref = wordRef(word.key);
  const { project } = useProject.getState();
  if (!ref || !project) return;
  const [raws, terms] = await Promise.all([recognized(project), projectCorrectionTerms(project)]);
  const core = bareText(change.text ?? "");
  useProject.getState().commit((p) => ({
    ...p,
    assets: p.assets.map((a) => {
      const raw = raws.get(a.id);
      if (!raw) return a;
      let edits = a.wordEdits;
      const view = transcriptView(raw, edits, terms).words;
      const shown = a.id === ref.assetId ? view.find((w) => w.i === ref.i) : undefined;
      if (opts.everywhere && core)
        edits = withEditEverywhere(edits, raw.words, view, word.text, core);
      if (shown) edits = withShownEdit(edits, raw.words, shown, change);
      if (edits === a.wordEdits) return a;
      const next = { ...a };
      if (edits?.length) next.wordEdits = edits;
      else delete next.wordEdits;
      return next;
    }),
  }));
}

/**
 * Moves the start or the end of a shown word by `delta` seconds of the timeline (converted to the
 * media's own seconds through the clip's speed). Refused when the end would not stay after the
 * start.
 */
export async function nudgeWord(
  word: TimelineWord,
  shown: Word,
  edge: "start" | "end",
  delta: number,
): Promise<void> {
  const clip = useProject.getState().project?.clips.find((c) => c.id === word.clipId);
  if (!clip) return;
  const change = nudged(shown, edge, delta * clipSpeed(clip));
  if (!change) throw new Error("O fim da palavra precisa ficar depois do começo.");
  await editWord(word, change);
}

/** Plays a word with 0.3 s around it, then stops (the editor stays open). */
export function playWord(word: TimelineWord): void {
  const stopAt = word.end + 0.3;
  playback.pause();
  playback.seek(Math.max(0, word.start - 0.3));
  playback.play();
  const stop = usePlayback.subscribe((s) => {
    if (!s.playing) stop();
    else if (s.time >= stopAt) {
      stop();
      playback.pause();
    }
  });
}

/** A recognized word left out of the text, placed on the timeline. */
export interface RemovedOnTimeline extends TimelineWord {
  removed: RemovedReason;
}

/** Words taken out by hand or set aside by the hallucination filter, where they would be heard. */
export function useRemovedWords(project: Project | null): RemovedOnTimeline[] {
  const [raws, setRaws] = useState(new Map<string, Transcript>());
  const key = project
    ? transcribed(project)
        .map((a) => `${a.id}=${a.transcript}`)
        .join("|")
    : "";
  useEffect(() => {
    let alive = true;
    const current = useProject.getState().project;
    if (!current || !key) return;
    recognized(current)
      .then((map) => {
        if (alive) setRaws(map);
      })
      .catch((err: unknown) => console.warn("[transcript] could not read the transcripts:", err));
    return () => {
      alive = false;
    };
  }, [key]);
  return useMemo(() => {
    if (!project) return [];
    const reasons = new Map<string, RemovedReason>();
    const removed = new Map<string, Transcript>();
    for (const a of project.assets) {
      const raw = raws.get(a.id);
      if (!raw) continue;
      const words = removedWords(raw.words, a.wordEdits);
      for (const w of words) reasons.set(`${a.id}:${w.i}`, w.removed);
      removed.set(a.id, { ...raw, words });
    }
    return timelineWords(project, removed).map((w) => ({
      ...w,
      removed: reasons.get(w.key) ?? "deleted",
    }));
  }, [project, raws]);
}

/** Brings a left-out word back into the text. */
export async function restoreWord(key: string): Promise<void> {
  const ref = wordRef(key);
  const { project } = useProject.getState();
  if (!ref || !project) return;
  const raw = (await recognized(project)).get(ref.assetId);
  if (!raw) return;
  useProject.getState().commit((p) => ({
    ...p,
    assets: p.assets.map((a) => {
      if (a.id !== ref.assetId) return a;
      const edits = withRestored(a.wordEdits, raw.words, ref.i);
      const next = { ...a };
      if (edits.length) next.wordEdits = edits;
      else delete next.wordEdits;
      return next;
    }),
  }));
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
