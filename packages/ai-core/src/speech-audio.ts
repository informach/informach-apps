/** Bounded wire format for paid speech: PCM16, mono, 16 kHz, at most two minutes. */
export const SPEECH_SAMPLE_RATE = 16000;
export const SPEECH_MAX_SECONDS = 120;
export const SPEECH_MAX_BYTES = 44 + SPEECH_SAMPLE_RATE * 2 * SPEECH_MAX_SECONDS;
const text = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, length));

/** Validate bytes, never trust a multipart MIME type or client-supplied duration. */
export function speechAudioSeconds(bytes: Uint8Array): number {
  if (bytes.length < 46 || bytes.length > SPEECH_MAX_BYTES) throw new Error("INVALID_AUDIO");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    text(view, 0, 4) !== "RIFF" ||
    view.getUint32(4, true) !== bytes.length - 8 ||
    text(view, 8, 4) !== "WAVE" ||
    text(view, 12, 4) !== "fmt " ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== SPEECH_SAMPLE_RATE ||
    view.getUint32(28, true) !== SPEECH_SAMPLE_RATE * 2 ||
    view.getUint16(32, true) !== 2 ||
    view.getUint16(34, true) !== 16 ||
    text(view, 36, 4) !== "data" ||
    view.getUint32(40, true) !== bytes.length - 44 ||
    (bytes.length - 44) % 2
  )
    throw new Error("INVALID_AUDIO");
  return (bytes.length - 44) / (SPEECH_SAMPLE_RATE * 2);
}

export function encodeSpeechPcm(samples: Float32Array): Uint8Array<ArrayBuffer> {
  if (!samples.length || samples.length > SPEECH_SAMPLE_RATE * SPEECH_MAX_SECONDS)
    throw new Error("AUDIO_TOO_LONG");
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (const [offset, value] of [
    [0, "RIFF"],
    [8, "WAVE"],
    [12, "fmt "],
    [36, "data"],
  ] as const)
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  view.setUint32(4, bytes.length - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SPEECH_SAMPLE_RATE, true);
  view.setUint32(28, SPEECH_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (sample === undefined || !Number.isFinite(sample)) throw new Error("INVALID_AUDIO");
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

/** Browser adapter; no upload occurs until the bounded PCM file has been created. */
export async function prepareSpeechAudio(blob: Blob): Promise<Blob> {
  if (!blob.size || blob.size > 10 * 1024 * 1024) throw new Error("INVALID_AUDIO");
  const decoder = new AudioContext();
  try {
    const audio = await decoder.decodeAudioData(await blob.arrayBuffer());
    if (
      !Number.isFinite(audio.duration) ||
      audio.duration <= 0 ||
      audio.duration > SPEECH_MAX_SECONDS
    )
      throw new Error("AUDIO_TOO_LONG");
    const renderer = new OfflineAudioContext(
      1,
      Math.ceil(audio.duration * SPEECH_SAMPLE_RATE),
      SPEECH_SAMPLE_RATE,
    );
    const source = renderer.createBufferSource();
    source.buffer = audio;
    source.connect(renderer.destination);
    source.start();
    const rendered = await renderer.startRendering();
    return new Blob([encodeSpeechPcm(rendered.getChannelData(0))], { type: "audio/wav" });
  } finally {
    await decoder.close();
  }
}
