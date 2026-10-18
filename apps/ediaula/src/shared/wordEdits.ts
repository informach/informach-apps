import { correctWords, foldText, type GlossaryTerm, replaceCore } from "./glossary.ts";
import type { Transcript, Word, WordEdit } from "./types.ts";

/**
 * The one place where a media's words are read: the transcript as whisper wrote it, with the
 * hand corrections (Asset.wordEdits) and then the glossary applied. Captions, SRT, karaoke, the
 * preview, the cleanup and the AI all go through it, so they all see the corrected text. The
 * corrections are by word index and in source seconds, so they follow every cut and split.
 */

const MIN_WORD = 0.05;
/** A correction finds its word again in a new transcript this close (source seconds) to where it was. */
const NEARBY = 1;
const finite = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Lowercase letters and digits with their accents ("Está," and "está" are the same word; "esta"
 * is another one).
 */
export const sameWordKey = (s: string): string =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Where each correction lands: on its own index while the word there is still the one it was made
 * on, else on the same word nearest to where it was (within NEARBY), else nowhere (`lost`).
 */
export function placeEdits(
  words: Word[],
  edits: WordEdit[] | undefined,
): { placed: Map<number, WordEdit>; lost: number } {
  const placed = new Map<number, WordEdit>();
  const astray: WordEdit[] = [];
  for (const e of edits ?? []) {
    const w = words[e.i];
    if (w && (e.was === undefined || foldText(e.was) === foldText(w.text))) placed.set(e.i, e);
    else astray.push(e);
  }
  let lost = 0;
  for (const e of astray) {
    const was = e.was === undefined ? "" : foldText(e.was);
    const at = e.at;
    let best = -1;
    if (was && finite(at)) {
      let gap = NEARBY;
      words.forEach((w, k) => {
        const d = Math.abs(w.start - at);
        if (d <= gap && !placed.has(k) && foldText(w.text) === was) {
          best = k;
          gap = d;
        }
      });
    }
    if (best < 0) lost++;
    else placed.set(best, { ...e, i: best });
  }
  return { placed, lost };
}

/** A recognized word without the filter's mark (it is either hidden or brought back). */
const visible = (w: Word, i: number): Word => {
  const out: Word = { ...w, i };
  delete out.dropped;
  return out;
};

/**
 * The words with the hand corrections applied. Every word carries `i`, its index as recognized;
 * `edited` holds the positions (in the result) of words the user changed, and `lost` counts the
 * corrections that found no word. Words the hallucination filter set aside stay out unless a
 * correction brings them back.
 */
export function applyWordEdits(
  words: Word[],
  edits: WordEdit[] | undefined,
): { words: Word[]; edited: Set<number>; lost: number } {
  const { placed, lost } = placeEdits(words, edits);
  const out: { w: Word; edited: boolean }[] = [];
  words.forEach((heard, i) => {
    const e = placed.get(i);
    if (!e) {
      if (!heard.dropped) out.push({ w: visible(heard, i), edited: false });
      return;
    }
    if (e.del) return;
    const start = finite(e.start) ? e.start : heard.start;
    const end = Math.max(finite(e.end) ? e.end : heard.end, start + MIN_WORD);
    const text = e.text?.trim() || heard.text;
    out.push({ w: { ...visible(heard, i), text, start, end }, edited: true });
  });
  // New times can move a word past its neighbours.
  if (placed.size) out.sort((a, b) => a.w.start - b.w.start);
  const edited = new Set<number>();
  out.forEach((x, k) => {
    if (x.edited) edited.add(k);
  });
  return { words: out.map((x) => x.w), edited, lost };
}

/** A transcript as the editor reads it: hand corrections first, then the glossary around them. */
export function transcriptView(
  raw: Transcript,
  edits: WordEdit[] | undefined,
  terms: readonly GlossaryTerm[],
): Transcript {
  const { words, edited, lost } = applyWordEdits(raw.words, edits);
  const view: Transcript = { ...raw, words: correctWords(words, terms, { keep: edited }) };
  if (lost) view.lostEdits = lost;
  else delete view.lostEdits;
  return view;
}

/** Why a recognized word is not in the text. */
export type RemovedReason = "deleted" | "dropped";

export type RemovedWord = Word & { i: number; removed: RemovedReason };

/** Recognized words left out of the text (by hand or by the hallucination filter), in source seconds. */
export function removedWords(words: Word[], edits: WordEdit[] | undefined): RemovedWord[] {
  const { placed } = placeEdits(words, edits);
  const out: RemovedWord[] = [];
  words.forEach((w, i) => {
    const e = placed.get(i);
    if (e?.del) out.push({ ...w, i, removed: "deleted" });
    else if (!e && w.dropped) out.push({ ...w, i, removed: "dropped" });
  });
  return out;
}

export interface WordChange {
  text?: string;
  start?: number;
  end?: number;
  del?: boolean;
}

const anchorOf = (raw: Word[], i: number): WordEdit => ({ i, was: raw[i].text, at: raw[i].start });
const byIndex = (a: WordEdit, b: WordEdit): number => a.i - b.i;

/**
 * `edits` with a word changed as it is shown (`shown` is a word of the read transcript). A word
 * the glossary joined is edited as a group: the first part takes the text and times, the others
 * are taken out. The shown text is always written along, so moving or removing a corrected word
 * never undoes the correction; typing what whisper heard over a glossary correction keeps it as
 * heard (`keep`). A change that changes nothing returns `edits` as they are.
 */
export function withShownEdit(
  edits: WordEdit[] | undefined,
  raw: Word[],
  shown: Word,
  change: WordChange,
): WordEdit[] {
  const current = edits ?? [];
  const parts = (shown.joined ?? (shown.i === undefined ? [] : [shown.i])).filter((k) => raw[k]);
  if (!parts.length) return current;
  const typed = change.text?.trim();
  const sameText = !typed || typed === shown.text;
  if (!change.del && sameText && change.start === undefined && change.end === undefined)
    return current;
  const [first, ...rest] = parts;
  const others = current.filter((e) => !parts.includes(e.i));
  if (change.del)
    return [...others, ...parts.map((k) => ({ ...anchorOf(raw, k), del: true }))].sort(byIndex);

  const heard = raw[first];
  const text = typed && !sameText ? typed : shown.text;
  const start = change.start ?? shown.start;
  const end = change.end ?? shown.end;
  const edit: WordEdit = anchorOf(raw, first);
  if (text !== heard.text) edit.text = text;
  else edit.keep = true;
  if (start !== heard.start) edit.start = start;
  if (end !== heard.end) edit.end = end;
  return [...others, edit, ...rest.map((k) => ({ ...anchorOf(raw, k), del: true }))].sort(byIndex);
}

/** The new edge of a shown word moved by `delta` source seconds, or null when it would not fit. */
export function nudged(shown: Word, edge: "start" | "end", delta: number): WordChange | null {
  const round = (v: number): number => Math.round(v * 1000) / 1000;
  const start = edge === "start" ? shown.start + delta : shown.start;
  const end = edge === "end" ? shown.end + delta : shown.end;
  if (start < 0 || end - start < MIN_WORD) return null;
  return edge === "start" ? { start: round(start) } : { end: round(end) };
}

/** `edits` without the corrections of these recognized words (they read as heard again). */
export function withoutEdits(edits: WordEdit[] | undefined, indexes: number[]): WordEdit[] {
  return (edits ?? []).filter((e) => !indexes.includes(e.i));
}

/** Brings back a word that was left out: undoes its removal, or keeps a set-aside word. */
export function withRestored(edits: WordEdit[] | undefined, raw: Word[], i: number): WordEdit[] {
  const w = raw[i];
  if (!w) return edits ?? [];
  const rest = withoutEdits(edits, [i]);
  return w.dropped ? [...rest, { ...anchorOf(raw, i), keep: true }].sort(byIndex) : rest;
}

/** Shown words that read like `like` (same letters and accents, any case or punctuation). */
export function wordsLike(view: Word[], like: string): Word[] {
  const target = sameWordKey(like);
  return target ? view.filter((w) => w.i !== undefined && sameWordKey(w.text) === target) : [];
}

/** Writes `core` over every shown word that reads like `like`, keeping each one's own punctuation. */
export function withEditEverywhere(
  edits: WordEdit[] | undefined,
  raw: Word[],
  view: Word[],
  like: string,
  core: string,
): WordEdit[] {
  let out = edits ?? [];
  for (const w of wordsLike(view, like))
    out = withShownEdit(out, raw, w, { text: replaceCore(w.text, core) });
  return out;
}
