import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
 * and the computer's sound is captured the two ways the recorder captures it.
 *
 * Native route (the default; native/helper/AudioLoopback.cs, process loopback without the app's
 * process tree):
 * - tone A in a window of the app, and tone A in another window of the app: A is left out both
 *   times, B stays;
 * - the control leaves out the tree of an idle process instead: it must hear A and B.
 *
 * Chromium's fallback (restrictOwnAudio):
 * - tone A in the capturing window itself (the recorder window plays the lesson's voice and the
 *   guided narration, and captures the computer's sound): A is left out, B stays;
 * - tone A in another window of the app: Chromium leaves out only the capturing window's own
 *   sound, so A comes back. This is measured too, so the limit stays known.
 * - the same capture without the exclusion is its control: it must hear A.
 *
 * Without the controls hearing A, the tone never reached the device and the test proves nothing.
 * It plays sound on the real output device for a few seconds: only with EDIAULA_SOUND_TESTS=1, on
 * Windows, with a working default output (and the helper built, for the native route).
 */
const run = promisify(execFile);
const FFMPEG = createRequire(import.meta.url)("ffmpeg-static") as string;
const HELPER = fileURLToPath(new URL("../resources/native/ediaula-helper.exe", import.meta.url));
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

interface Capture {
  file: string;
  settings: Record<string, unknown>;
}

async function capture(dir: string, name: string, args: string[]): Promise<Capture> {
  const electron: unknown = createRequire(import.meta.url)("electron");
  assert.equal(typeof electron, "string");
  const native = args.includes("--capture=native");
  const file = join(dir, `${name}.${native ? "wav" : "webm"}`);
  // The native route leaves out the app's whole process tree, so tone B plays from this test's
  // process (outside it) through the whole take; the fallback has the app start it.
  const other = native
    ? spawn(
        "powershell.exe",
        [
          ...["-NoProfile", "-NonInteractive", "-Command"],
          `(New-Object Media.SoundPlayer '${join(dir, "tom-b-longo.wav").replace(/'/g, "''")}').PlaySync()`,
        ],
        { stdio: "ignore", windowsHide: true },
      )
    : undefined;
  const { stdout } = await run(
    String(electron),
    [
      harness,
      `--out=${file}`,
      `--tone-b=${join(dir, "tom-b.wav")}`,
      `--frequency-a=${A}`,
      `--seconds=${SECONDS}`,
      `--helper=${HELPER}`,
      ...args,
    ],
    { windowsHide: true, timeout: 60_000 },
  ).finally(() => other?.kill());
  const line = stdout.split("\n").find((l) => l.startsWith("SETTINGS "));
  assert.ok(line, stdout);
  return { file, settings: JSON.parse(line.slice("SETTINGS ".length)) };
}

const chromium = (constraints: object, toneWindow: "same" | "other"): string[] => [
  "--capture=chromium",
  `--constraints=${JSON.stringify(constraints)}`,
  `--tone-window=${toneWindow}`,
];
const native = (exclude: "self" | "dummy", toneWindow: "same" | "other"): string[] => [
  "--capture=native",
  `--exclude=${exclude}`,
  "--constraints={}",
  `--tone-window=${toneWindow}`,
];

async function toneB(dir: string): Promise<void> {
  await run(
    FFMPEG,
    [
      ...["-y", "-v", "error", "-f", "lavfi"],
      ...["-i", `sine=frequency=${B}:sample_rate=48000:duration=${SECONDS + 2}`],
      ...["-af", "volume=0.5", "-ac", "2", join(dir, "tom-b.wav")],
    ],
    { windowsHide: true },
  );
  await run(
    FFMPEG,
    [
      ...["-y", "-v", "error", "-f", "lavfi"],
      ...["-i", `sine=frequency=${B}:sample_rate=48000:duration=${SECONDS + 20}`],
      ...["-af", "volume=0.5", "-ac", "2", join(dir, "tom-b-longo.wav")],
    ],
    { windowsHide: true },
  );
}

test("o áudio do PC nativo não tem nenhum som do app e tem o de outro programa", {
  skip: skip || (!existsSync(HELPER) && "helper not built (run the package test script)"),
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-system-audio-native-"));
  try {
    await toneB(dir);
    const control = await capture(dir, "nativo-controle", native("dummy", "other"));
    const same = await capture(dir, "nativo-mesma-janela", native("self", "same"));
    const other = await capture(dir, "nativo-outra-janela", native("self", "other"));
    const levels = {
      controlA: await band(control.file, A),
      controlB: await band(control.file, B),
      sameA: await band(same.file, A),
      sameB: await band(same.file, B),
      otherA: await band(other.file, A),
      otherB: await band(other.file, B),
    };
    console.log(`[áudio do PC nativo] ${JSON.stringify(levels)}`);
    assert.equal(same.settings.route, "native");
    assert.ok(levels.controlA > -50, `the app's tone did not reach the device: ${levels.controlA}`);
    assert.ok(levels.controlB > -50, `the other program's tone is missing: ${levels.controlB}`);
    for (const [where, a, b] of [
      ["one window", levels.sameA, levels.sameB],
      ["another window", levels.otherA, levels.otherB],
    ] as const) {
      // No sound of the app, whichever window plays it; the other program's sound stays.
      assert.ok(b > -50, `the other program's tone is missing (${where}): ${b} dB`);
      assert.ok(
        a < -60 && a < levels.controlA - 30,
        `the app's tone came back (${where}): ${a} dB (control ${levels.controlA} dB)`,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("o áudio do PC pelo Chromium (reserva) tem o som de outro programa e não a voz que o gravador toca", {
  skip,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ediaula-system-audio-test-"));
  try {
    await toneB(dir);
    const { echoCancellation, noiseSuppression, autoGainControl } = SYSTEM_AUDIO_CONSTRAINTS;
    const control = await capture(
      dir,
      "controle",
      chromium({ echoCancellation, noiseSuppression, autoGainControl }, "same"),
    );
    const same = await capture(dir, "mesma-janela", chromium(SYSTEM_AUDIO_CONSTRAINTS, "same"));
    const other = await capture(dir, "outra-janela", chromium(SYSTEM_AUDIO_CONSTRAINTS, "other"));
    const levels = {
      controlA: await band(control.file, A),
      sameA: await band(same.file, A),
      sameB: await band(same.file, B),
      otherA: await band(other.file, A),
      otherB: await band(other.file, B),
    };
    console.log(
      `[áudio do PC pelo Chromium] ${JSON.stringify({ ...levels, settings: same.settings })}`,
    );
    assert.equal(same.settings.restrictOwnAudio, true, JSON.stringify(same.settings));
    assert.equal(same.settings.deviceId, "loopbackWithoutChrome", JSON.stringify(same.settings));
    assert.ok(levels.controlA > -50, `the app's tone did not reach the device: ${levels.controlA}`);
    // The voice the recorder window plays is left out; the other program's sound stays.
    assert.ok(levels.sameB > -50, `the other program's tone is missing: ${levels.sameB} dB`);
    assert.ok(
      levels.sameA < -60 && levels.sameA < levels.controlA - 30,
      `the recorder window's own tone came back: ${levels.sameA} dB (control ${levels.controlA} dB)`,
    );
    // Another window of the app is not left out (the limit of the fallback: every sound the
    // recorder plays while recording plays in its own window).
    assert.ok(levels.otherB > -50, `the other program's tone is missing: ${levels.otherB} dB`);
    assert.ok(
      levels.otherA > -50,
      `Chromium now leaves out other windows of the app too (${levels.otherA} dB): the fallback could say "sem o som do EdiAula" as well`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
