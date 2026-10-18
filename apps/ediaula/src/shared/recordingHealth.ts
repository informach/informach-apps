/**
 * The health strip of a take (main/recording/health.ts sends it ten times a second): microphone
 * level and silence, disk room, frames the encoder could not keep, and the state of each source.
 * The judgments live here, apart from the processes, so they can be tested.
 */

export interface RecorderHealth {
  /** Seconds recorded, without the pauses. */
  elapsed: number;
  /** null without a microphone. `clipping`: the voice reached the top in the last moments. */
  mic: { peak: number; rms: number; silentFor: number; clipping?: boolean } | null;
  disk: { free: number; minutesLeft: number | null };
  /** null without the screen. */
  frames: { lost: number; speed: number } | null;
  cursor: "ok" | "restarting" | "lost" | "none";
  camera: "ok" | "failed" | "none";
  system: "ok" | "waiting" | "none";
  /** Shown in the strip while they hold. */
  warnings: string[];
}

/** The setup meter's reading of the chosen microphone. */
export interface MicLevel {
  peak: number;
  rms: number;
  /** The device did not open. */
  error?: string;
}

/** Below this the microphone counts as silent. */
export const SILENCE_DBFS = -55;
/** Silent this long, the strip says so. */
export const SILENCE_WARN_SECONDS = 10;
/** Less recording time left than this on the disk: warn. */
export const DISK_WARN_MINUTES = 10;
/**
 * Free space left beyond what finishing the take needs: below the first the take pauses and
 * closes its files, below the second it stops and saves.
 */
export const DISK_PAUSE_BYTES = 300 * 1024 ** 2;
export const DISK_STOP_BYTES = 100 * 1024 ** 2;
/** The encoder running slower than this for SLOW_SECONDS means the machine cannot keep up. */
export const SLOW_SPEED = 0.97;
export const SLOW_SECONDS = 5;
/** The first seconds of a part: encoders fill their pipeline and FFmpeg's numbers settle. */
export const WARMUP_SECONDS = 12;

/** Peak and RMS (0..1) of little-endian signed 16-bit samples. */
export function pcmLevels(bytes: Uint8Array): { peak: number; rms: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = Math.floor(bytes.byteLength / 2);
  if (!count) return { peak: 0, rms: 0 };
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const v = view.getInt16(i * 2, true) / 32768;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v * v;
  }
  return { peak: Math.min(1, peak), rms: Math.sqrt(sum / count) };
}

/** dBFS of a 0..1 level (-Infinity for silence). */
export const dbfs = (level: number): number => (level > 0 ? 20 * Math.log10(level) : -Infinity);

/** Seconds the microphone has been below SILENCE_DBFS, from blocks of measured audio. */
export class SilenceMeter {
  silentFor = 0;
  add(rms: number, seconds: number): number {
    this.silentFor = dbfs(rms) < SILENCE_DBFS ? this.silentFor + seconds : 0;
    return this.silentFor;
  }
}

/** A block this close to full scale (the meter's 8 kHz copy) counts as clipping. */
export const CLIP_LEVEL = 0.98;
/** Clipping is shown for this long after the last block that clipped. */
const CLIP_HOLD = 2;

/** Whether the microphone clipped in the last seconds, from blocks of measured audio. */
export class ClipMeter {
  private since = Number.POSITIVE_INFINITY;
  add(peak: number, seconds: number): boolean {
    this.since = peak >= CLIP_LEVEL ? 0 : this.since + seconds;
    return this.clipping;
  }
  get clipping(): boolean {
    return this.since < CLIP_HOLD;
  }
}

/** What the five-second microphone test found, and what to do about it. */
export interface MicCheck {
  /** dBFS: the quiet moments (room noise), the voice and its loudest peak. */
  noise: number;
  voice: number;
  peak: number;
  ok: boolean;
  advice: string;
}

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];
};

/**
 * The microphone test: readings of the setup meter (ten a second) over five seconds, with a
 * moment of silence and a sentence read aloud. The quiet tenth is the room, the loud tenth the
 * voice.
 */
export function micCheck(readings: readonly { rms: number; peak: number }[]): MicCheck {
  const rms = readings.map((r) => dbfs(r.rms)).filter(Number.isFinite);
  if (rms.length < 10)
    return {
      noise: -Infinity,
      voice: -Infinity,
      peak: -Infinity,
      ok: false,
      advice: "O microfone não mandou som. Confira se ele está ligado e escolhido.",
    };
  const noise = percentile(rms, 0.1);
  const voice = percentile(rms, 0.9);
  const peak = dbfs(Math.max(...readings.map((r) => r.peak)));
  const round = (v: number): number => Math.round(v * 10) / 10;
  const result = (ok: boolean, advice: string): MicCheck => ({
    noise: round(noise),
    voice: round(voice),
    peak: round(peak),
    ok,
    advice,
  });
  if (peak > -1)
    return result(
      false,
      "A voz está estourando: afaste-se um pouco ou baixe o volume do microfone.",
    );
  if (voice - noise < 12)
    return result(
      false,
      "Não deu para ouvir a voz acima do ruído. Leia uma frase em voz alta durante o teste.",
    );
  if (voice < -36)
    return result(false, "A voz está baixa: aproxime-se do microfone ou aumente o volume dele.");
  if (noise > -50 || voice - noise < 25)
    return result(
      false,
      "Tem bastante ruído de fundo: desligue o ventilador, feche a janela ou aproxime-se do microfone.",
    );
  return result(true, "Tudo certo: volume bom e pouco ruído de fundo.");
}

/** A progress report of the screen's FFmpeg, as the frame watch reads it. */
export interface FrameSample {
  /** Seconds since the part's first frame, when this was reported. */
  seconds: number;
  /** Frames written by then. */
  frame: number;
  /** Frames FFmpeg duplicated and dropped. */
  dup: number;
  drop: number;
  /** Output seconds per second over the last moments; null while unknown. */
  speed: number | null;
}

/**
 * Frames lost by a part and whether the machine keeps up, without false alarms: nothing counts
 * during the warm-up, and the frames behind the clock are measured against how far behind the
 * encoder already was when it ended (its pipeline, the estimate of the first frame).
 */
export class FrameWatch {
  private baseline: number | null = null;
  private slowSince: number | null = null;
  private readonly fps: number;
  constructor(fps: number) {
    this.fps = fps;
  }

  update(sample: FrameSample): { lost: number; slow: boolean; warm: boolean } {
    const behind = Math.round(sample.seconds * this.fps) - sample.frame;
    if (sample.seconds < WARMUP_SECONDS) return { lost: 0, slow: false, warm: false };
    this.baseline ??= behind;
    const lost = Math.max(0, behind - this.baseline) + sample.dup + sample.drop;
    const slowNow = sample.speed !== null && sample.speed < SLOW_SPEED;
    if (!slowNow) this.slowSince = null;
    else this.slowSince ??= sample.seconds;
    const slow = this.slowSince !== null && sample.seconds - this.slowSince >= SLOW_SECONDS;
    return { lost, slow, warm: true };
  }
}

export type DiskAction = "ok" | "warn" | "pause" | "stop";

/** Bytes the take's parts hold now, by kind. */
export interface TakeSizes {
  screen: number;
  /** Microphone and the computer's sound: re-encoded when they are lined up. */
  audio: number;
}

/**
 * Room finishing the take needs: the sound is written again when it is lined up (a little more
 * than it holds now), and joining the screen copies it (1.1 times its size). Without room for
 * the copy the screen stays in parts, so only the sound is a must.
 */
export function finalizeReserve(sizes: TakeSizes): { needed: number; join: number } {
  const needed = Math.ceil(sizes.audio * 1.1) + 20 * 1024 ** 2;
  return { needed, join: needed + Math.ceil(sizes.screen * 1.1) };
}

/**
 * What the free space allows at the rate the take's files grow (bytes per second), after what
 * finishing the take will need: minutes left and what to do about it.
 */
export function diskPlan(
  free: number,
  rate: number,
  sizes: TakeSizes = { screen: 0, audio: 0 },
): { minutesLeft: number | null; action: DiskAction; joinFits: boolean } {
  const reserve = finalizeReserve(sizes);
  const usable = free - reserve.needed;
  const minutesLeft = rate > 0 ? Math.max(0, usable) / rate / 60 : null;
  const joinFits = free >= reserve.join;
  if (usable < DISK_STOP_BYTES) return { minutesLeft, action: "stop", joinFits };
  if (usable < DISK_PAUSE_BYTES) return { minutesLeft, action: "pause", joinFits };
  if (minutesLeft !== null && minutesLeft < DISK_WARN_MINUTES)
    return { minutesLeft, action: "warn", joinFits };
  return { minutesLeft, action: "ok", joinFits };
}
