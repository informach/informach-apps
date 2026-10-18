import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { FRAGMENTED_MP4 } from "../src/shared/captureArgs.ts";
import { normalizeCursorData } from "../src/shared/cursorData.ts";
import {
  type Drawing,
  drawingAt,
  drawingClips,
  drawingFrameKey,
  drawingSpan,
  drawingVideoSize,
  dropDrawingClicks,
  shiftDrawing,
  thinPoints,
} from "../src/shared/drawing.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import { layoutRecording } from "../src/shared/recordingImport.ts";
import { JOURNAL_FILE, replayJournal } from "../src/shared/recordingJournal.ts";
import { redrawPlan } from "../src/shared/relink.ts";
import type { Asset, Project } from "../src/shared/types.ts";

const root = await mkdtemp(join(tmpdir(), "ediaula-drawing-"));
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "electron")
      return {
        url: `data:text/javascript,${encodeURIComponent(`export const app = { getPath: () => ${JSON.stringify(root)}, getAppPath: () => ${JSON.stringify(root)}, getVersion: () => "0.0.0-test" };`)}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const { FFMPEG, probe, run } = await import("../src/main/ffmpeg.ts");
const { finalizeTake } = await import("../src/main/recording/finalize.ts");
hooks.deregister();
after(() => rm(root, { recursive: true, force: true }));

const drawing: Drawing = {
  strokes: [
    {
      t: 1,
      color: "#FF4D4D",
      width: 8,
      points: [
        [0.1, 0.1, 0],
        [0.3, 0.1, 0.5],
        [0.3, 0.4, 1],
      ],
    },
    { t: 3, color: "#C8F031", width: 4, points: [[0.5, 0.5, 0]] },
  ],
  clears: [2.5],
};

test("o desenho aparece como foi feito e some no apagar tudo", () => {
  assert.deepEqual(drawingAt(drawing, 0.5), []);
  // Half way through the second segment, the pen is between its points.
  const mid = drawingAt(drawing, 1.75);
  assert.equal(mid.length, 1);
  assert.deepEqual(mid[0].points.at(-1), [0.3, 0.25]);
  assert.equal(drawingAt(drawing, 2.2)[0].points.length, 3);
  // "Apagar tudo" at 2.5 s: the first stroke is gone, the second shows from 3 s.
  assert.deepEqual(drawingAt(drawing, 2.6), []);
  assert.equal(drawingAt(drawing, 3.2)[0].color, "#C8F031");
  // Frames repeat while nothing changes.
  assert.equal(drawingFrameKey(drawing, 2.2), drawingFrameKey(drawing, 2.4));
  assert.notEqual(drawingFrameKey(drawing, 1.2), drawingFrameKey(drawing, 1.4));
  assert.deepEqual(drawingSpan(drawing, 10), [1, 10]);
  assert.deepEqual(
    drawingSpan({ strokes: drawing.strokes.slice(0, 1), clears: [2.5] }, 10),
    [1, 2.5],
  );
  assert.equal(drawingSpan({ strokes: [], clears: [] }, 10), null);
  assert.equal(shiftDrawing(drawing, -1).strokes[0].t, 0);
  assert.equal(
    thinPoints(
      Array.from({ length: 10 }, (_, i) => i),
      4,
    ).join(),
    "0,3,6,9",
  );
  assert.deepEqual(drawingVideoSize(3840, 2160), { width: 1920, height: 1080 });
  assert.deepEqual(drawingVideoSize(1280, 720), { width: 1280, height: 720 });
});

test("os traços vão para o diário e o finalize entrega o desenho no tempo da gravação, sem os cliques da caneta", async () => {
  const dir = join(root, "take");
  await mkdir(dir, { recursive: true });
  await run(FFMPEG, [
    ...["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=320x240:r=30:d=4"],
    ...["-c:v", "libx264", "-g", "30", "-bf", "0", ...FRAGMENTED_MP4, "-f", "mp4"],
    join(dir, "tela-0.mp4"),
  ]);
  const q = 1_000_000;
  const lines = [
    {
      k: "begin",
      v: 1,
      at: Date.now(),
      qpc: q - 500,
      fps: 30,
      monitor: { x: 0, y: 0, width: 320, height: 240 },
      region: null,
      encoder: "CPU (x264)",
      sources: { screen: true, microphone: null, camera: null, system: false, keys: false },
    },
    { k: "first", src: "screen", part: 0, qpc: q, file: "tela-0.mp4" },
    // A pause from 0.5 s to 1 s: it stays in the take's times and is cut on import.
    { k: "pause", qpc: q + 500 },
    { k: "resume", qpc: q + 1000 },
    { k: "drawMode", qpc: q + 1200, on: true },
    {
      k: "draw",
      qpc: q + 1500,
      color: "#FF4D4D",
      width: 8,
      points: [
        [0.1, 0.1, 0],
        [0.5, 0.5, 400],
      ],
    },
    { k: "drawClear", qpc: q + 2500 },
    { k: "drawMode", qpc: q + 2600, on: false },
    { k: "stop", qpc: q + 4000 },
  ];
  await writeFile(join(dir, JOURNAL_FILE), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  const replay = replayJournal(await readFile(join(dir, JOURNAL_FILE), "utf8"));
  assert.equal(replay.strokes.length, 1);
  assert.deepEqual(replay.clears, [q + 2500]);
  assert.deepEqual(replay.drawModes, [[q + 1200, q + 2600]]);
  // The helper saw the pen go down while drawing, and a real click after it.
  const helper = [
    { e: "m", t: q + 100, x: 10, y: 10 },
    { e: "d", t: q + 1500, x: 32, y: 24, b: "left" },
    { e: "u", t: q + 1900, x: 160, y: 120, b: "left" },
    { e: "d", t: q + 3000, x: 200, y: 100, b: "left" },
    { e: "u", t: q + 3050, x: 200, y: 100, b: "left" },
  ];
  await writeFile(join(dir, "cursor.jsonl"), helper.map((h) => `${JSON.stringify(h)}\n`).join(""));
  const result = await finalizeTake({ dir });
  assert.ok(result.drawing && result.cursor && result.screen);
  const [stroke] = result.drawing.strokes;
  assert.equal(stroke.t, 1.5);
  assert.deepEqual(stroke.points[1], [0.5, 0.5, 0.4]);
  assert.deepEqual(result.drawing.clears, [2.5]);
  const cursor = normalizeCursorData(JSON.parse(await readFile(result.cursor, "utf8")));
  assert.deepEqual(
    cursor.clicks.map((c) => c[0]),
    [3],
  );
  // Import: the drawing clip over the screen, from its first stroke to its clear, and the project
  // with it is valid.
  const screen: Asset = {
    id: "screen",
    name: "Tela",
    path: result.screen,
    kind: "video",
    duration: (await probe(result.screen)).duration,
    width: 320,
    height: 240,
    fps: 30,
    hasVideo: true,
    hasAudio: false,
    size: 1,
    proxyStatus: "none",
  };
  const layout = layoutRecording({ tracks: [], clips: [] }, [screen], result);
  const span = drawingSpan(result.drawing, result.duration);
  assert.deepEqual(span, [1.5, 2.5]);
  assert.ok(span);
  let n = 0;
  const clips = drawingClips(layout.pieces, span, "drawing", "t-draw", () => `c${++n}`);
  assert.equal(clips.length, 1);
  assert.equal(clips[0].in, 0);
  assert.equal(clips[0].duration, 1);
  assert.equal(clips[0].start, layout.pieces[1].start + 0.5);
  const own = shiftDrawing(result.drawing, -span[0]);
  const asset: Asset = {
    ...screen,
    id: "drawing",
    name: "Desenho",
    path: join(root, "desenho.webm"),
    duration: 1,
    generated: "annotation",
    alpha: true,
  };
  const project: Project = {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [screen, asset],
    tracks: [
      { id: "t-draw", kind: "video", name: "Faixa 2", muted: false, hidden: false, locked: false },
      ...layout.tracks,
    ],
    clips: [
      ...layout.clips,
      ...clips.map((c) => ({
        ...c,
        annotation: { kind: "drawing" as const, color: "#FF4D4D", drawing: own },
      })),
    ],
  };
  projectSchema.parse(project);
  // A video that went missing is drawn again from the clip's strokes.
  assert.deepEqual(redrawPlan(project, asset), { how: "drawing", drawing: own });
});

test("só os cliques dentro do modo desenho caem", () => {
  const data = normalizeCursorData({
    version: 2,
    width: 100,
    height: 100,
    moves: [],
    clicks: [
      [1, 0, 0, 0, 0],
      [2, 0, 0, 0, 0],
      [5, 0, 0, 0, 0],
    ],
  });
  assert.deepEqual(
    dropDrawingClicks(data, [[1.5, 3]]).clicks.map((c) => c[0]),
    [1, 5],
  );
  assert.equal(dropDrawingClicks(data, []), data);
});
