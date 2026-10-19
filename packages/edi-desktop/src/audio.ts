/**
 * Audio levels and the computer-sound contract shared by the recorders of the suite (EdiAula and
 * EdiCaptura). Pure: no Electron, no DOM, so main, renderers and tests use the same judgments.
 */

/** Below this a source counts as silent. */
export const SILENCE_DBFS = -55;

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

/** Peak and RMS (0..1) of float samples, as a Web Audio analyser hands them. */
export function floatLevels(samples: ArrayLike<number>): { peak: number; rms: number } {
  const count = samples.length;
  if (!count) return { peak: 0, rms: 0 };
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const v = Number.isFinite(samples[i]) ? (samples[i] as number) : 0;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v * v;
  }
  return { peak: Math.min(1, peak), rms: Math.min(1, Math.sqrt(sum / count)) };
}

/** dBFS of a 0..1 level (-Infinity for silence). */
export const dbfs = (level: number): number => (level > 0 ? 20 * Math.log10(level) : -Infinity);

/** Seconds a source has been below SILENCE_DBFS, from blocks of measured audio. */
export class SilenceMeter {
  silentFor = 0;
  add(rms: number, seconds: number): number {
    this.silentFor = dbfs(rms) < SILENCE_DBFS ? this.silentFor + seconds : 0;
    return this.silentFor;
  }
}

/** A block this close to full scale counts as clipping. */
export const CLIP_LEVEL = 0.98;
/** Clipping is shown for this long after the last block that clipped. */
const CLIP_HOLD = 2;

/** Whether a source clipped in the last seconds, from blocks of measured audio. */
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

/** Windows 10 version 2004 (build 19041) brought process loopback. */
export const PROCESS_LOOPBACK_BUILD = 19041;

/** The build number of a Windows release string ("10.0.22631"), 0 when it is not one. */
export function windowsBuild(text: string): number {
  const parts = /^(\d+)\.(\d+)\.(\d+)/.exec(text);
  return parts ? Number(parts[3]) : 0;
}

/**
 * Chromium's Windows loopback for `getDisplayMedia`, leaving out the capturing document's own
 * sound (`restrictOwnAudio`); another window of the same app is NOT left out (measured in
 * EdiAula's tests/systemAudioExclusion.test.ts). Voice processing meant for calls stays off.
 */
export const SYSTEM_AUDIO_CONSTRAINTS = {
  restrictOwnAudio: true,
  suppressLocalAudioPlayback: false,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
} as const;

/** A microphone as a recording should hear it: no call processing. */
export const MICROPHONE_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
} as const;

/** What a captured track reports about itself (MediaStreamTrack.getSettings()). */
export interface SystemAudioSettings {
  restrictOwnAudio?: boolean;
  deviceId?: string;
}

/**
 * The track really leaves the capturing window's own sound out: the constraint was applied AND
 * the audio service opened the process loopback ("loopbackWithoutChrome"). A Windows or Chromium
 * without process loopback hands the plain loopback instead.
 */
export const excludesOwnAudio = (settings: SystemAudioSettings): boolean =>
  settings.restrictOwnAudio === true && settings.deviceId === "loopbackWithoutChrome";

/** A gain from a 0..200 % volume, muted to silence; anything else is refused as 100 %. */
export function sourceGain(volumePercent: number, muted: boolean): number {
  if (muted) return 0;
  if (!Number.isFinite(volumePercent)) return 1;
  return Math.min(200, Math.max(0, volumePercent)) / 100;
}
