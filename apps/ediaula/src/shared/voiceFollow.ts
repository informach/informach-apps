import { strip } from "./cleanup.ts";

/**
 * The teleprompter following the voice (main/voiceFollow.ts runs Whisper on the microphone's
 * 16 kHz branch). The sound is kept in a short rolling window; whenever the recognizer is free it
 * takes the newest 4 to 6 seconds, so a slow machine skips audio instead of falling behind. A
 * line is over when its last words are heard after it appeared on screen, and it ends where its
 * last word ends (on the take's clock, from the samples' own times).
 */

/** Sample rate of the branch the recognizer listens to. */
export const FOLLOW_RATE = 16000;
/** Longest stretch sent at once, and the shortest worth sending. */
export const FOLLOW_WINDOW = 6;
export const FOLLOW_MIN = 4;
/** A line that just appeared is listened to from a little before it (the first word). */
const LEAD = 0.3;

const NUMBERS: Record<string, string> = {
  "0": "zero",
  "1": "um",
  "2": "dois",
  "3": "tres",
  "4": "quatro",
  "5": "cinco",
  "6": "seis",
  "7": "sete",
  "8": "oito",
  "9": "nove",
  "10": "dez",
  uma: "um",
  duas: "dois",
};

export const followWords = (text: string): string[] =>
  text
    .split(/\s+/)
    .map((w) => {
      const s = strip(w);
      return NUMBERS[s] ?? s;
    })
    .filter(Boolean);

/** Same word, or one letter apart in a word of five letters or more (Whisper's spelling). */
function close(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return i + j >= Math.max(a.length, b.length) - 1;
}

/** A recognized word and its times, in seconds of the stretch that was heard. */
export interface HeardWord {
  text: string;
  start: number;
  end: number;
}

/**
 * Where the line's ending was heard: its last word among `heard`, with at least half of the few
 * words before it found in order just before that (a one-word line only needs that word).
 * Returns that last word's end, or null.
 */
export function lineEndAt(line: string, heard: readonly HeardWord[]): number | null {
  const want = followWords(line);
  const got = heard.flatMap((w) => followWords(w.text).map((text) => ({ text, end: w.end })));
  if (!want.length || !got.length) return null;
  const tail = want.slice(-4);
  const last = tail[tail.length - 1];
  for (let end = got.length - 1; end >= 0; end--) {
    if (!close(got[end].text, last)) continue;
    if (tail.length === 1) return got[end].end;
    let found = 0;
    let at = end - 1;
    for (let k = tail.length - 2; k >= 0 && at >= 0; k--) {
      const limit = Math.max(0, at - 3);
      for (let j = at; j >= limit; j--)
        if (close(got[j].text, tail[k])) {
          found++;
          at = j - 1;
          break;
        }
    }
    if (found >= Math.ceil((tail.length - 1) / 2)) return got[end].end;
  }
  return null;
}

/**
 * When the line on screen since `lineAt` (QPC ms) ended, from the words heard in a stretch that
 * starts at QPC `stretchStart`: only words said after the line appeared count (the stretch may
 * reach back before it, into the line before). The QPC moment its last word ended, or null.
 */
export function lineDoneAt(
  line: string,
  words: readonly HeardWord[],
  stretchStart: number,
  lineAt: number,
): number | null {
  const since = (lineAt - stretchStart) / 1000;
  const end = lineEndAt(
    line,
    words.filter((w) => w.start >= since - 0.05),
  );
  return end === null ? null : stretchStart + end * 1000;
}

/** The line's ending is in this text (no times). */
export const lineEndHeard = (line: string, heard: string): boolean =>
  lineEndAt(
    line,
    heard.split(/\s+/).map((text, i) => ({ text, start: i, end: i })),
  ) !== null;

/**
 * Words of whisper-server's verbose JSON: its tokens joined back into words (a token without a
 * leading space belongs to the word before it).
 */
export function serverWords(json: unknown): HeardWord[] {
  const out: HeardWord[] = [];
  const segments =
    json && typeof json === "object" && "segments" in json && Array.isArray(json.segments)
      ? json.segments
      : [];
  for (const seg of segments) {
    const words = seg && typeof seg === "object" && Array.isArray(seg.words) ? seg.words : [];
    for (const w of words) {
      const text = typeof w?.word === "string" ? w.word : "";
      const start = Number(w?.start);
      const end = Number(w?.end);
      if (!text.trim() || !Number.isFinite(start) || !Number.isFinite(end)) continue;
      const last = out.at(-1);
      if (last && !/^\s/.test(text)) {
        last.text += text;
        last.end = Math.max(last.end, end);
      } else out.push({ text: text.trim(), start, end });
    }
  }
  return out;
}

/** The newest samples of the branch, with the moment (ms, the take's clock) of the last one. */
export class FollowWindow {
  private readonly rate: number;
  private readonly capacity: number;
  private buf: Int16Array;
  private size = 0;
  private lastAt = 0;
  private lineStart = 0;
  /** Samples received since `lineStart`. */
  private sinceLine = 0;

  constructor(rate = FOLLOW_RATE) {
    this.rate = rate;
    this.capacity = Math.round(FOLLOW_WINDOW * rate);
    this.buf = new Int16Array(this.capacity);
  }

  /** 16-bit mono samples that reached the process at `at`. */
  push(samples: Int16Array, at: number): void {
    if (samples.length >= this.capacity) {
      this.buf.set(samples.subarray(samples.length - this.capacity));
      this.size = this.capacity;
    } else {
      const keep = Math.min(this.size, this.capacity - samples.length);
      this.buf.copyWithin(0, this.size - keep, this.size);
      this.buf.set(samples, keep);
      this.size = keep + samples.length;
    }
    this.sinceLine += samples.length;
    this.lastAt = at;
  }

  /** The teleprompter moved on at `at`: what came before is the previous line. */
  newLine(at: number): void {
    this.lineStart = at;
    const before = Math.max(0, (this.lastAt - at) / 1000) * this.rate;
    this.sinceLine = Math.min(this.size, Math.round(before + LEAD * this.rate));
  }

  /**
   * The stretch to recognize now, or null when there is not enough of the current line yet.
   * `line` is the moment that line appeared: a result is only used if it is still the same one.
   */
  take(min = FOLLOW_MIN): { samples: Int16Array; start: number; end: number; line: number } | null {
    // At least `min` seconds (reaching back before the line when it is young: its last words
    // are what counts), and nothing until the line has had almost a second of its own.
    const count = Math.min(this.size, Math.max(this.sinceLine, Math.round(min * this.rate)));
    if (this.sinceLine < Math.round(0.8 * this.rate) || count < this.rate) return null;
    return {
      samples: this.buf.slice(this.size - count, this.size),
      start: this.lastAt - (count / this.rate) * 1000,
      end: this.lastAt,
      line: this.lineStart,
    };
  }
}

/** A 16-bit mono WAV of these samples (what Whisper reads). */
export function wavBytes(samples: Int16Array, rate = FOLLOW_RATE): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(44 + samples.length * 2));
  const v = new DataView(out.buffer);
  const text = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, samples[i], true);
  return out;
}

/**
 * The answer at the root of the recognizer's port is whisper.cpp's server: its "Server" header
 * (newer builds) or the page it serves there. Another program that took the port in the meantime
 * never gets the microphone.
 */
export function isWhisperServer(server: string | null, body: string): boolean {
  return (
    server?.trim().toLowerCase() === "whisper.cpp" ||
    body.includes("<title>Whisper.cpp Server</title>")
  );
}
