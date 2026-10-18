import { z } from "zod";
import type { TextCue } from "./webvtt.ts";

/**
 * Captions translated by the AI engine the person set up (their own key, Claude Code or Codex),
 * in batches it can answer in one go. Each answer is checked before it is kept: the same number
 * of captions, in order, every line at most CAPTION_LINE characters and at most CAPTION_LINES
 * lines. A translation is kept per caption, by the key of the caption's first word and its text,
 * so an edit of the lesson afterwards makes only the captions it changed out of date; the files
 * <aula>.<lang>.srt and .vtt go out with the export only while every caption is translated.
 */

export const TRANSLATION_BATCH = 150;
export const CAPTION_LINE = 42;
export const CAPTION_LINES = 2;
/** A batch whose answer fails the check is asked again this many times. */
const RETRIES = 2;

/** Languages offered in the editor; the AI tool takes any code of this shape. */
export const TRANSLATION_LANGUAGES = [
  { id: "en", label: "Inglês" },
  { id: "es", label: "Espanhol" },
  { id: "fr", label: "Francês" },
  { id: "it", label: "Italiano" },
  { id: "de", label: "Alemão" },
] as const;
export const LANGUAGE_CODE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

export const languageLabel = (lang: string): string =>
  TRANSLATION_LANGUAGES.find((l) => l.id === lang)?.label ?? lang;

/** A caption of the lesson to translate: its key, its Portuguese text and its times. */
export interface SourceCue extends TextCue {
  key: string;
}

export interface TranslatedCue {
  key: string;
  /** The Portuguese text it was translated from. */
  source: string;
  text: string;
}

export interface CaptionTranslation {
  lang: string;
  createdAt: number;
  cues: TranslatedCue[];
}

/** Sends one prompt to the AI engine and resolves with its whole answer. */
export type RunOneShot = (prompt: string) => Promise<string>;

/**
 * `text` in at most `lines` lines of at most `max` characters, breaking between words (the
 * breaks of the answer are kept when they already fit); null when it cannot fit.
 */
export function fitLines(text: string, max = CAPTION_LINE, lines = CAPTION_LINES): string | null {
  const given = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!given.length) return null;
  if (given.length <= lines && given.every((l) => l.length <= max)) return given.join("\n");
  const words = given.join(" ").split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (w.length > max) return null;
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= max) cur = `${cur} ${w}`;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out.length <= lines ? out.join("\n") : null;
}

/** What the engine is asked for one batch. */
export function translationPrompt(batch: readonly SourceCue[], lang: string): string {
  return [
    `Translate these captions of a recorded lesson for children aged 9 to 14 from Brazilian Portuguese into the language with code "${lang}".`,
    `Rules: keep the same number of captions (${batch.length}) and their order; translate each caption on its own, keeping its meaning and a natural, simple tone; keep names of characters, products and code blocks as they are; every caption has at most ${CAPTION_LINES} lines of at most ${CAPTION_LINE} characters each (break lines with \\n).`,
    'Answer with JSON only, no other text, in this shape: {"cues":[{"i":0,"text":"..."}]} with i from 0 in order.',
    "",
    JSON.stringify({ cues: batch.map((c, i) => ({ i, text: c.text })) }),
  ].join("\n");
}

const answerSchema = z.object({
  cues: z.array(z.object({ i: z.int().nonnegative(), text: z.string().min(1).max(400) })),
});

/** The first JSON object in an answer (engines may wrap it in a code block or a sentence). */
export function jsonIn(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A resposta não trouxe JSON.");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * The translated lines of a batch of `expected` captions, checked: the same count, in order,
 * each fitting the caption size (fitLines). The error says what was wrong, to ask again.
 */
export function parseTranslation(
  answer: string,
  expected: number,
): { ok: true; texts: string[] } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = jsonIn(answer);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const parsed = answerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "O JSON não tem o formato pedido." };
  const { cues } = parsed.data;
  if (cues.length !== expected)
    return {
      ok: false,
      error: `Vieram ${cues.length} legendas, mas eram ${expected}.`,
    };
  const texts: string[] = [];
  for (const [n, cue] of cues.entries()) {
    if (cue.i !== n) return { ok: false, error: `A legenda ${n} veio fora de ordem.` };
    const fit = fitLines(cue.text);
    if (!fit)
      return {
        ok: false,
        error: `A legenda ${n} passa de ${CAPTION_LINES} linhas de ${CAPTION_LINE} caracteres.`,
      };
    texts.push(fit);
  }
  return { ok: true, texts };
}

/**
 * Translates every caption, TRANSLATION_BATCH at a time; a batch whose answer fails the check is
 * asked again with what was wrong (RETRIES times), and a batch that still fails stops the whole
 * translation with the reason.
 */
export async function translateCues(
  cues: readonly SourceCue[],
  lang: string,
  run: RunOneShot,
  opts: { onBatch?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<TranslatedCue[]> {
  if (!LANGUAGE_CODE.test(lang)) throw new Error(`Idioma inválido: ${lang}.`);
  const out: TranslatedCue[] = [];
  const total = Math.ceil(cues.length / TRANSLATION_BATCH);
  for (let b = 0; b < total; b++) {
    opts.signal?.throwIfAborted();
    const batch = cues.slice(b * TRANSLATION_BATCH, (b + 1) * TRANSLATION_BATCH);
    let prompt = translationPrompt(batch, lang);
    let last = "";
    let texts: string[] | null = null;
    for (let attempt = 0; attempt <= RETRIES && !texts; attempt++) {
      const answer = await run(prompt);
      opts.signal?.throwIfAborted();
      const r = parseTranslation(answer, batch.length);
      if (r.ok) texts = r.texts;
      else {
        last = r.error;
        prompt = `${translationPrompt(batch, lang)}\n\nYour previous answer was refused: ${r.error} Answer again following every rule.`;
      }
    }
    if (!texts)
      throw new Error(`A tradução do lote ${b + 1} de ${total} não passou na conferência: ${last}`);
    batch.forEach((c, i) => {
      out.push({ key: c.key, source: c.text, text: texts[i] });
    });
    opts.onBatch?.(b + 1, total);
  }
  return out;
}

/**
 * The captions of the lesson as it is now in `lang`, with the times of now: null while some
 * caption has no translation of its current text (the lesson was edited after translating).
 */
export function translatedCues(
  current: readonly SourceCue[],
  translation: CaptionTranslation | undefined,
): TextCue[] | null {
  if (!translation || !current.length) return null;
  const byKey = new Map(translation.cues.map((c) => [c.key, c]));
  const out: TextCue[] = [];
  for (const c of current) {
    const t = byKey.get(c.key);
    if (!t || t.source !== c.text) return null;
    out.push({ start: c.start, end: c.end, text: t.text });
  }
  return out;
}

/** How many captions of now have no translation of their current text. */
export function staleCues(
  current: readonly SourceCue[],
  translation: CaptionTranslation | undefined,
): number {
  const byKey = new Map((translation?.cues ?? []).map((c) => [c.key, c]));
  return current.filter((c) => byKey.get(c.key)?.source !== c.text).length;
}
