import { strip } from "./cleanup.ts";

/**
 * The teleprompter following the voice (main/voiceFollow.ts runs Whisper on the microphone's
 * 16 kHz branch). The sound is kept in a short rolling window; whenever the recognizer is free it
 * takes the newest 4 to 6 seconds (never from before the line on screen started), so a slow
 * machine skips audio instead of falling behind. A line is over when its last words are heard.
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

/**
 * The line's ending was heard: its last word is in `heard`, with at least half of the few words
 * before it found in order just before that. A one-word line only needs that word.
 */
export function lineEndHeard(line: string, heard: string): boolean {
  const want = followWords(line);
  const got = followWords(heard);
  if (!want.length || !got.length) return false;
  const tail = want.slice(-4);
  const last = tail[tail.length - 1];
  for (let end = got.length - 1; end >= 0; end--) {
    if (!close(got[end], last)) continue;
    if (tail.length === 1) return true;
    let found = 0;
    let at = end - 1;
    for (let k = tail.length - 2; k >= 0 && at >= 0; k--) {
      const limit = Math.max(0, at - 3);
      for (let j = at; j >= limit; j--)
        if (close(got[j], tail[k])) {
          found++;
          at = j - 1;
          break;
        }
    }
    if (found >= Math.ceil((tail.length - 1) / 2)) return true;
  }
  return false;
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
  take(min = FOLLOW_MIN): { samples: Int16Array; end: number; line: number } | null {
    // At least `min` seconds (reaching back before the line when it is young: its last words
    // are what counts), and nothing until the line has had almost a second of its own.
    const count = Math.min(this.size, Math.max(this.sinceLine, Math.round(min * this.rate)));
    if (this.sinceLine < Math.round(0.8 * this.rate) || count < this.rate) return null;
    return {
      samples: this.buf.slice(this.size - count, this.size),
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
