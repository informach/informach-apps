import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { pruneCache } from "../src/main/cachePrune.ts";
import { decodeMono } from "../src/main/presenterVideo.ts";
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
import {
  highpass,
  hiss,
  mixInto,
  pink,
  readWav,
  rmsDb,
  speech,
  writeWav,
} from "./helpers/voice.ts";

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
/**
 * Speech in 1.5 to 5 s and 7 to 10.5 s over hiss and a little room noise; pauses elsewhere. The speech
 * has no fricatives, so what is above 8 kHz while it speaks is the hiss under the voice.
 */
function noisyVoice(): string {
  const v = hiss(12, R, 3, 0.006);
  mixInto(v, pink(12, R, 4, 0.002));
  mixInto(v, speech(3.5, R, 5, 0.35, false), 1.5 * R);
  mixInto(v, speech(3.5, R, 6, 0.3, false), 7 * R);
  const path = join(tmp, "voz com chiado.wav");
  writeWav(path, v, R);
  return path;
}

/**
 * Speech level against the noise: in the pause, and under the speech (the hiss above 8 kHz while
 * the voice speaks, where the expander is open and only the noise reduction acts), dB.
 */
function snr(path: string): { speech: number; noise: number; snr: number; under: number } {
  const { samples, rate } = readWav(path);
  const s = rmsDb(samples, rate, 1.7, 4.8);
  const noise = rmsDb(samples, rate, 5.5, 6.5);
  const hiss = rmsDb(highpass(samples, rate, 8000), rate, 1.7, 4.8);
  return { speech: s, noise, snr: s - noise, under: s - hiss };
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
    // The noise under the voice against the same chain without noise reduction (its expander
    // and de-esser alike): the reduction itself, not the expander, takes the hiss 10 dB down.
    const plain = join(tmp, `sem redução ${label.length}.wav`);
    const without = chainFilter("teacher", { kind: "none" }, -30) ?? "";
    await run(ffmpeg, [
      "-y",
      "-v",
      "error",
      "-i",
      source,
      "-af",
      without,
      "-c:a",
      "pcm_s16le",
      plain,
    ]);
    const untreated = snr(plain);
    // Which processor ran it: the AVX-512 ones gave a weaker reduction before NO_AVX512.
    t.diagnostic(`${label}: processador ${cpus()[0]?.model ?? "?"}`);
    t.diagnostic(
      `${label}: chiado sob a fala ${before.under.toFixed(1)} dB abaixo da voz; sem redução ${untreated.under.toFixed(1)} dB; com ${after.under.toFixed(1)} dB`,
    );
    assert.ok(after.under - untreated.under >= 10, `${untreated.under} → ${after.under}`);
    // The expander leaves the pauses quieter, never silent.
    assert.ok(Number.isFinite(after.noise) && after.noise > -110, `pausa em ${after.noise} dBFS`);
    const wav = readWav(first.path);
    assert.equal(wav.rate, 48000);
    // Same timing and length as the source: the denoiser's and the limiter's delays taken back.
    const original = await decodeMono(STATIC, source);
    const treatedSound = await decodeMono(STATIC, first.path);
    assert.equal(treatedSound.length, original.length);
    const shift = locate(original, treatedSound, { drift: false }).offset;
    t.diagnostic(`${label}: deslocamento do tratado ${(shift * 1000).toFixed(2)} ms`);
    assert.ok(Math.abs(shift) < 0.001, `deslocado ${shift} s`);
    const bytes = readFileSync(first.path);
    const again = await treatVoice({ ffmpeg, source, preset: "teacher", cacheRoot, model: MODEL });
    assert.equal(again.cached, true);
    assert.equal(again.path, first.path);
    assert.deepEqual(readFileSync(first.path), bytes, "o mesmo arquivo, sem rodar de novo");
    const soft = await treatVoice({ ffmpeg, source, preset: "soft", cacheRoot, model: MODEL });
    assert.notEqual(soft.path, first.path, "outro ajuste, outro arquivo");
  });

test("a voz de um MP4 cujo som começa depois da imagem mantém o tempo do arquivo", {
  timeout: 120000,
}, async () => {
  const voice = join(tmp, "fala curta.wav");
  writeWav(voice, speech(3, R, 31, 0.4), R);
  const mp4 = join(tmp, "som atrasado.mp4");
  await run(STATIC, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=160x90:r=25:d=4",
    "-itsoffset",
    "0.5",
    "-i",
    voice,
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    mp4,
  ]);
  const treated = await treatVoice({
    ffmpeg: STATIC,
    source: mp4,
    preset: "teacher",
    cacheRoot: join(tmp, "cache-mp4"),
    model: MODEL,
  });
  // The file's own sound from its second 0 (the half second of silence included).
  const original = await decodeMono(STATIC, mp4);
  const out = await decodeMono(STATIC, treated.path);
  assert.ok(Math.abs(out.length - original.length) <= 80, `${out.length} vs ${original.length}`);
  const shift = locate(original, out, { drift: false }).offset;
  assert.ok(Math.abs(shift) < 0.002, `deslocado ${shift} s`);
});

test("o cache da voz guarda até o limite, tirando antes o que foi usado há mais tempo", async () => {
  const dir = join(tmp, "cache-lru", "voz");
  const files = ["a", "b", "c"].map((name, i) => {
    const sub = join(dir, name);
    const path = join(sub, `${name}.wav`);
    mkdirSync(sub, { recursive: true });
    writeFileSync(path, Buffer.alloc(1000));
    // a is the oldest use, c the newest.
    const at = new Date(Date.now() - (3 - i) * 60_000);
    utimesSync(path, at, at);
    return path;
  });
  const removed = await pruneCache(dir, 2000, files[0]);
  // a is kept (just made), b is the oldest of the rest.
  assert.deepEqual(removed, [files[1]]);
  assert.ok(existsSync(files[0]) && existsSync(files[2]));
  assert.deepEqual(await pruneCache(dir, 5000), []);
  assert.equal(statSync(files[2]).size, 1000);
});
