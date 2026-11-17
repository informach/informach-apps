import { expect, it } from "vitest";
import { encodeSpeechPcm, SPEECH_SAMPLE_RATE, speechAudioSeconds } from "../speech-audio";

it("encodes a canonical mono PCM recording and derives duration from the bytes", () => {
  const bytes = encodeSpeechPcm(Float32Array.from({ length: 16000 }, (_, i) => (i % 2 ? 1 : -1)));
  expect(speechAudioSeconds(bytes)).toBe(1);
  const view = new DataView(bytes.buffer);
  expect(view.getInt16(44, true)).toBe(-32768);
  expect(view.getInt16(46, true)).toBe(32767);
  expect(speechAudioSeconds(encodeSpeechPcm(new Float32Array(SPEECH_SAMPLE_RATE * 120)))).toBe(120);
});
it("rejects forged duration, alternate formats, trailing data, truncation and overlong audio", () => {
  const source = encodeSpeechPcm(new Float32Array(160));
  for (const offset of [0, 4, 8, 12, 16, 20, 22, 24, 28, 32, 34, 36, 40]) {
    const bytes = source.slice();
    bytes[offset] = (bytes[offset] ?? 0) ^ 1;
    expect(() => speechAudioSeconds(bytes)).toThrow("INVALID_AUDIO");
  }
  expect(() => speechAudioSeconds(source.subarray(0, 45))).toThrow();
  expect(() => speechAudioSeconds(new Uint8Array([...source, 0, 0]))).toThrow();
  expect(() => encodeSpeechPcm(new Float32Array(16000 * 120 + 1))).toThrow("AUDIO_TOO_LONG");
  expect(() => encodeSpeechPcm(new Float32Array([Number.NaN]))).toThrow("INVALID_AUDIO");
});
