import { CLICK_RATE, clickSamples } from "./clickSound.ts";

/**
 * The sound effects of EdiAula, made here rather than read from files, like the cursor's click
 * (clickSound.ts, which is the "clique" below): clicks for the pointer, whooshes for the zooms
 * and the transitions, and a few accents (ding, erro, digitação, tchan). Each one is a short
 * mono sound computed from fixed numbers and a fixed noise seed, so it is the same on every
 * computer, in the preview and in the export, and needs no license. The library of every lesson
 * offers them as WAV files (main/soundLibrary.ts) to place by hand; the cursor and the automatic
 * whoosh (autoSounds.ts) play them by id.
 */

export const SOUND_GROUPS = ["clique", "woosh", "destaque"] as const;
export type SoundGroup = (typeof SOUND_GROUPS)[number];

export const SOUND_GROUP_LABEL: Record<SoundGroup, string> = {
  clique: "Cliques",
  woosh: "Wooshes",
  destaque: "Destaques",
};

export const SOUND_EFFECT_IDS = [
  "clique",
  "clique-suave",
  "clique-mouse",
  "clique-mecanico",
  "pop",
  "woosh-curto",
  "woosh-longo",
  "swoosh-entrada",
  "swoosh-saida",
  "ding",
  "erro",
  "digitacao",
  "tchan",
] as const;
export type SoundEffectId = (typeof SOUND_EFFECT_IDS)[number];

export interface SoundEffect {
  id: SoundEffectId;
  name: string;
  group: SoundGroup;
  hint: string;
  /** Seconds it lasts. */
  seconds: number;
  /**
   * Seconds from its start to the moment it is loudest: an automatic whoosh is placed so this
   * moment falls in the middle of the movement it goes with.
   */
  peak: number;
}

export const SOUND_EFFECTS: readonly SoundEffect[] = [
  {
    id: "clique",
    name: "Clique",
    group: "clique",
    hint: "O clique de sempre: curto e seco",
    seconds: 0.035,
    peak: 0,
  },
  {
    id: "clique-suave",
    name: "Clique suave",
    group: "clique",
    hint: "Mais grave e macio, para cliques frequentes",
    seconds: 0.05,
    peak: 0,
  },
  {
    id: "clique-mouse",
    name: "Clique de mouse",
    group: "clique",
    hint: "O botão descendo e subindo, como um mouse de verdade",
    seconds: 0.11,
    peak: 0,
  },
  {
    id: "clique-mecanico",
    name: "Clique mecânico",
    group: "clique",
    hint: "Estalo de tecla mecânica, mais presente",
    seconds: 0.07,
    peak: 0,
  },
  { id: "pop", name: "Pop", group: "clique", hint: "Bolha que estoura", seconds: 0.09, peak: 0 },
  {
    id: "woosh-curto",
    name: "Woosh curto",
    group: "woosh",
    hint: "Passada rápida de ar, para zooms e transições curtas",
    seconds: 0.45,
    peak: 0.2,
  },
  {
    id: "woosh-longo",
    name: "Woosh longo",
    group: "woosh",
    hint: "Passada larga e lenta, para transições mais longas",
    seconds: 0.9,
    peak: 0.42,
  },
  {
    id: "swoosh-entrada",
    name: "Swoosh de entrada",
    group: "woosh",
    hint: "Sobe e chega: bom para o zoom entrando",
    seconds: 0.5,
    peak: 0.34,
  },
  {
    id: "swoosh-saida",
    name: "Swoosh de saída",
    group: "woosh",
    hint: "Sai e desce: bom para o zoom voltando",
    seconds: 0.5,
    peak: 0.13,
  },
  {
    id: "ding",
    name: "Ding de acerto",
    group: "destaque",
    hint: "Sininho claro para um acerto ou uma dica",
    seconds: 1.2,
    peak: 0,
  },
  {
    id: "erro",
    name: "Erro",
    group: "destaque",
    hint: "Dois tons descendo, para mostrar o que não fazer",
    seconds: 0.42,
    peak: 0,
  },
  {
    id: "digitacao",
    name: "Digitação",
    group: "destaque",
    hint: "Um pouco mais de um segundo de teclado",
    seconds: 1.25,
    peak: 0,
  },
  {
    id: "tchan",
    name: "Tchan",
    group: "destaque",
    hint: "Acorde que sobe, para revelar um resultado",
    seconds: 1.1,
    peak: 0.36,
  },
];

const BY_ID = new Map(SOUND_EFFECTS.map((s) => [s.id, s]));
export function soundEffect(id: SoundEffectId): SoundEffect {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Efeito sonoro desconhecido: ${id}`);
  return found;
}
export const isSoundEffectId = (v: unknown): v is SoundEffectId =>
  typeof v === "string" && BY_ID.has(v as SoundEffectId);
export const soundsOf = (group: SoundGroup): SoundEffect[] =>
  SOUND_EFFECTS.filter((s) => s.group === group);

/** Bump when a sound changes, so files and cached tracks made from the old one are made again. */
export const SOUND_VERSION = 1;
/** Sample rate the sounds are made at for the export and the library files. */
export const SOUND_RATE = CLICK_RATE;

/** Deterministic white noise in [-1, 1] (xorshift), the same on every computer. */
function noise(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff) * 2 - 1;
  };
}

/** Scales `out` so its loudest sample is `peak`. */
function normalize(out: Float32Array<ArrayBuffer>, peak: number): Float32Array<ArrayBuffer> {
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / max) * peak;
  return out;
}

/** A few samples of fade at both ends, so a sound never starts or stops with a step. */
function edges(out: Float32Array, rate: number, seconds = 0.002): void {
  const n = Math.min(Math.floor(out.length / 2), Math.max(1, Math.round(seconds * rate)));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
}

const smooth = (p: number): number => {
  const c = Math.max(0, Math.min(1, p));
  return c * c * (3 - 2 * c);
};

/** A tap: filtered noise and a falling tone, `at` seconds into `out`. */
function tap(
  out: Float32Array,
  rate: number,
  at: number,
  o: {
    seed: number;
    tone: number;
    fall: number;
    decay: number;
    body: number;
    lp: number;
    gain: number;
  },
): void {
  const rnd = noise(o.seed);
  let low = 0;
  const from = Math.round(at * rate);
  const n = Math.min(out.length - from, Math.round(o.body * 8 * rate));
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    low += o.lp * (rnd() - low);
    const attack = Math.min(1, t / 0.0006);
    const body = Math.exp(-t / o.body);
    const tone = Math.sin(2 * Math.PI * (o.tone - o.fall * t) * t) * Math.exp(-t / o.decay);
    out[from + i] += o.gain * attack * (0.55 * low * body + 0.6 * tone);
  }
}

/**
 * Air passing by: noise through a band-pass whose center rises with the loudness (a state
 * variable filter), louder and brighter at `peakAt` (0..1 of the length).
 */
function whoosh(
  rate: number,
  o: {
    seconds: number;
    peakAt: number;
    seed: number;
    /** Band center at the start, at the peak and at the end (Hz). */
    from: number;
    top: number;
    to: number;
    /** 1/Q of the band: smaller is a narrower, more "whistling" band. */
    damping: number;
    /** How sharp the rise and the fall are. */
    rise: number;
    fall: number;
  },
): Float32Array<ArrayBuffer> {
  const n = Math.max(1, Math.round(o.seconds * rate));
  const out = new Float32Array(n);
  const rnd = noise(o.seed);
  // Two band-pass stages one after the other: the band falls off steeply on both sides, so it
  // sounds like air rushing by and not like a hiss.
  let low1 = 0;
  let band1 = 0;
  let low2 = 0;
  let band2 = 0;
  let air = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const shape = p < o.peakAt ? (p / o.peakAt) ** o.rise : ((1 - p) / (1 - o.peakAt)) ** o.fall;
    const center =
      p < o.peakAt
        ? o.from + (o.top - o.from) * smooth(p / o.peakAt)
        : o.top + (o.to - o.top) * smooth((p - o.peakAt) / (1 - o.peakAt));
    const f = 2 * Math.sin((Math.PI * Math.min(center, rate / 7)) / rate);
    const x = rnd();
    const high1 = x - low1 - o.damping * band1;
    band1 += f * high1;
    low1 += f * band1;
    const high2 = band1 - low2 - o.damping * band2;
    band2 += f * high2;
    low2 += f * band2;
    // A touch of the noise itself above the band, louder at the peak: the "air" of the pass.
    air += 0.5 * (x - air);
    out[i] = shape * (band2 + 0.004 * shape * (x - air));
  }
  edges(out, rate, 0.004);
  return normalize(out, 0.85);
}

/** A soft tone (sine with a touch of its octave) that starts at `at` and dies over `decay`. */
function tone(
  out: Float32Array,
  rate: number,
  at: number,
  freq: number,
  decay: number,
  gain: number,
  length = decay * 6,
): void {
  const from = Math.round(at * rate);
  const n = Math.min(out.length - from, Math.round(length * rate));
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / decay);
    const w = 2 * Math.PI * freq * t;
    out[from + i] += gain * env * (Math.sin(w) + 0.18 * Math.sin(2 * w));
  }
}

const empty = (id: SoundEffectId, rate: number): Float32Array<ArrayBuffer> =>
  new Float32Array(Math.max(1, Math.round(soundEffect(id).seconds * rate)));

const MAKERS: Record<SoundEffectId, (rate: number) => Float32Array<ArrayBuffer>> = {
  clique: (rate) => clickSamples(rate),
  "clique-suave": (rate) => {
    const out = empty("clique-suave", rate);
    tap(out, rate, 0, {
      seed: 0x51a7e,
      tone: 1500,
      fall: 6000,
      decay: 0.006,
      body: 0.009,
      lp: 0.12,
      gain: 1,
    });
    edges(out, rate);
    return normalize(out, 0.75);
  },
  "clique-mouse": (rate) => {
    const out = empty("clique-mouse", rate);
    const press = { seed: 0x3c0de, tone: 3200, fall: 12000, decay: 0.003, body: 0.004, lp: 0.5 };
    tap(out, rate, 0, { ...press, gain: 1 });
    // The button coming back up, a little later and softer.
    tap(out, rate, 0.075, { ...press, seed: 0x3c0df, tone: 3600, gain: 0.55 });
    edges(out, rate);
    return normalize(out, 0.9);
  },
  "clique-mecanico": (rate) => {
    const out = empty("clique-mecanico", rate);
    tap(out, rate, 0, {
      seed: 0x7e11a,
      tone: 4200,
      fall: 20000,
      decay: 0.004,
      body: 0.006,
      lp: 0.7,
      gain: 1,
    });
    // The key hitting the bottom: a short low thump under the click.
    tone(out, rate, 0.004, 190, 0.012, 0.5);
    edges(out, rate);
    return normalize(out, 0.9);
  },
  pop: (rate) => {
    const out = empty("pop", rate);
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / rate;
      // The pitch jumps up as the bubble breaks.
      const f = 380 + 900 * (1 - Math.exp(-t / 0.012));
      phase += (2 * Math.PI * f) / rate;
      out[i] = Math.sin(phase) * Math.min(1, t / 0.002) * Math.exp(-t / 0.022);
    }
    edges(out, rate);
    return normalize(out, 0.85);
  },
  "woosh-curto": (rate) =>
    whoosh(rate, {
      seconds: soundEffect("woosh-curto").seconds,
      peakAt: 0.45,
      seed: 0x0b005,
      from: 350,
      top: 1900,
      to: 500,
      damping: 0.9,
      rise: 2,
      fall: 1.6,
    }),
  "woosh-longo": (rate) =>
    whoosh(rate, {
      seconds: soundEffect("woosh-longo").seconds,
      peakAt: 0.47,
      seed: 0x10b60,
      from: 250,
      top: 1500,
      to: 300,
      damping: 1.1,
      rise: 1.8,
      fall: 1.8,
    }),
  "swoosh-entrada": (rate) =>
    whoosh(rate, {
      seconds: soundEffect("swoosh-entrada").seconds,
      peakAt: 0.68,
      seed: 0xe7a0a,
      from: 300,
      top: 3200,
      to: 2400,
      damping: 0.7,
      rise: 2.6,
      fall: 1.2,
    }),
  "swoosh-saida": (rate) =>
    whoosh(rate, {
      seconds: soundEffect("swoosh-saida").seconds,
      peakAt: 0.26,
      seed: 0x5a1da,
      from: 2600,
      top: 3000,
      to: 280,
      damping: 0.7,
      rise: 1.4,
      fall: 2.4,
    }),
  ding: (rate) => {
    const out = empty("ding", rate);
    // A small bell: the fundamental and the inharmonic partials of a struck bar.
    const base = 1318.5;
    for (const [ratio, decay, gain] of [
      [1, 0.38, 1],
      [2.0, 0.22, 0.35],
      [2.76, 0.12, 0.25],
      [5.4, 0.05, 0.12],
    ] as const)
      tone(out, rate, 0, base * ratio, decay, gain);
    edges(out, rate, 0.01);
    return normalize(out, 0.8);
  },
  erro: (rate) => {
    const out = empty("erro", rate);
    // Two low, slightly buzzy tones going down.
    for (const [at, freq] of [
      [0, 233],
      [0.19, 185],
    ] as const) {
      const from = Math.round(at * rate);
      const n = Math.min(out.length - from, Math.round(0.2 * rate));
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        const env = Math.min(1, t / 0.006) * Math.min(1, (0.2 - t) / 0.03);
        const w = 2 * Math.PI * freq * t;
        out[from + i] +=
          env * (Math.sin(w) + 0.35 * Math.sin(3 * w) + 0.15 * Math.sin(5 * w)) * 0.8;
      }
    }
    edges(out, rate);
    return normalize(out, 0.75);
  },
  digitacao: (rate) => {
    const out = empty("digitacao", rate);
    const rnd = noise(0xd161a);
    let at = 0.01;
    let k = 0;
    // Keys at an uneven typing pace, a space bar now and then.
    while (at < soundEffect("digitacao").seconds - 0.08) {
      const space = k % 5 === 4;
      tap(out, rate, at, {
        seed: 0x1000 + k * 7919,
        tone: space ? 1800 : 3600 + 600 * rnd(),
        fall: 16000,
        decay: 0.003,
        body: space ? 0.008 : 0.005,
        lp: space ? 0.35 : 0.65,
        gain: 0.7 + 0.25 * rnd(),
      });
      at += 0.09 + 0.05 * Math.abs(rnd());
      k++;
    }
    edges(out, rate);
    return normalize(out, 0.8);
  },
  tchan: (rate) => {
    const out = empty("tchan", rate);
    // C, E, G and the high C one after another, each held: a chord that arrives.
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      tone(out, rate, i * 0.09, f, 0.35, i === notes.length - 1 ? 0.9 : 0.6);
    });
    // A bit of sparkle over the last note.
    const rnd = noise(0x7c4a);
    let band = 0;
    let low = 0;
    const from = Math.round(0.27 * rate);
    for (let i = from; i < out.length; i++) {
      const t = (i - from) / rate;
      const f = 2 * Math.sin((Math.PI * 7000) / rate);
      const high = rnd() - low - 0.5 * band;
      band += f * high;
      low += f * band;
      out[i] += 0.12 * band * Math.exp(-t / 0.15);
    }
    edges(out, rate, 0.01);
    return normalize(out, 0.8);
  },
};

/** The mono samples of a sound effect at `rate`, peaking under full scale. */
export function soundSamples(id: SoundEffectId, rate = SOUND_RATE): Float32Array<ArrayBuffer> {
  return MAKERS[id](rate);
}

export interface PlacedSound {
  /** Seconds where the sound starts, on the clock of the track it is written to. */
  at: number;
  samples: Float32Array;
  volume: number;
}

/**
 * Adds each sound of `sounds` (sorted by `at`) to `out`, a stretch of a mono track that starts
 * at sample `from`: a long track is written a stretch at a time and never sits whole in memory.
 * The result is kept within full scale.
 */
export function fillSounds(
  out: Float32Array,
  from: number,
  sounds: readonly PlacedSound[],
  rate = SOUND_RATE,
): void {
  const end = from + out.length;
  for (const s of sounds) {
    const at = Math.round(s.at * rate);
    if (at >= end) break;
    if (at + s.samples.length <= from) continue;
    const a = Math.max(from, at);
    const b = Math.min(end, at + s.samples.length);
    for (let i = a; i < b; i++) out[i - from] += s.samples[i - at] * s.volume;
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
}

/** A mono 16-bit PCM WAV file of `samples` at `rate` (the library's files). */
export function wavFile(samples: Float32Array, rate = SOUND_RATE): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string): void => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return bytes;
}
