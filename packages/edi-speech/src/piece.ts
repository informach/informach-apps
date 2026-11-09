import { isStopToken, tokenize } from "./ptSpeech.ts";
import { sentencesOf } from "./script.ts";
import { alignSection } from "./scriptAlign.ts";
import type { TimelineWord } from "./words.ts";

/**
 * A stretch of script in a long recording: the person gives the script of one scene and the audio
 * of the whole lesson, and wants the time of each sentence. The aligner (scriptAlign.ts) compares
 * a section with the recording of that section; over a whole lesson the common words of the
 * script would match all over it. So the stretch is found first, by the window of the recording
 * that holds the most content words of the script, and the sentences are aligned only there.
 */

/** A word heard, in seconds of the recording (Transcript words, or a lesson's words on its clock). */
export interface HeardWord {
  text: string;
  start: number;
  end: number;
  p?: number;
}

export interface PieceLine {
  text: string;
  start: number;
  end: number;
  /** Script tokens of the sentence found, of its total. */
  matched: number;
  total: number;
}

export interface ScriptPiece {
  /** Seconds of the recording where the first sentence starts and the last one ends. */
  start: number;
  end: number;
  lines: PieceLine[];
  /** Fraction of the script's tokens found in the stretch. */
  coverage: number;
}

export class PieceNotFoundError extends Error {
  override name = "PieceNotFoundError";
  constructor(
    message: string,
    /** The sentences that were not found, as written. */
    readonly missing: string[],
  ) {
    super(message);
  }
}

/** Below this share of the script's content words in the best window, the script is not there. */
const MIN_WINDOW_SHARE = 0.35;
/** A sentence with less than this share of its tokens heard is not there. */
const MIN_LINE_SHARE = 0.3;

const quote = (text: string): string => (text.length > 90 ? `${text.slice(0, 87)}…` : text);

/**
 * The script's sentences in the recording. Throws PieceNotFoundError, naming the sentence, when
 * the script is not in it or one of its sentences is not heard: no time is guessed.
 */
export function findScriptPiece(words: readonly HeardWord[], script: string): ScriptPiece {
  const sentences = sentencesOf(script.replace(/\s+/g, " ").trim());
  if (!sentences.length) throw new PieceNotFoundError("O roteiro está vazio.", []);
  const scriptTokens = tokenize(sentences.join(" ")).map((t) => t.tok);
  const wanted = new Map<string, number>();
  for (const tok of scriptTokens)
    if (!isStopToken(tok)) wanted.set(tok, (wanted.get(tok) ?? 0) + 1);
  const content = [...wanted.values()].reduce((a, b) => a + b, 0);
  if (!content || !words.length)
    throw new PieceNotFoundError("Não achei esse roteiro no áudio.", sentences);

  // The window of the recording with the most content words of the script (counted at most as
  // many times as the script has them), slid one token at a time.
  const heard = tokenize(words.map((w) => w.text));
  const size = Math.max(12, Math.round(scriptTokens.length * 1.5));
  const inWindow = new Map<string, number>();
  let score = 0;
  let best = { score: -1, from: 0 };
  const add = (tok: string, sign: 1 | -1): void => {
    const need = wanted.get(tok);
    if (!need) return;
    const had = inWindow.get(tok) ?? 0;
    inWindow.set(tok, had + sign);
    if (sign === 1 && had < need) score++;
    if (sign === -1 && had <= need) score--;
  };
  for (let i = 0; i < heard.length; i++) {
    add(heard[i]!.tok, 1);
    if (i >= size) add(heard[i - size]!.tok, -1);
    const from = Math.max(0, i - size + 1);
    if (score > best.score) best = { score, from };
  }
  if (best.score / content < MIN_WINDOW_SHARE)
    throw new PieceNotFoundError("Não achei esse roteiro no áudio.", sentences);

  // The words of that window, with a margin so a sentence at its edge is whole.
  const first = heard[best.from]?.src[0] ?? 0;
  const last = heard[Math.min(heard.length - 1, best.from + size - 1)]?.src.at(-1) ?? words.length;
  const margin = Math.max(8, Math.round((last - first) * 0.25));
  const from = Math.max(0, first - margin);
  const to = Math.min(words.length, last + 1 + margin);
  const timeline: TimelineWord[] = words.slice(from, to).map((w, k) => ({
    key: `w${from + k}`,
    clipId: "audio",
    text: w.text,
    start: w.start,
    end: w.end,
    p: w.p ?? 1,
  }));
  const alignment = alignSection(
    {
      number: "1",
      title: "",
      items: sentences.map((text) => ({ kind: "speech", speaker: "", avatar: false, text })),
    },
    timeline,
  );
  const lines: PieceLine[] = [];
  const missing: string[] = [];
  for (const [index, text] of sentences.entries()) {
    const match = alignment.lines.find((l) => l.item === index);
    if (
      !match ||
      match.start === undefined ||
      match.end === undefined ||
      match.matched / Math.max(1, match.total) < MIN_LINE_SHARE
    ) {
      missing.push(text);
      continue;
    }
    lines.push({
      text,
      start: match.start,
      end: match.end,
      matched: match.matched,
      total: match.total,
    });
  }
  if (missing.length)
    throw new PieceNotFoundError(
      missing.length === 1
        ? `Não achei no áudio a frase: "${quote(missing[0]!)}".`
        : `Não achei no áudio ${missing.length} frases, a primeira: "${quote(missing[0]!)}".`,
      missing,
    );
  return {
    start: Math.min(...lines.map((l) => l.start)),
    end: Math.max(...lines.map((l) => l.end)),
    lines,
    coverage: alignment.coverage,
  };
}
