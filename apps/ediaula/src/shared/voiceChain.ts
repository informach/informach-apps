import type { Asset } from "./types.ts";

/**
 * The voice treatment (main/voiceTreat.ts runs it): FFmpeg filter chains for the teacher's voice,
 * pure so they can be tested. The default, "Voz da professora":
 *
 * 1. high-pass at 75 Hz (rumble, desk knocks, mains hum);
 * 2. noise reduction: RNNoise (`arnndn`, model resources/rnnoise/sh.rnnn) when the FFmpeg has it
 *    and runs it reliably, else `afftdn` with the noise profile sampled in the quietest stretch;
 * 3. the voice brought to a working level (a gain measured in a first pass), a gentle expander
 *    in the pauses, a de-esser and a soft compressor, with a limiter that only catches stray
 *    peaks;
 * 4. loudness in two passes: `loudnorm=print_format=json` measures what the chain gives, then
 *    `linear=true` applies one gain to -16 LUFS integrated with -1 dBTP true peak.
 *
 * The result is a mono 48 kHz WAV cached per source (main), used by the preview and the export
 * alike (`treatedPath`).
 */

export const VOICE_PRESETS = ["teacher", "soft", "off"] as const;
export type VoicePreset = (typeof VOICE_PRESETS)[number];

export const VOICE_PRESET_LABELS: Record<VoicePreset, string> = {
  teacher: "Voz da professora",
  soft: "Suave",
  off: "Desligado",
};

/** Bumped whenever a chain changes what it writes: older cached files are not used again. */
export const VOICE_CHAIN_VERSION = 1;

/** Loudness targets: integrated LUFS, true peak dBTP; a wide LRA keeps the gain linear. */
export const VOICE_LOUDNESS = { I: -16, TP: -1, LRA: 20 } as const;

/** Level (LUFS) the voice is brought to before the dynamics of the chain. */
export const WORKING_LEVEL = -20;

/** How the noise is taken out. */
export type NoiseReduction =
  | { kind: "rnnoise"; model: string }
  /** `quiet`: seconds of the source with the least sound, sampled as the noise profile. */
  | { kind: "fft"; quiet?: [number, number] }
  | { kind: "none" };

/** What a given FFmpeg binary can do (main/voiceTreat.ts reads it once per binary). */
export interface FfmpegCaps {
  /** Major version, null when it cannot be read (a development build). */
  major: number | null;
  filters: Set<string>;
}

/** "ffmpeg version 9.0.2 ..." or "ffmpeg version 6.1.1-essentials_build..." → 9 or 6. */
export function ffmpegMajor(versionText: string): number | null {
  const m = /ffmpeg version n?(\d+)\.\d+/i.exec(versionText);
  return m ? Number(m[1]) : null;
}

/** Filter names from `ffmpeg -filters`. */
export function parseFilterList(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*[TSC.|]{2,3}\s+(\w+)\s+\S+->\S+/.exec(line);
    if (m) out.add(m[1]);
  }
  return out;
}

/**
 * RNNoise when the binary has `arnndn` and is FFmpeg 7 or later: FFmpeg 6.1.1 (the
 * development ffmpeg-static) gave two different results for the same input in repeated runs,
 * one of them with the voice 6 dB down and the hiss barely touched; 9.0.2 (the app's bundle)
 * gave the same bytes every time. Otherwise the FFT denoiser with a sampled noise profile.
 */
export function chooseNoiseReduction(
  caps: FfmpegCaps,
  model: string | null,
  quiet?: [number, number],
): NoiseReduction {
  if (model && caps.filters.has("arnndn") && (caps.major ?? 0) >= 7)
    return { kind: "rnnoise", model };
  if (caps.filters.has("afftdn")) return { kind: "fft", ...(quiet ? { quiet } : {}) };
  return { kind: "none" };
}

/** A path inside a filter argument: forward slashes, ':' and quotes escaped, quoted. */
export const filterPath = (path: string): string =>
  `'${path.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'")}'`;

const n = (v: number, digits = 3): string => String(Math.round(v * 10 ** digits) / 10 ** digits);
/** dBFS to a linear amplitude. */
const lin = (db: number): number => 10 ** (db / 20);

/**
 * Samples (at 48 kHz) each denoiser holds the sound back: arnndn works in 10 ms frames, afftdn
 * in 25 ms windows (measured with FFmpeg 6.1.1 and 9.0.2; tests/voiceChain.test.ts checks that
 * the treated voice lines up with the source within a millisecond). The chain pads the end and
 * trims the start by as much, so the treated file keeps the source's timing and length.
 */
export const NOISE_DELAY: Record<NoiseReduction["kind"], number> = {
  rnnoise: 480,
  fft: 1200,
  none: 0,
};

function noiseFilter(nr: NoiseReduction, strength: number): string | null {
  const delay = NOISE_DELAY[nr.kind];
  const aligned = (filter: string): string =>
    `apad=pad_len=${delay},${filter},atrim=start_sample=${delay},asetpts=N/SR/TB`;
  if (nr.kind === "rnnoise")
    return aligned(`arnndn=m=${filterPath(nr.model)}:mix=${n(strength, 2)}`);
  if (nr.kind === "fft") {
    const reduce = `afftdn=nr=${n(12 + 12 * strength, 1)}:nf=-60:tr=1`;
    // The noise profile is learned on the quietest stretch; the residual is tracked from there.
    if (!nr.quiet) return aligned(reduce);
    const [a, b] = nr.quiet;
    return aligned(`asendcmd=c='${n(a)} afftdn sn start; ${n(b)} afftdn sn stop',${reduce}`);
  }
  return null;
}

interface PresetShape {
  highpass: number;
  /** 0..1: how much of the denoised signal replaces the original. */
  noise: number;
  /** Expander in the pauses: gain left below the threshold (linear) and its threshold (dB
   *  under the working level). */
  gate: { range: number; below: number } | null;
  deesser: number;
  compressor: { threshold: number; ratio: number } | null;
}

const PRESETS: Record<Exclude<VoicePreset, "off">, PresetShape> = {
  teacher: {
    highpass: 75,
    noise: 1,
    // A gentle expander: the pauses go 10 dB down, never to digital silence.
    gate: { range: 0.3, below: 18 },
    deesser: 0.4,
    compressor: { threshold: -20, ratio: 2.5 },
  },
  soft: {
    highpass: 70,
    noise: 0.7,
    gate: { range: 0.5, below: 22 },
    deesser: 0.25,
    compressor: { threshold: -18, ratio: 1.8 },
  },
};

/** The first pass: loudness of the source after the high-pass (to choose the working gain). */
export function levelFilter(preset: VoicePreset): string {
  const shape = preset === "off" ? PRESETS.teacher : PRESETS[preset];
  return `highpass=f=${shape.highpass},${measureFilter()}`;
}

/** loudnorm measuring only (prints its JSON at the end of stderr). */
export const measureFilter = (): string =>
  `loudnorm=I=${VOICE_LOUDNESS.I}:TP=${VOICE_LOUDNESS.TP}:LRA=${VOICE_LOUDNESS.LRA}:print_format=json`;

/**
 * The chain before the loudness: high-pass, noise, working gain (`level`: LUFS the first pass
 * measured), expander, de-esser, compressor and a safety limiter. Null for "off".
 */
export function chainFilter(preset: VoicePreset, nr: NoiseReduction, level: number): string | null {
  if (preset === "off") return null;
  const s = PRESETS[preset];
  // A source that measured as silence keeps its level.
  const gain = Number.isFinite(level) ? Math.max(-20, Math.min(40, WORKING_LEVEL - level)) : 0;
  const parts = [
    `highpass=f=${s.highpass}`,
    noiseFilter(nr, s.noise),
    `volume=${n(gain, 2)}dB`,
    s.gate
      ? `agate=threshold=${n(lin(WORKING_LEVEL - s.gate.below), 5)}:ratio=3:range=${s.gate.range}:attack=5:release=250:knee=2`
      : null,
    `deesser=i=${s.deesser}:m=0.5:f=0.5:s=o`,
    s.compressor
      ? `acompressor=threshold=${n(lin(s.compressor.threshold), 5)}:ratio=${s.compressor.ratio}:attack=10:release=200:makeup=1`
      : null,
    // latency=true: the limiter's 5 ms look-ahead is taken back, the timing stays the source's.
    "alimiter=limit=0.7:level=false:latency=true",
  ];
  return parts.filter((p): p is string => !!p).join(",");
}

/**
 * The chain heard after a warm-up: the first `samples` of the source played backwards in front
 * of it and cut off again after it, so the denoiser, the expander and the compressor have
 * settled when the real first second goes through (RNNoise lets the noise pass while it
 * learns). For a filter_complex, between the prepared input and what follows the chain.
 */
export function withWarmup(chain: string, samples: number): string {
  if (samples <= 0) return chain;
  return (
    `asplit[warm0][source];[warm0]atrim=end_sample=${samples},areverse,asetpts=N/SR/TB[warm];` +
    `[warm][source]concat=n=2:v=0:a=1,${chain},atrim=start_sample=${samples},asetpts=N/SR/TB`
  );
}

/** What loudnorm printed. */
export interface LoudnormStats {
  input_i: number;
  input_tp: number;
  input_lra: number;
  input_thresh: number;
  target_offset: number;
  output_i?: number;
  output_tp?: number;
  normalization_type?: string;
}

/** The JSON loudnorm prints at the end of FFmpeg's stderr. */
export function parseLoudnorm(stderr: string): LoudnormStats {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("O FFmpeg não informou a medida de loudness.");
  const raw = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
  const num = (k: string): number => Number(raw[k]);
  const stats: LoudnormStats = {
    input_i: num("input_i"),
    input_tp: num("input_tp"),
    input_lra: num("input_lra"),
    input_thresh: num("input_thresh"),
    target_offset: num("target_offset"),
  };
  if (raw.output_i !== undefined) stats.output_i = num("output_i");
  if (raw.output_tp !== undefined) stats.output_tp = num("output_tp");
  if (raw.normalization_type) stats.normalization_type = raw.normalization_type;
  return stats;
}

/**
 * loudnorm keeps to one linear gain only when that gain does not push the true peak over the
 * target (and the loudness range is within the target's); otherwise it falls back to its
 * dynamic mode, which lifts the pauses and the noise in them.
 */
export function linearFits(m: LoudnormStats): boolean {
  const { I, TP, LRA } = VOICE_LOUDNESS;
  return m.input_tp + (I - m.input_i) <= TP - 0.1 && m.input_lra <= LRA;
}

/**
 * The ceiling (linear, for alimiter) that makes room for the gain loudnorm will apply: the
 * target peak, less that gain, less 0.7 dB for the true peak between samples.
 */
export function limiterFor(m: LoudnormStats): string {
  const { I, TP } = VOICE_LOUDNESS;
  const ceiling = Math.max(-24, Math.min(TP, TP - (I - m.input_i) - 0.7));
  return `alimiter=limit=${n(lin(ceiling), 5)}:level=false:latency=true`;
}

/** The second loudnorm pass: one linear gain from the measured values. */
export function applyFilter(m: LoudnormStats): string {
  // -inf (pure silence) cannot be passed back; the chain then only resamples.
  const finite = [m.input_i, m.input_tp, m.input_lra, m.input_thresh, m.target_offset].every(
    Number.isFinite,
  );
  if (!finite) return "aresample=48000";
  const { I, TP, LRA } = VOICE_LOUDNESS;
  return (
    `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
    `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}` +
    ":linear=true:print_format=json,aresample=48000"
  );
}

/** What the cache key covers besides the source: the preset, the noise method and the version. */
export const chainKey = (preset: VoicePreset, nr: NoiseReduction): string =>
  `v${VOICE_CHAIN_VERSION}|${preset}|${nr.kind}|${nr.kind === "rnnoise" ? nr.model.split(/[\\/]/).at(-1) : ""}`;

/**
 * The quietest stretch of a sound (RMS per 50 ms of 16-bit samples), between `min` and `max`
 * seconds long, for the noise profile; null when the sound is too short.
 */
export function quietestStretch(
  levels: ArrayLike<number>,
  framesPerSecond: number,
  min = 0.5,
  max = 2,
): [number, number] | null {
  const want = Math.round(max * framesPerSecond);
  const least = Math.round(min * framesPerSecond);
  if (levels.length < least) return null;
  const len = Math.min(want, levels.length);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += levels[i];
  let best = sum;
  let at = 0;
  for (let i = len; i < levels.length; i++) {
    sum += levels[i] - levels[i - len];
    if (sum < best) {
      best = sum;
      at = i - len + 1;
    }
  }
  return [at / framesPerSecond, (at + len) / framesPerSecond];
}

/** The preset a media plays with: chosen in the audio panel; absent means off. */
export const voicePresetOf = (asset: Pick<Asset, "voicePreset">): VoicePreset =>
  asset.voicePreset ?? "off";

/**
 * The treated file a media plays from (preview and export), when one matches its preset and
 * the current chain; null to play the original.
 */
export function treatedPath(
  asset: Pick<Asset, "voicePreset" | "treated" | "hasAudio">,
): string | null {
  const preset = voicePresetOf(asset);
  const t = asset.treated;
  if (!asset.hasAudio || preset === "off" || !t) return null;
  return t.preset === preset && t.version === VOICE_CHAIN_VERSION ? t.path : null;
}
