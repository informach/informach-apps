import { readFileSync, writeFileSync } from "node:fs";

/**
 * Synthetic voices for the audio tests: a glottal pulse train through vowel formants, in
 * syllables of 140 to 300 ms with a moving pitch and a few fricatives, plus pink noise and hiss.
 * Every generator takes a seed, so a test always hears the same signal.
 */

export function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const gaussOf = (rand: () => number) => (): number => {
  let u = 0;
  for (let i = 0; i < 6; i++) u += rand();
  return (u - 3) / Math.sqrt(0.5);
};

const VOWELS = [
  [730, 1090, 2440],
  [530, 1840, 2480],
  [270, 2290, 3010],
  [570, 840, 2410],
  [300, 870, 2240],
];

function resonator(rate: number, f: number, bw: number): (x: number) => number {
  const r = Math.exp((-Math.PI * bw) / rate);
  const th = (2 * Math.PI * f) / rate;
  const a1 = -2 * r * Math.cos(th);
  const a2 = r * r;
  const g = 1 - r;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = g * x - a1 * y1 - a2 * y2;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** Speech-like sound, peak about `level`. */
export function speech(seconds: number, rate: number, seed: number, level = 0.5): Float32Array {
  const rand = prng(seed);
  const gauss = gaussOf(rand);
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  let phase = 0;
  let sylStart = 0;
  let sylLen = 0.2;
  let res = VOWELS[0].map((f, k) => resonator(rate, f, [80, 100, 140][k]));
  const fric = resonator(rate, Math.min(5500, rate * 0.4), 2500);
  let fricUntil = -1;
  let pause = false;
  const base = 130 + rand() * 60;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    if (t - sylStart >= sylLen) {
      sylStart = t;
      // Now and then a short pause between words.
      pause = rand() < 0.15;
      sylLen = pause ? 0.08 + rand() * 0.25 : 0.14 + rand() * 0.16;
      const vowel = VOWELS[Math.floor(rand() * VOWELS.length)];
      res = vowel.map((f, k) => resonator(rate, f * (0.95 + rand() * 0.1), [80, 100, 140][k]));
      fricUntil = rand() < 0.35 ? t + 0.05 + rand() * 0.04 : -1;
    }
    const f0 = base + 30 * Math.sin(2 * Math.PI * 0.7 * t) + 6 * Math.sin(2 * Math.PI * 5 * t);
    phase += f0 / rate;
    let src = 0;
    if (phase >= 1) {
      phase -= 1;
      src = 1;
    }
    const u = (t - sylStart) / sylLen;
    const env = pause ? 0 : Math.sin(Math.PI * Math.min(1, Math.max(0, u))) ** 0.6;
    let v = 0;
    for (const r of res) v += r(src);
    let s = v * env * 2.2;
    if (t < fricUntil && !pause) s += fric(gauss()) * 0.25;
    out[i] = s;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * level;
  return out;
}

/** Pink noise (Paul Kellet's filter) with RMS about `rms`. */
export function pink(seconds: number, rate: number, seed: number, rms: number): Float32Array {
  const gauss = gaussOf(prng(seed));
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const w = gauss();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    out[i] = v;
    sum += v * v;
  }
  const k = rms / Math.sqrt(sum / n);
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

/** White hiss with RMS `rms`. */
export function hiss(seconds: number, rate: number, seed: number, rms: number): Float32Array {
  const gauss = gaussOf(prng(seed));
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = gauss() * rms;
  return out;
}

/** `b` added into `a` from sample `at` (in place; returns `a`). */
export function mixInto(a: Float32Array, b: ArrayLike<number>, at = 0, gain = 1): Float32Array {
  for (let i = 0; i < b.length && at + i < a.length; i++) if (at + i >= 0) a[at + i] += b[i] * gain;
  return a;
}

/** Played `factor` times slower (longer) by linear interpolation. */
export function stretch(a: Float32Array, factor: number): Float32Array {
  const out = new Float32Array(Math.floor(a.length * factor));
  for (let i = 0; i < out.length; i++) {
    const x = i / factor;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = (a[j] ?? 0) * (1 - f) + (a[j + 1] ?? 0) * f;
  }
  return out;
}

export function writeWav(path: string, samples: ArrayLike<number>, rate: number): void {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++)
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  writeFileSync(path, b);
}

/** Mono 16-bit PCM WAV written by FFmpeg or writeWav (the data chunk is found by name). */
export function readWav(path: string): { rate: number; samples: Float32Array } {
  const b = readFileSync(path);
  let at = 12;
  let rate = 0;
  let channels = 1;
  while (at + 8 <= b.length) {
    const id = b.toString("ascii", at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === "fmt ") {
      channels = b.readUInt16LE(at + 10);
      rate = b.readUInt32LE(at + 12);
    }
    if (id === "data") {
      const end = Math.min(b.length, at + 8 + size);
      const count = Math.floor((end - at - 8) / 2 / channels);
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = b.readInt16LE(at + 8 + i * 2 * channels) / 32768;
      return { rate, samples };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${path}`);
}

/** RMS in dBFS of seconds [a, b). */
export function rmsDb(samples: Float32Array, rate: number, a: number, b: number): number {
  const from = Math.round(a * rate);
  const to = Math.min(samples.length, Math.round(b * rate));
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return 10 * Math.log10(sum / Math.max(1, to - from) + 1e-20);
}

/** A lesson-like voice: speech blocks with pauses over a quiet pink noise room. */
export function lessonVoice(seconds: number, rate: number, seed: number): Float32Array {
  const out = pink(seconds, rate, seed + 1, 0.003);
  const rand = prng(seed + 2);
  let t = 0.6;
  let k = 0;
  while (t < seconds - 1) {
    const len = Math.min(seconds - t - 0.5, 2.5 + rand() * 4);
    mixInto(out, speech(len, rate, seed + 10 + k++, 0.45 + rand() * 0.15), Math.round(t * rate));
    t += len + 0.4 + rand() * 1.2;
  }
  return out;
}
