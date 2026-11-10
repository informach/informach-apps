import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import {
  cutNarrationArgs,
  existingTranscript,
  lessonWords,
  mixNarrationArgs,
  type VoiceClip,
} from "../../src/main/pipelineMedia";
import { lessonScreen, stretchVideoArgs } from "../../src/main/pipelineVideo";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
/** The suite's FFmpeg in CI (test-media.mts passes it), the development one otherwise. */
const ffmpeg = process.env.FFMPEG_BIN ?? (require("ffmpeg-static") as string);
const ffprobe =
  process.env.FFPROBE_BIN ?? (require("@derhuerst/ffprobe-static") as { path: string }).path;

let dir = "";
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "edisvg-pipeline-"));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A sine of `seconds` at `hz` into `name`. */
async function tone(name: string, seconds: number, hz: number): Promise<string> {
  const out = join(dir, name);
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${hz}:sample_rate=48000:duration=${seconds}`,
    out,
  ]);
  return out;
}

async function duration(file: string): Promise<number> {
  const { stdout } = await run(ffprobe, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]);
  return Number(stdout.trim());
}

/** RMS level (dB) of [from, to) of a WAV, to tell sound from silence. */
async function level(file: string, from: number, to: number): Promise<number> {
  const { stderr } = await run(ffmpeg, [
    "-v",
    "info",
    "-ss",
    String(from),
    "-to",
    String(to),
    "-i",
    file,
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);
  return Number(/mean_volume:\s*(-?[\d.]+|-inf)/.exec(stderr)?.[1] ?? "-inf");
}

test("an EdiAula lesson: words on the lesson's clock, only from what sounds, at the clip's speed", async () => {
  const voice = await tone("narracao.wav", 20, 440);
  const transcript = join(dir, "narracao-transcricao.json");
  await writeFile(
    transcript,
    JSON.stringify({
      words: [
        { text: "Abra", start: 2, end: 2.4, p: 0.9 },
        { text: "a", start: 2.5, end: 2.6, p: 0.9 },
        { text: "aba.", start: 2.7, end: 3, p: 0.9 },
        { text: "Obrigado", start: 4, end: 4.5, p: 0.2, dropped: "credit" },
        { text: "Depois,", start: 12, end: 12.5, p: 0.9 },
        { text: "arraste.", start: 13, end: 13.6, p: 0.9 },
      ],
    }),
  );
  const lesson = join(dir, "aula.ediaula");
  await writeFile(
    lesson,
    JSON.stringify({
      version: 1,
      assets: [
        { id: "v", path: voice, transcript, transcriptStatus: "ready", hasAudio: true },
        { id: "m", path: voice, transcript, transcriptStatus: "ready", hasAudio: true },
        // A lesson points anywhere: a URL or a network share is never read nor given to FFmpeg.
        {
          id: "url",
          path: "https://exemplo.invalid/voz.wav",
          transcript,
          transcriptStatus: "ready",
        },
        {
          id: "rede",
          path: voice,
          transcript: "\\\\servidor\\aula\\t.json",
          transcriptStatus: "ready",
        },
      ],
      tracks: [
        { id: "voz", muted: false },
        { id: "calada", muted: true },
        { id: "trilha", music: true },
      ],
      clips: [
        // Source 0–10 at lesson 100, then source 10–20 at twice the speed from lesson 110.
        { assetId: "v", trackId: "voz", start: 100, in: 0, duration: 10, volume: 1 },
        { assetId: "v", trackId: "voz", start: 110, in: 10, duration: 5, speed: 2, volume: 1 },
        // The same voice on a muted track: not heard, so not its words.
        { assetId: "m", trackId: "calada", start: 0, in: 0, duration: 20, volume: 1 },
        { assetId: "url", trackId: "voz", start: 300, in: 0, duration: 20, volume: 1 },
        { assetId: "rede", trackId: "voz", start: 400, in: 0, duration: 20, volume: 1 },
        // On the music track, and silenced for another voice: no one speaking, as in EdiAula.
        { assetId: "m", trackId: "trilha", start: 0, in: 0, duration: 20, volume: 1 },
        {
          assetId: "m",
          trackId: "voz",
          start: 200,
          in: 0,
          duration: 20,
          volume: 1,
          mutedFor: { by: "personagem" },
        },
      ],
    }),
  );
  const { words, voices } = await lessonWords(lesson);
  assert.deepEqual(
    words.map((w) => [w.text, Number(w.start.toFixed(2))]),
    [
      ["Abra", 102],
      ["a", 102.5],
      ["aba.", 102.7],
      ["Depois,", 111],
      ["arraste.", 111.5],
    ],
  );
  // The voice whose transcript is on a network share still sounds (its audio is a file here):
  // it plays in the narration, but its words are not read.
  assert.equal(voices.length, 3);

  // The narration of lesson 101–113: the first clip from its second 1, the sped-up one after it.
  const out = join(dir, "narracao-trecho.wav");
  const args = mixNarrationArgs(voices, 101, 113, out);
  assert.ok(args);
  await run(ffmpeg, args);
  assert.ok(Math.abs((await duration(out)) - 12) < 0.05, "12 s long");
  assert.ok((await level(out, 1, 8)) > -30, "the voice is heard");
  // Nothing is mixed where no clip sounds.
  assert.equal(mixNarrationArgs(voices, 200, 210, out), null);
});

test("an audio file: the stretch is cut to a small mono WAV for the preview", async () => {
  const lessonAudio = await tone("aula-inteira.wav", 30, 330);
  const out = join(dir, "corte.wav");
  await run(ffmpeg, cutNarrationArgs(lessonAudio, 10.25, 17.75, out));
  assert.ok(Math.abs((await duration(out)) - 7.5) < 0.05, "7.5 s long");
  const { stdout } = await run(ffprobe, [
    "-v",
    "error",
    "-show_entries",
    "stream=sample_rate,channels,codec_name",
    "-of",
    "csv=p=0",
    out,
  ]);
  assert.equal(stdout.trim(), "pcm_s16le,22050,1");
  assert.throws(() => cutNarrationArgs(lessonAudio, 5, 5, out), /Trecho de narração inválido/);
});

test("a transcript EdiAula made of the file is read, whatever glossary it used", async () => {
  const cache = join(dir, "cache-aula");
  await mkdir(cache, { recursive: true });
  assert.equal(existingTranscript(cache), null);
  await writeFile(join(cache, "transcript-large-v3-turbo-pt-1a2b3c4d-vad-b1.json"), "{}");
  await writeFile(join(cache, "transcript-small-en-b1.json"), "{}");
  await writeFile(join(cache, "speech16k-temp.wav"), "");
  assert.equal(
    existingTranscript(cache),
    join(cache, "transcript-large-v3-turbo-pt-1a2b3c4d-vad-b1.json"),
  );
});

test("a lesson package's voice without a transcript is heard; the page's sound is not speech", async () => {
  const voice = await tone("pacote-narracao.wav", 10, 440);
  const page = await tone("pacote-som-da-pagina.wav", 10, 880);
  const lesson = join(dir, "pacote.ediaula");
  await writeFile(
    lesson,
    JSON.stringify({
      assets: [
        { id: "n", path: voice, hasAudio: true, recording: { role: "narration" } },
        { id: "p", path: page, hasAudio: true, recording: { role: "system" } },
      ],
      tracks: [{ id: "narracao" }, { id: "pagina", name: "Som da página" }],
      clips: [
        { assetId: "n", trackId: "narracao", start: 60, in: 2, duration: 8 },
        { assetId: "p", trackId: "pagina", start: 60, in: 0, duration: 10 },
      ],
    }),
  );
  const asked: string[][] = [];
  const { words, voices } = await lessonWords(lesson, async (paths) => {
    asked.push([...paths]);
    return new Map([
      [
        voice,
        [
          { text: "Antes", start: 1, end: 1.5 },
          { text: "Abra", start: 3, end: 3.4, p: 0.8 },
          { text: "aqui.", start: 3.5, end: 3.9, dropped: "repeat" },
        ],
      ],
    ]);
  });
  assert.deepEqual(asked, [[voice]], "only the narration is heard");
  // Source second 3 of a clip from second 2 at lesson 60; before the clip's in, not heard.
  assert.deepEqual(words, [{ text: "Abra", start: 61, end: 61.4, p: 0.8 }]);
  assert.deepEqual(
    voices.map((v) => v.path),
    [voice],
  );
  await assert.rejects(
    lessonWords(lesson, async () => new Map()),
    /Não ouvi fala nas faixas de voz da aula/,
  );
});

/** The colour of one pixel of `file` at `at` seconds, as [r, g, b]. */
async function pixel(file: string, at: number, x: number, y: number): Promise<number[]> {
  const { stdout } = await run(
    ffmpeg,
    [
      "-v",
      "error",
      "-ss",
      String(at),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      // 2×2: a 1×1 crop of 4:2:0 video cannot keep its colour.
      `crop=2:2:${x}:${y},format=rgb24`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { encoding: "buffer" },
  );
  return [...stdout.subarray(0, 3)];
}

/** A plain colour video of `seconds` at `size` into `name`. */
async function colourVideo(name: string, color: string, size: string, seconds: number) {
  const out = join(dir, name);
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=${size}:r=30:d=${seconds}`,
    "-pix_fmt",
    "yuv420p",
    out,
  ]);
  return out;
}

test("the screen of a lesson's stretch is one video with its cuts, gaps and speed", async () => {
  const red = await colourVideo("tela-vermelha.mp4", "red", "320x180", 12);
  const blue = await colourVideo("tela-azul.mp4", "blue", "180x180", 10);
  const lesson = join(dir, "tela.ediaula");
  await writeFile(
    lesson,
    JSON.stringify({
      settings: { fps: 30 },
      assets: [
        { id: "r", path: red, width: 320, height: 180, recording: { role: "screen" } },
        { id: "b", path: blue, width: 180, height: 180, recording: { role: "screen" } },
      ],
      tracks: [{ id: "v" }],
      clips: [
        { assetId: "r", trackId: "v", start: 0, in: 0, duration: 4 },
        { assetId: "r", trackId: "v", start: 4, in: 6, duration: 2 },
        // Nothing at 6–7; then a square recording at twice the speed.
        { assetId: "b", trackId: "v", start: 7, in: 0, duration: 4, speed: 2 },
      ],
    }),
  );
  const screen = await lessonScreen(lesson, 1, 10);
  const out = join(dir, "trecho-da-tela.mp4");
  await run(ffmpeg, stretchVideoArgs(screen, out));
  assert.ok(Math.abs((await duration(out)) - 9) < 0.1, `9 s long, not ${await duration(out)}`);
  const near = (got: number[], want: number[]) =>
    got.every((v, i) => Math.abs(v - (want[i] ?? 0)) < 40);
  const at = async (t: number, x: number, want: number[]) => {
    const got = await pixel(out, t, x, 90);
    assert.ok(near(got, want), `${t} s, x ${x}: ${got}`);
  };
  await at(0.5, 160, [255, 0, 0]);
  await at(4, 160, [255, 0, 0]);
  await at(5.5, 160, [0, 0, 0]);
  // The square recording centred, black at the sides.
  await at(7.5, 160, [0, 0, 255]);
  await at(7.5, 10, [0, 0, 0]);
});

test("a voice clip at an unusual speed chains tempo stages", () => {
  const voices: VoiceClip[] = [{ path: "x.wav", start: 0, in: 0, duration: 10, speed: 5 }];
  const args = mixNarrationArgs(voices, 0, 2, "out.wav") ?? [];
  const graph = args[args.indexOf("-filter_complex") + 1] ?? "";
  assert.match(graph, /atempo=2,atempo=2,atempo=1\.250000/);
});
