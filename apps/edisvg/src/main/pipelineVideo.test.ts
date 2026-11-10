import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  lessonScreen,
  stretchClicks,
  stretchCursorFile,
  stretchVideoArgs,
} from "./pipelineVideo.ts";

let dir = "";
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "edisvg-tela-"));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("the screen of a stretch follows the lesson's cuts, the upper track, gaps and speed", async () => {
  const a = join(dir, "a-tela.mp4");
  const b = join(dir, "b-tela.mp4");
  const c = join(dir, "c-tela.mp4");
  const cursorA = join(dir, "a-cursor.json");
  const cursorB = join(dir, "b-cursor.json");
  // Clicks in the recording's seconds and the cursor data's pixels ([t, x, y, button, held]).
  await writeFile(
    cursorA,
    JSON.stringify({
      width: 1920,
      height: 1080,
      clicks: [
        [2.5, 960, 540, 0, 0.1],
        // Under the upper track at that moment, and in the part the cut left out: not seen.
        [4, 10, 10, 0, 0.1],
        [11, 10, 10, 0, 0.1],
        [13, 100, 200, 0, 0.1],
      ],
    }),
  );
  // A square recording: letterboxed into the 1920×1080 frame.
  await writeFile(
    cursorB,
    JSON.stringify({ width: 1080, height: 1080, clicks: [[4, 540, 540, 0, 0]] }),
  );
  const lesson = join(dir, "aula.ediaula");
  await writeFile(
    lesson,
    JSON.stringify({
      settings: { fps: 30 },
      assets: [
        {
          id: "a",
          path: a,
          width: 1920,
          height: 1080,
          cursor: cursorA,
          recording: { role: "screen" },
        },
        {
          id: "b",
          path: b,
          width: 1080,
          height: 1080,
          cursor: cursorB,
          recording: { role: "screen" },
        },
        { id: "c", path: c, width: 1920, height: 1080, recording: { role: "screen" } },
        // A camera on the timeline is not the screen.
        { id: "cam", path: join(dir, "camera.mp4"), width: 640, height: 480, hasVideo: true },
        {
          id: "url",
          path: "https://exemplo.invalid/t.mp4",
          width: 1920,
          height: 1080,
          recording: { role: "screen" },
        },
      ],
      tracks: [{ id: "cima" }, { id: "baixo" }, { id: "oculta", hidden: true }],
      clips: [
        { assetId: "a", trackId: "baixo", start: 0, in: 0, duration: 10 },
        // A cut: source 10–12 left out.
        { assetId: "a", trackId: "baixo", start: 10, in: 12, duration: 5 },
        { assetId: "c", trackId: "cima", start: 3, in: 0, duration: 2 },
        { assetId: "b", trackId: "baixo", start: 17, in: 0, duration: 10, speed: 2 },
        { assetId: "cam", trackId: "cima", start: 0, in: 0, duration: 30 },
        { assetId: "c", trackId: "oculta", start: 15, in: 0, duration: 2 },
        { assetId: "url", trackId: "cima", start: 15, in: 0, duration: 2 },
      ],
    }),
  );
  const screen = await lessonScreen(lesson, 2, 20);
  assert.equal(screen.width, 1920);
  assert.equal(screen.height, 1080);
  assert.equal(screen.fps, 30);
  assert.deepEqual(
    screen.pieces.map((p) => [p.at, p.duration, p.source?.path ?? null, p.source?.in ?? null]),
    [
      [0, 1, a, 2],
      [1, 2, c, 0],
      [3, 5, a, 5],
      [8, 5, a, 12],
      // Nothing plays 15–17 (the hidden track and a URL do not count): black.
      [13, 2, null, null],
      [15, 3, b, 0],
    ],
  );
  assert.deepEqual(await stretchClicks(screen), [
    { t: 0.5, x: 960, y: 540 },
    { t: 9, x: 100, y: 200 },
    // Source second 4 at twice the speed from lesson 17; the square recording centred.
    { t: 17, x: 960, y: 540 },
  ]);

  const args = stretchVideoArgs(screen, join(dir, "trecho.mp4"));
  const graph = args[args.indexOf("-filter_complex") + 1] ?? "";
  assert.equal(args.filter((arg) => arg === "-i").length, 5, "one input per recorded piece");
  assert.match(graph, /color=c=black:s=1920x1080:r=30:d=2\.000/);
  assert.match(graph, /setpts=\(PTS-STARTPTS\)\/2\.000000/);
  assert.match(graph, /concat=n=6:v=1:a=0\[out\]/);
  // Inputs are files only, read from their second for their length (at speed 2, twice as long).
  assert.deepEqual(args.slice(args.indexOf(b) - 7, args.indexOf(b) + 1), [
    "-ss",
    "0.000",
    "-t",
    "6.000",
    "-protocol_whitelist",
    "file,pipe",
    "-i",
    b,
  ]);

  const cursor = stretchCursorFile(join(dir, "trecho.mp4"), screen, await stretchClicks(screen));
  assert.equal(cursor.path, join(dir, "trecho-cursor.json"));
  assert.deepEqual(JSON.parse(cursor.text).clicks[0], [0.5, 960, 540]);
});

test("a stretch with no screen recording says so", async () => {
  const lesson = join(dir, "so-voz.ediaula");
  await writeFile(
    lesson,
    JSON.stringify({
      assets: [{ id: "v", path: join(dir, "voz.wav"), hasVideo: false }],
      tracks: [{ id: "t" }],
      clips: [{ assetId: "v", trackId: "t", start: 0, in: 0, duration: 10 }],
    }),
  );
  await assert.rejects(lessonScreen(lesson, 0, 5), /não tem gravação de tela nesse trecho/);
  await assert.rejects(lessonScreen(lesson, 5, 5), /Trecho de vídeo inválido/);
});
