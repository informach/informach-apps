import { type SoundEffectId, soundSamples } from "@shared/soundEffects";

/**
 * Hearing a sound effect while choosing it (a chip of the cursor's click, of the automatic
 * whoosh, a row of the library): the same samples the preview and the export play, on a small
 * audio context of its own, so it sounds even with the lesson stopped.
 */

let ctx: AudioContext | null = null;
const buffers = new Map<SoundEffectId, AudioBuffer>();

export function previewSound(id: SoundEffectId, volume = 0.8): void {
  ctx ??= new AudioContext({ latencyHint: "interactive" });
  if (ctx.state === "suspended") void ctx.resume();
  let buffer = buffers.get(id);
  if (!buffer) {
    const samples = soundSamples(id, ctx.sampleRate);
    buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    buffers.set(id, buffer);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume));
  source.connect(gain).connect(ctx.destination);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
  source.start();
}
