import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SYSTEM_AUDIO_CONSTRAINTS } from "../src/shared/systemAudio.ts";

/**
 * What the computer's sound leaves out (shared/systemAudio.ts), measured by the spectrum. Tone A
 * (1000 Hz) is played by the app and tone B (2500 Hz) by another process on the default output,
 * and the computer's sound is captured the way the recorder captures it:
 *
 * - tone A in the capturing window itself (the recorder window plays the lesson's voice and the
 *   guided narration, and captures the computer's sound): A is left out, B stays;
 * - tone A in another window of the app: Chromium leaves out only the capturing window's own
 *   sound, so A comes back. This is measured too, so the limit stays known (and a Chromium that
 *   leaves out the whole app shows up here).
 *
 * The same capture without the exclusion is the control: it must hear A, or the tone never
 * reached the device and the test proves nothing.
 *
 * It plays sound on the real output device for a few seconds: only with EDIAULA_SOUND_TESTS=1, on
 * Windows, with a working default output.
 */
const run = promisify(execFile);
const FFMPEG = createRequire(import.meta.url)("ffmpeg-static") as string;
const skip =
  process.platform !== "win32"
    ? "Windows only"
    : process.env.EDIAULA_SOUND_TESTS === "1"
      ? false
      : "plays sound on the real output device; set EDIAULA_SOUND_TESTS=1";

const A = 1000;
const B = 2500;
const SECONDS = 6;
const harness = fileURLToPath(new URL("./helpers/system-audio-harness.cjs", import.meta.url));

/** Mean level (dB) of a narrow band around `frequency`, through two bandpass passes. */
async function band(file: string, frequency: number): Promise<number> {
  const { stderr } = await run(
    FFMPEG,
    [
      ...["-hide_banner", "-i", file, "-af"],
      `bandpass=f=${frequency}:width_type=h:w=100,bandpass=f=${frequency}:width_type=h:w=100,volumedetect`,
      ...["-f", "null", "-"],
    ],
    { windowsHide: true },
  );
  const level = /mean_volume: (-?[\d.]+|-inf) dB/.exec(stderr)?.[1];
  assert.ok(level, `no level for ${frequency} Hz in ${file}`);
  return level === "-inf" ? Number.NEGATIVE_INFINITY : Number(level);
}

async function capture(
  dir: string,
  name: string,
  constraints: object,
  toneWindow: "same" | "other",
): Promise<{ file: string; settings: Record<string, unknown> }> {
  const electron: unknown = createRequire(import.meta.url)("electron");
  assert.equal(typeof electron, "string");
  const file = join(dir, `${name}.webm`);
  const { stdout } = await run(
    String(electron),
    [
      harness,
      `--out=${file}`,
      `--tone-b=${join(dir, "tom-b.wav")}`,
      `--frequency-a=${A}`,
      `--constraints=${JSON.stringify(constraints)}`,
      `--seconds=${SECONDS}`,
      `--tone-window=${toneWindow}`,
    ],
    { windowsHide: true, timeout: 60_000 },
  );
  const line = stdout.split("\n").find((l) => l.startsWith("SETTINGS "));
  assert.ok(line, stdout);
  return { file, settings: JSON.parse(line.slice("SETTINGS ".length)) };
}

test("o áudio do PC tem o som de outro programa e não a voz que o gravador toca", {
  skip,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-system-audio-test-"));
  try {
    await run(
      FFMPEG,
      [
        ...["-y", "-v", "error", "-f", "lavfi"],
        ...["-i", `sine=frequency=${B}:sample_rate=48000:duration=${SECONDS + 2}`],
        ...["-af", "volume=0.5", "-ac", "2", join(dir, "tom-b.wav")],
      ],
      { windowsHide: true },
    );
    const { echoCancellation, noiseSuppression, autoGainControl } = SYSTEM_AUDIO_CONSTRAINTS;
    const control = await capture(
      dir,
      "controle",
      { echoCancellation, noiseSuppression, autoGainControl },
      "same",
    );
    const same = await capture(dir, "mesma-janela", SYSTEM_AUDIO_CONSTRAINTS, "same");
    const other = await capture(dir, "outra-janela", SYSTEM_AUDIO_CONSTRAINTS, "other");
    const levels = {
      controlA: await band(control.file, A),
      sameA: await band(same.file, A),
      sameB: await band(same.file, B),
      otherA: await band(other.file, A),
      otherB: await band(other.file, B),
    };
    console.log(`[áudio do PC] ${JSON.stringify({ ...levels, settings: same.settings })}`);
    assert.equal(same.settings.restrictOwnAudio, true, JSON.stringify(same.settings));
    assert.equal(same.settings.deviceId, "loopbackWithoutChrome", JSON.stringify(same.settings));
    assert.ok(levels.controlA > -50, `the app's tone did not reach the device: ${levels.controlA}`);
    // The voice the recorder window plays is left out; the other program's sound stays.
    assert.ok(levels.sameB > -50, `the other program's tone is missing: ${levels.sameB} dB`);
    assert.ok(
      levels.sameA < -60 && levels.sameA < levels.controlA - 30,
      `the recorder window's own tone came back: ${levels.sameA} dB (control ${levels.controlA} dB)`,
    );
    // Another window of the app is not left out (the limit the recorder lives with: every sound
    // it plays while recording plays in its own window).
    assert.ok(levels.otherB > -50, `the other program's tone is missing: ${levels.otherB} dB`);
    assert.ok(
      levels.otherA > -50,
      `Chromium now leaves out other windows of the app too (${levels.otherA} dB): the recorder may say "sem o som do EdiAula" again`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
