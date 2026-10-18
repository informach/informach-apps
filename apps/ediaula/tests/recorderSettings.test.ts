import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { DEFAULT_HOTKEYS } from "../src/shared/hotkeys.ts";
import {
  DEFAULT_RECORDER_SETTINGS,
  parseRecorderSettings,
} from "../src/shared/recorderSettings.ts";

// Only Electron's profile location is replaced; the file is really written and read back.
const root = await mkdtemp(join(tmpdir(), "ediaula-recorder-settings-"));
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "electron")
      return {
        url: `data:text/javascript,${encodeURIComponent(`export const app = { getPath: () => ${JSON.stringify(root)} };`)}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const { readRecorderSettings, writeRecorderSettings } = await import(
  "../src/main/recorderSettings.ts"
);
hooks.deregister();
after(() => rm(root, { recursive: true }));

test("nothing stored gives the defaults", () => {
  const s = parseRecorderSettings(undefined);
  assert.deepEqual(s, DEFAULT_RECORDER_SETTINGS);
  assert.equal(s.fps, 30);
  assert.equal(s.quality, "standard");
  assert.equal(s.countdown, 3);
  assert.equal(s.cameraLatency, 100);
  assert.equal(s.pauseBackground, true);
  assert.equal(s.clicker, false);
  assert.deepEqual(s.teleprompter, { on: true, size: 22, wordsPerMinute: 137 });
  assert.deepEqual(s.hotkeys, DEFAULT_HOTKEYS);
  assert.deepEqual(s.region, { preset: "full" });
  assert.equal(s.microphone, null);
});

test("a value that no longer parses falls back alone; the rest is kept", () => {
  const s = parseRecorderSettings({
    fps: 45,
    countdown: 5,
    microphone: 12,
    camera: "HD Pro Webcam C920",
    cameraMode: { codec: "mjpeg", width: 1920, height: 1080, fps: 30 },
    teleprompter: { size: 30, wordsPerMinute: 9000 },
    hotkeys: { marker: "F7", retake: 3 },
    region: { preset: "custom", rect: { x: 10, y: 20, width: 800, height: 450 } },
    unknown: true,
  });
  assert.equal(s.fps, 30);
  assert.equal(s.countdown, 5);
  assert.equal(s.microphone, null);
  assert.equal(s.camera, "HD Pro Webcam C920");
  assert.deepEqual(s.cameraMode, { codec: "mjpeg", width: 1920, height: 1080, fps: 30 });
  assert.deepEqual(s.teleprompter, { on: true, size: 30, wordsPerMinute: 137 });
  assert.equal(s.hotkeys.marker, "F7");
  assert.equal(s.hotkeys.retake, DEFAULT_HOTKEYS.retake);
  assert.deepEqual(s.region, { preset: "custom", rect: { x: 10, y: 20, width: 800, height: 450 } });
  assert.equal("unknown" in s, false);
  // "Sem áudio" is a choice of its own, kept apart from "never chosen".
  assert.equal(parseRecorderSettings({ microphone: "" }).microphone, "");
});

test("recorder.json is written whole, read back, and a damaged one gives the defaults", async () => {
  assert.deepEqual(await readRecorderSettings(), DEFAULT_RECORDER_SETTINGS);
  const saved = await writeRecorderSettings({
    ...DEFAULT_RECORDER_SETTINGS,
    fps: 60,
    keys: true,
    hotkeys: { ...DEFAULT_HOTKEYS, stop: "F11" },
  });
  assert.equal(saved.fps, 60);
  assert.deepEqual(await readRecorderSettings(), saved);
  // No partial file is left beside it.
  assert.deepEqual(await readdir(root), ["recorder.json"]);
  assert.equal(JSON.parse(await readFile(join(root, "recorder.json"), "utf8")).hotkeys.stop, "F11");
  await writeFile(join(root, "recorder.json"), "{ half a file");
  assert.deepEqual(await readRecorderSettings(), DEFAULT_RECORDER_SETTINGS);
});
