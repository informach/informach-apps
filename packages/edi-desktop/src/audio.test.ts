import { expect, it } from "vitest";
import {
  ClipMeter,
  dbfs,
  excludesOwnAudio,
  floatLevels,
  pcmLevels,
  SilenceMeter,
  sourceGain,
  windowsBuild,
} from "./audio.ts";

it("measures 16-bit PCM and float blocks on the same 0..1 scale", () => {
  const pcm = new Uint8Array(8);
  const view = new DataView(pcm.buffer);
  for (const [i, v] of [16384, -16384, 16384, -16384].entries()) view.setInt16(i * 2, v, true);
  expect(pcmLevels(pcm)).toEqual({ peak: 0.5, rms: 0.5 });
  expect(floatLevels([0.5, -0.5, 0.5, -0.5])).toEqual({ peak: 0.5, rms: 0.5 });
  expect(floatLevels([])).toEqual({ peak: 0, rms: 0 });
  expect(floatLevels([Number.NaN, 2])).toEqual({ peak: 1, rms: 1 });
  expect(dbfs(1)).toBe(0);
  expect(dbfs(0)).toBe(Number.NEGATIVE_INFINITY);
});

it("counts silence and holds clipping for two seconds", () => {
  const silence = new SilenceMeter();
  expect(silence.add(0.0001, 1)).toBe(1);
  expect(silence.add(0.0001, 0.5)).toBe(1.5);
  expect(silence.add(0.2, 0.1)).toBe(0);
  const clip = new ClipMeter();
  expect(clip.clipping).toBe(false);
  expect(clip.add(0.99, 0.1)).toBe(true);
  expect(clip.add(0.1, 1.5)).toBe(true);
  expect(clip.add(0.1, 1)).toBe(false);
});

it("trusts own-sound exclusion only when Chromium opened the process loopback", () => {
  expect(excludesOwnAudio({ restrictOwnAudio: true, deviceId: "loopbackWithoutChrome" })).toBe(
    true,
  );
  expect(excludesOwnAudio({ restrictOwnAudio: true, deviceId: "loopback" })).toBe(false);
  expect(excludesOwnAudio({ deviceId: "loopbackWithoutChrome" })).toBe(false);
  expect(windowsBuild("10.0.22631")).toBe(22631);
  expect(windowsBuild("nope")).toBe(0);
});

it("turns volume and mute into a bounded gain", () => {
  expect(sourceGain(100, false)).toBe(1);
  expect(sourceGain(150, true)).toBe(0);
  expect(sourceGain(500, false)).toBe(2);
  expect(sourceGain(-5, false)).toBe(0);
  expect(sourceGain(Number.NaN, false)).toBe(1);
});
