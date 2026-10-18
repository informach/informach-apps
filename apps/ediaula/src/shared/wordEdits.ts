import { correctWords, foldText, replaceCore } from "./glossary.ts";
import type { Transcript, Word, WordEdit } from "./types.ts";

/**
 * The one place where a media's words are read: the transcript as whisper wrote it, with the
 * hand corrections (Asset.wordEdits) and then the glossary applied. Captions, SRT, karaoke, the
 * preview, the cleanup and the AI all go through it, so they all see the corrected text. The
 * corrections are by word index and in source seconds, so they follow every cut and split.
 */

const MIN_WORD = 0.05;
const finite = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** The edit of a word that still applies: the transcript has not been made again since. */
const applies = (e: WordEdit | undefined, w: Word): e is WordEdit =>
  !!e && (e.was === undefined || foldText(e.was) === foldText(w.text));

/**
 * The words with the hand corrections applied. Every word carries `i`, its index as recognized;
 * `edited` holds the positions (in the result) of words the user changed.
 */
export function applyWordEdits(
  words: Word[],
  edits: WordEdit[] | undefined,
): { words: Word[]; edited: Set<number> } {
  const byIndex = new Map<number, WordEdit>();
  for (const e of edits ?? []) byIndex.set(e.i, e);
  const out: { w: Word; edited: boolean }[] = [];
  words.forEach((w, i) => {
    const e = byIndex.get(i);
    if (!applies(e, w)) {
      out.push({ w: { ...w, i }, edited: false });
      return;
    }
    if (e.del) return;
    const start = finite(e.start) ? e.start : w.start;
    const end = Math.max(finite(e.end) ? e.end : w.end, start + MIN_WORD);
    const text = e.text?.trim() || w.text;
    out.push({ w: { ...w, i, text, start, end }, edited: true });
  });
  // New times can move a word past its neighbours.
  if (byIndex.size) out.sort((a, b) => a.w.start - b.w.start);
  const edited = new Set<number>();
  out.forEach((x, k) => {
    if (x.edited) edited.add(k);
  });
  return { words: out.map((x) => x.w), edited };
}

/** A transcript as the editor reads it: hand corrections first, then the glossary around them. */
export function transcriptView(
  raw: Transcript,
  edits: WordEdit[] | undefined,
  terms: string[],
): Transcript {
  const { words, edited } = applyWordEdits(raw.words, edits);
  return { ...raw, words: correctWords(words, terms, { keep: edited }) };
}

export type WordChange = Omit<WordEdit, "i" | "was">;

/**
 * `edits` with word `i` changed. The change merges into an earlier correction of the same word;
 * a correction that ends up saying what whisper heard is dropped.
 */
export function withWordEdit(
  edits: WordEdit[] | undefined,
  raw: Word[],
  i: number,
  change: WordChange,
): WordEdit[] {
  const heard = raw[i];
  const rest = (edits ?? []).filter((e) => e.i !== i);
  if (!heard) return rest;
  const before = (edits ?? []).find((e) => e.i === i);
  const merged: WordEdit = {
    ...(applies(before, heard) ? before : {}),
    ...change,
    i,
    was: heard.text,
  };
  const out: WordEdit = { i, was: heard.text };
  if (merged.del) out.del = true;
  else {
    const text = merged.text?.trim();
    if (text && text !== heard.text) out.text = text;
    if (finite(merged.start) && merged.start !== heard.start) out.start = merged.start;
    if (finite(merged.end) && merged.end !== heard.end) out.end = merged.end;
  }
  const changes =
    out.del || out.text !== undefined || out.start !== undefined || out.end !== undefined;
  return (changes ? [...rest, out] : rest).sort((a, b) => a.i - b.i);
}

/**
 * Writes `core` over every word of `view` that reads like `like` (same letters, ignoring case,
 * accents and punctuation), keeping each one's own punctuation.
 */
export function withEditEverywhere(
  edits: WordEdit[] | undefined,
  raw: Word[],
  view: Word[],
  like: string,
  core: string,
): WordEdit[] {
  const target = foldText(like);
  let out = edits ?? [];
  if (!target) return out;
  for (const w of view)
    if (w.i !== undefined && foldText(w.text) === target)
      out = withWordEdit(out, raw, w.i, { text: replaceCore(w.text, core) });
  return out;
}
