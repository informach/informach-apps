import type { Transcript, Word } from "./types.ts";

interface WhisperToken {
  text: string;
  offsets: { from: number; to: number };
  p: number;
  t_dtw?: number;
}

export interface WhisperJson {
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

/* ----- Voice activity detection ----- */

/**
 * One speech stretch kept by whisper.cpp's VAD: where it was in the file and where it landed in
 * the shortened audio that was actually transcribed (seconds).
 */
export interface VadSegment {
  origStart: number;
  origEnd: number;
  vadStart: number;
  vadEnd: number;
}

/**
 * Reads the speech segments whisper.cpp logs when `--vad` is on ("vad_segment_info: orig_start:
 * 1.20, orig_end: 3.40, vad_start: 0.00, vad_end: 2.20"). Its full JSON keeps token times and
 * DTW marks on the shortened audio; only segment times are mapped back to the file.
 */
export function parseVadSegments(log: string): VadSegment[] {
  const out: VadSegment[] = [];
  const re =
    /vad_segment_info: orig_start: ([\d.]+), orig_end: ([\d.]+), vad_start: ([\d.]+), vad_end: ([\d.]+)/g;
  for (let m = re.exec(log); m; m = re.exec(log))
    out.push({
      origStart: Number(m[1]),
      origEnd: Number(m[2]),
      vadStart: Number(m[3]),
      vadEnd: Number(m[4]),
    });
  return out.sort((a, b) => a.vadStart - b.vadStart);
}

/**
 * A time on the shortened audio, back on the file. Mirrors whisper.cpp's own token mapping: inside
 * a speech segment it is interpolated; in the gap between two segments it snaps to the nearer
 * edge, so a word never lands in the middle of a removed silence.
 */
export function vadToSource(t: number, segs: VadSegment[]): number {
  if (!segs.length) return t;
  if (t <= segs[0].vadStart) return segs[0].origStart;
  const last = segs[segs.length - 1];
  if (t >= last.vadEnd) return last.origEnd;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (t >= s.vadStart && t <= s.vadEnd) {
      const vd = s.vadEnd - s.vadStart;
      return vd <= 0
        ? s.origStart
        : s.origStart + ((t - s.vadStart) * (s.origEnd - s.origStart)) / vd;
    }
    const next = segs[i + 1];
    if (next && t > s.vadEnd && t < next.vadStart)
      return t <= (s.vadEnd + next.vadStart) / 2 ? s.origEnd : next.origStart;
  }
  return t;
}

/** Token offsets (ms) and DTW marks (cs) moved from the shortened audio back onto the file. */
export function remapVad(json: WhisperJson, segs: VadSegment[]): WhisperJson {
  if (!segs.length) return json;
  const ms = (v: number): number => Math.round(vadToSource(v / 1000, segs) * 1000);
  return {
    transcription: json.transcription.map((seg) => ({
      ...seg,
      tokens: seg.tokens?.map((t) => ({
        ...t,
        offsets: { from: ms(t.offsets.from), to: ms(t.offsets.to) },
        ...(t.t_dtw !== undefined && t.t_dtw >= 0
          ? { t_dtw: Math.round(vadToSource(t.t_dtw / 100, segs) * 100) }
          : {}),
      })),
    })),
  };
}

/* ----- Hallucinations ----- */

/** Below this confidence a word heard in a long silence is taken as invented. */
const LOW_P = 0.5;
/** Silences at least this long are where whisper makes things up. */
const LONG_SILENCE = 0.5;

const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");

const phrase = (s: string): string[] => s.split(/\s+/).map(fold).filter(Boolean);

/** Subtitle credits from the material whisper was trained on: never said in a lesson. */
const CREDITS = [
  "Legendas pela comunidade Amara.org",
  "Legenda pela comunidade Amara.org",
  "Legendas pela comunidade do Amara.org",
  "Legendas Adriana Zanotto",
  "Legenda Adriana Zanotto",
].map(phrase);

/** Video sign-offs whisper invents over silence or noise; a teacher may also say them for real. */
const SIGN_OFFS = [
  "Obrigado por assistir",
  "Obrigada por assistir",
  "Obrigado por assistirem",
  "Inscreva-se no canal",
  "Se inscreva no canal",
  "Inscrevam-se no canal",
  "Ative o sininho",
  "Deixe seu like",
].map(phrase);

/** A word as whisper heard it, before its edges are snapped to the silences. */
export interface HeardWord {
  text: string;
  start: number;
  end: number;
  p: number;
}

/** Share of a word spent inside long silences. */
function silentShare(w: HeardWord, long: [number, number][]): number {
  const len = w.end - w.start;
  if (len <= 0) return inside(w.start, long) ? 1 : 0;
  let quiet = 0;
  for (const [a, b] of long) quiet += Math.max(0, Math.min(b, w.end) - Math.max(a, w.start));
  return quiet / len;
}

/**
 * Removes what whisper invents: low-confidence words whose middle falls in a long silence, subtitle
 * credits ("Legendas pela comunidade Amara.org") anywhere, and video sign-offs ("Obrigado por
 * assistir", "Inscreva-se no canal") when they sit in silence or were barely heard.
 */
export function dropHallucinations(words: HeardWord[], silences: [number, number][]): HeardWord[] {
  const long = silences.filter(([a, b]) => b - a >= LONG_SILENCE);
  const drop = new Set<number>();
  words.forEach((w, i) => {
    if (w.p < LOW_P && inside((w.start + w.end) / 2, long)) drop.add(i);
  });
  const folded = words.map((w) => fold(w.text));
  const matchAt = (at: number, list: string[][]): number =>
    list.find((p) => p.every((part, j) => folded[at + j] === part))?.length ?? 0;
  for (let at = 0; at < words.length; at++) {
    const credit = matchAt(at, CREDITS);
    const n = credit || matchAt(at, SIGN_OFFS);
    if (!n) continue;
    const span = words.slice(at, at + n);
    const meanP = span.reduce((s, w) => s + w.p, 0) / n;
    const quiet = span.reduce((s, w) => s + silentShare(w, long), 0) / n;
    if (credit || meanP < LOW_P || quiet >= 0.5) for (let j = 0; j < n; j++) drop.add(at + j);
    at += n - 1;
  }
  return drop.size ? words.filter((_, i) => !drop.has(i)) : words;
}

/**
 * Turns whisper.cpp's full JSON (with DTW token timestamps) into words, drops what whisper
 * invented over silence, then snaps word edges that fall inside detected silences to the silence
 * boundaries, which are far more precise.
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

  const heard: HeardWord[] = [];
  for (const g of groups) {
    const text = g
      .map((t) => t.text)
      .join("")
      .trim();
    const timed = g.filter((t) => !PUNCT.test(t.text.trim()));
    if (!timed.length) {
      // Leading punctuation with no word yet: attach to the previous word.
      if (heard.length) heard[heard.length - 1].text += text;
      continue;
    }
    heard.push({
      text,
      start: tokenStart(timed[0]),
      end: tokenEnd(timed[timed.length - 1]),
      p: timed.reduce((s, t) => s + t.p, 0) / timed.length,
    });
  }

  const words: Word[] = [];
  for (const h of dropHallucinations(heard, silences)) {
    const prevEnd = words.length ? words[words.length - 1].end : 0;
    let start = Math.max(h.start, prevEnd, 0);
    let end = Math.max(h.end, start + MIN_WORD);
    const sStart = inside(start, silences);
    if (sStart) start = sStart[1];
    const sEnd = inside(end, silences);
    if (sEnd) end = sEnd[0];
    if (end <= start) end = start + MIN_WORD;
    words.push({
      start: round(start),
      end: round(end),
      text: h.text,
      p: Math.round(h.p * 100) / 100,
    });
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

/** The transcript of a whisper run; `vad` maps token times back when `--vad` shortened the audio. */
export function makeTranscript(
  json: WhisperJson,
  silences: [number, number][],
  model: string,
  language: string,
  duration: number,
  vad: VadSegment[] = [],
): Transcript {
  return {
    version: 1,
    model,
    language,
    duration,
    words: parseWhisper(remapVad(json, vad), silences),
    silences,
  };
}
