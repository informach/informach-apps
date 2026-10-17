import type { Transcript, Word } from "./types.ts";

interface WhisperToken {
  text: string;
  offsets: { from: number; to: number };
  p: number;
  t_dtw?: number;
}

interface WhisperJson {
  transcription: { tokens?: WhisperToken[] }[];
}

const PUNCT = /^[.,!?;:…"'«»()\-–—]+$/;
/** DTW marks land a little after a token begins and a little before it ends. */
const LEAD = 0.15;
const TAIL = 0.1;
const MIN_WORD = 0.05;

const tokenStart = (t: WhisperToken): number =>
  t.t_dtw !== undefined && t.t_dtw >= 0 ? t.t_dtw / 100 - LEAD : t.offsets.from / 1000;
const tokenEnd = (t: WhisperToken): number =>
  t.t_dtw !== undefined && t.t_dtw >= 0 ? t.t_dtw / 100 + TAIL : t.offsets.to / 1000;

function inside(t: number, silences: [number, number][]): [number, number] | null {
  for (const s of silences) if (t > s[0] && t < s[1]) return s;
  return null;
}

/**
 * Turns whisper.cpp's full JSON (with DTW token timestamps) into words, then snaps word edges
 * that fall inside detected silences to the silence boundaries, which are far more precise.
 */
export function parseWhisper(json: WhisperJson, silences: [number, number][]): Word[] {
  const groups: WhisperToken[][] = [];
  for (const seg of json.transcription) {
    for (const tok of seg.tokens ?? []) {
      if (tok.text.startsWith("[") || !tok.text.trim()) continue;
      const startsWord = tok.text.startsWith(" ") && !PUNCT.test(tok.text.trim());
      if (startsWord || groups.length === 0) groups.push([tok]);
      else groups[groups.length - 1].push(tok);
    }
  }

  const words: Word[] = [];
  for (const g of groups) {
    const text = g
      .map((t) => t.text)
      .join("")
      .trim();
    const timed = g.filter((t) => !PUNCT.test(t.text.trim()));
    if (!timed.length) {
      // Leading punctuation with no word yet: attach to the previous word.
      if (words.length) words[words.length - 1].text += text;
      continue;
    }
    const prevEnd = words.length ? words[words.length - 1].end : 0;
    let start = Math.max(tokenStart(timed[0]), prevEnd, 0);
    let end = Math.max(tokenEnd(timed[timed.length - 1]), start + MIN_WORD);
    const sStart = inside(start, silences);
    if (sStart) start = sStart[1];
    const sEnd = inside(end, silences);
    if (sEnd) end = sEnd[0];
    if (end <= start) end = start + MIN_WORD;
    const p = timed.reduce((s, t) => s + t.p, 0) / timed.length;
    words.push({ start: round(start), end: round(end), text, p: Math.round(p * 100) / 100 });
  }
  return words;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Parses ffmpeg silencedetect output into [start, end] pairs. */
export function parseSilences(stderr: string, duration: number): [number, number][] {
  const out: [number, number][] = [];
  let open: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = /silence_start: ([\d.]+)/.exec(line);
    if (s) open = Number(s[1]);
    const e = /silence_end: ([\d.]+)/.exec(line);
    if (e && open !== null) {
      out.push([round(open), round(Number(e[1]))]);
      open = null;
    }
  }
  if (open !== null && duration > open) out.push([round(open), round(duration)]);
  return out;
}

export function makeTranscript(
  json: WhisperJson,
  silences: [number, number][],
  model: string,
  language: string,
  duration: number,
): Transcript {
  return { version: 1, model, language, duration, words: parseWhisper(json, silences), silences };
}
