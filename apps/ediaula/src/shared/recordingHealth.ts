/**
 * The health strip of a take (main/recording/health.ts sends it ten times a second): microphone
 * level and silence, disk room, frames the encoder could not keep, and the state of each source.
 * The judgments live here, apart from the processes, so they can be tested.
 */

export interface RecorderHealth {
  /** Seconds recorded, without the pauses. */
  elapsed: number;
  /** null without a microphone. */
  mic: { peak: number; rms: number; silentFor: number } | null;
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
/** Less free space than this: pause, so the files already written stay whole. */
export const DISK_PAUSE_BYTES = 300 * 1024 ** 2;
/** Less than this: stop and save. */
export const DISK_STOP_BYTES = 100 * 1024 ** 2;
/** The encoder running slower than this for SLOW_SECONDS means the machine cannot keep up. */
export const SLOW_SPEED = 0.97;
export const SLOW_SECONDS = 5;

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

/** Frames that should exist by now and were not encoded. */
export const lostFrames = (sourceSeconds: number, fps: number, frame: number): number =>
  Math.max(0, Math.round(sourceSeconds * fps) - frame);

/** Remembers how long the encoder has stayed below real time. */
export class SlowWatch {
  private since: number | null = null;
  /** True once the speed has been below SLOW_SPEED for SLOW_SECONDS (times in seconds). */
  update(speed: number, now: number): boolean {
    if (!(speed > 0) || speed >= SLOW_SPEED) {
      this.since = null;
      return false;
    }
    this.since ??= now;
    return now - this.since >= SLOW_SECONDS;
  }
}

export type DiskAction = "ok" | "warn" | "pause" | "stop";

/**
 * What the free space allows at the rate the take's files grow (bytes per second): minutes left
 * and what to do about it.
 */
export function diskPlan(
  free: number,
  rate: number,
): { minutesLeft: number | null; action: DiskAction } {
  const minutesLeft = rate > 0 ? free / rate / 60 : null;
  if (free < DISK_STOP_BYTES) return { minutesLeft, action: "stop" };
  if (free < DISK_PAUSE_BYTES) return { minutesLeft, action: "pause" };
  if (minutesLeft !== null && minutesLeft < DISK_WARN_MINUTES)
    return { minutesLeft, action: "warn" };
  return { minutesLeft, action: "ok" };
}
