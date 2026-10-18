import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { decodeMono } from "../src/main/heygen.ts";
import { treatVoice } from "../src/main/voiceTreat.ts";
import { locate } from "../src/shared/audioSync.ts";
import {
  chainFilter,
  chooseNoiseReduction,
  ffmpegMajor,
  parseFilterList,
  parseLoudnorm,
  quietestStretch,
  treatedPath,
  VOICE_CHAIN_VERSION,
  VOICE_LOUDNESS,
} from "../src/shared/voiceChain.ts";
import { hiss, mixInto, pink, readWav, rmsDb, speech, writeWav } from "./helpers/voice.ts";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const MODEL = join(here, "..", "resources", "rnnoise", "sh.rnnn");
const STATIC = createRequire(import.meta.url)("ffmpeg-static") as string;
/** The app's own FFmpeg (9.x), when the media bundle was fetched (`pnpm edi:media`). */
const BUNDLED = join(
  here,
  "..",
  "..",
  "..",
  ".cache",
  "edi-native-media",
  "windows-x64",
  "bin",
  "ffmpeg.exe",
);
const tmp = mkdtempSync(join(tmpdir(), "ediaula-voz-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const R = 48000;
/** Speech in 1.5–5 s and 7–10.5 s over hiss and a little room noise; pauses elsewhere. */
function noisyVoice(): string {
  const v = hiss(12, R, 3, 0.006);
  mixInto(v, pink(12, R, 4, 0.002));
  mixInto(v, speech(3.5, R, 5, 0.35), 1.5 * R);
  mixInto(v, speech(3.5, R, 6, 0.3), 7 * R);
  const path = join(tmp, "voz com chiado.wav");
  writeWav(path, v, R);
  return path;
}

/** Speech level against the pause noise, dB. */
function snr(path: string): { speech: number; noise: number; snr: number } {
  const { samples, rate } = readWav(path);
  const s = rmsDb(samples, rate, 1.7, 4.8);
  const noise = rmsDb(samples, rate, 5.5, 6.5);
  return { speech: s, noise, snr: s - noise };
}

async function ebur128(ffmpeg: string, path: string): Promise<{ I: number; peak: number }> {
  const { stderr } = await run(ffmpeg, [
    "-hide_banner",
    "-nostats",
    "-i",
    path,
    "-af",
    "ebur128=peak=true",
    "-f",
    "null",
    "-",
  ]);
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  return {
    I: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]),
    peak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]),
  };
}

test("o modelo RNNoise empacotado é o arquivo fixado", () => {
  const sum = readFileSync(join(dirname(MODEL), "SHA256SUMS"), "utf8").split(/\s+/)[0];
  assert.equal(createHash("sha256").update(readFileSync(MODEL)).digest("hex"), sum);
});

test("a cadeia escolhe RNNoise só num FFmpeg confiável e lê o que o FFmpeg diz", () => {
  assert.equal(ffmpegMajor("ffmpeg version 9.0.2 Copyright (c) 2000-2026"), 9);
  assert.equal(ffmpegMajor("ffmpeg version 6.1.1-essentials_build-www.gyan.dev"), 6);
  const filters = parseFilterList(
    " TSC afftdn            A->A       Denoise audio samples using FFT.\n TS arnndn A->A x\n",
  );
  assert.deepEqual([...filters], ["afftdn", "arnndn"]);
  assert.equal(chooseNoiseReduction({ major: 9, filters }, "m.rnnn").kind, "rnnoise");
  assert.equal(chooseNoiseReduction({ major: 6, filters }, "m.rnnn").kind, "fft");
  assert.equal(chooseNoiseReduction({ major: 9, filters }, null).kind, "fft");
  assert.equal(chooseNoiseReduction({ major: 9, filters: new Set() }, "m").kind, "none");
  const chain = chainFilter("teacher", { kind: "fft", quiet: [5.5, 6.5] }, -30);
  assert.match(
    chain ?? "",
    /^highpass=f=75,apad=pad_len=1200,asendcmd=c='5.5 afftdn sn start; 6.5 afftdn sn stop',afftdn=.*,atrim=start_sample=1200,/,
  );
  assert.match(chain ?? "", /volume=10dB/);
  assert.equal(chainFilter("off", { kind: "none" }, -30), null);
  assert.deepEqual(quietestStretch([5, 5, 1, 1, 5, 5], 2, 0.5, 1), [1, 2]);
  const stats = parseLoudnorm(
    'x\n{\n"input_i" : "-27.53",\n"input_tp" : "-14.14",\n"input_lra" : "2.30",\n"input_thresh" : "-39.38",\n"target_offset" : "-0.27"\n}\n',
  );
  assert.equal(stats.input_i, -27.53);
});

test("o clipe só toca o arquivo tratado do ajuste escolhido e da versão atual", () => {
  const treated = { path: "t.wav", preset: "teacher" as const, version: VOICE_CHAIN_VERSION };
  assert.equal(treatedPath({ hasAudio: true, voicePreset: "teacher", treated }), "t.wav");
  assert.equal(treatedPath({ hasAudio: true, voicePreset: "soft", treated }), null);
  assert.equal(treatedPath({ hasAudio: true, voicePreset: "off", treated }), null);
  assert.equal(treatedPath({ hasAudio: true, treated }), null);
  assert.equal(
    treatedPath({ hasAudio: true, voicePreset: "teacher", treated: { ...treated, version: 0 } }),
    null,
  );
});

for (const [label, ffmpeg] of [
  ["FFmpeg de desenvolvimento", STATIC],
  ["FFmpeg do app", BUNDLED],
] as const)
  test(`voz tratada (${label}): -16 LUFS ±0,5, chiado 10 dB mais baixo e cache reaproveitado`, {
    skip: !existsSync(ffmpeg) && "pacote de mídia não baixado",
    timeout: 120000,
  }, async (t) => {
    const source = noisyVoice();
    const cacheRoot = join(tmp, `cache-${label.length}`);
    const before = snr(source);
    const first = await treatVoice({ ffmpeg, source, preset: "teacher", cacheRoot, model: MODEL });
    assert.equal(first.cached, false);
    assert.equal(first.normalization, "linear", "um ganho linear, como pedido ao loudnorm");
    const loud = await ebur128(STATIC, first.path);
    const after = snr(first.path);
    t.diagnostic(
      `${label}: ruído ${first.noise}; loudness ${loud.I} LUFS, pico ${loud.peak} dBFS; ` +
        `fala/pausa ${before.snr.toFixed(1)} dB → ${after.snr.toFixed(1)} dB ` +
        `(chiado ${before.noise.toFixed(1)} → ${after.noise.toFixed(1)} dBFS)`,
    );
    assert.ok(Math.abs(loud.I - VOICE_LOUDNESS.I) <= 0.5, `loudness ${loud.I}`);
    assert.ok(loud.peak <= VOICE_LOUDNESS.TP + 0.2, `pico ${loud.peak}`);
    assert.ok(after.snr - before.snr >= 10, `${before.snr} → ${after.snr}`);
    const wav = readWav(first.path);
    assert.equal(wav.rate, 48000);
    // Same timing and length as the source: the denoiser's and the limiter's delays taken back.
    const original = await decodeMono(STATIC, source);
    const treatedSound = await decodeMono(STATIC, first.path);
    assert.equal(treatedSound.length, original.length);
    const shift = locate(original, treatedSound, { drift: false }).offset;
    t.diagnostic(`${label}: deslocamento do tratado ${(shift * 1000).toFixed(2)} ms`);
    assert.ok(Math.abs(shift) < 0.001, `deslocado ${shift} s`);
    const mtime = statSync(first.path).mtimeMs;
    const again = await treatVoice({ ffmpeg, source, preset: "teacher", cacheRoot, model: MODEL });
    assert.equal(again.cached, true);
    assert.equal(again.path, first.path);
    assert.equal(statSync(first.path).mtimeMs, mtime);
    const soft = await treatVoice({ ffmpeg, source, preset: "soft", cacheRoot, model: MODEL });
    assert.notEqual(soft.path, first.path, "outro ajuste, outro arquivo");
  });
