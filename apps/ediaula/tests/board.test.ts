import assert from "node:assert/strict";
import { test } from "node:test";
import { sourceActivity } from "../src/shared/activity.ts";
import { clickSoundTimes, DEFAULT_CURSOR_FX } from "../src/shared/cursor.ts";
import { normalizeCursorData } from "../src/shared/cursorData.ts";
import {
  BOARD_COLORS,
  boardAt,
  type Drawing,
  drawingAt,
  drawingPartClips,
  drawingParts,
  drawingSpan,
  dropDrawingClicks,
  shiftDrawing,
  withBoardColor,
  withoutStroke,
} from "../src/shared/drawing.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import { drawingInTake, replayJournal } from "../src/shared/recordingJournal.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";
import { autoZooms } from "../src/shared/zoom.ts";

const q = 1_000_000;
const stroke = (at: number, x: number, extra: object = {}) => ({
  k: "draw",
  qpc: q + at,
  color: "#1D1F24",
  width: 8,
  points: [
    [x, 0.2, 0],
    [x + 0.1, 0.3, 200],
  ],
  ...extra,
});

/**
 * A take with a white board from 2 s to 8 s, a new page at 5 s and an undo at 6.5 s, read back
 * from its journal as the finished take hands it to the editor.
 */
function boardTake(): Drawing {
  const lines = [
    {
      k: "begin",
      v: 1,
      at: 0,
      qpc: q - 100,
      fps: 30,
      monitor: { x: 0, y: 0, width: 1920, height: 1080 },
      region: null,
      encoder: null,
      sources: { screen: true, microphone: null, camera: null, system: false, keys: false },
    },
    { k: "first", src: "screen", part: 0, qpc: q, file: "tela-0.mp4" },
    { k: "drawMode", qpc: q + 1500, on: true },
    { k: "drawBoard", qpc: q + 2000, on: true, kind: "white" },
    stroke(2500, 0.1),
    stroke(3500, 0.3, { tool: "arrow" }),
    { k: "drawPage", qpc: q + 5000 },
    stroke(5500, 0.5),
    stroke(6000, 0.6, { tool: "marker" }),
    { k: "drawUndo", qpc: q + 6500 },
    { k: "drawBoard", qpc: q + 8000, on: false, kind: "white" },
    { k: "drawMode", qpc: q + 9000, on: false },
    { k: "stop", qpc: q + 10000 },
  ];
  const replay = replayJournal(lines.map((l) => JSON.stringify(l)).join("\n"));
  const drawing = drawingInTake(replay, [{ start: q, duration: 10 }]);
  assert.ok(drawing);
  return drawing;
}

test("o quadro ligado e desligado vira um clipe quadro com o intervalo certo, cortado na página nova", () => {
  const d = boardTake();
  assert.deepEqual(d.boards, [{ start: 2, end: 8, color: BOARD_COLORS.white }]);
  assert.deepEqual(d.pages, [5]);
  assert.equal(d.strokes[1].tool, "arrow");
  const span = drawingSpan(d, 10);
  assert.deepEqual(span, [2, 8]);
  assert.ok(span);
  const own = shiftDrawing(d, -span[0]);
  const parts = drawingParts(own, [0, span[1] - span[0]]);
  assert.deepEqual(parts, [
    { from: 0, to: 3, kind: "board" },
    { from: 3, to: 6, kind: "board" },
  ]);
  // The take kept whole from timeline second 10: the board clips start at 12 and 15.
  let n = 0;
  const clips = drawingPartClips(
    [{ from: 0, to: 10, start: 10, screen: [] }],
    span,
    parts,
    "a",
    "t",
    () => `c${++n}`,
  );
  assert.deepEqual(
    clips.map(({ clip, kind }) => [kind, clip.start, clip.in, clip.duration]),
    [
      ["board", 12, 0, 3],
      ["board", 15, 3, 3],
    ],
  );
});

test("página nova limpa os traços e desfazer tira o último, com o quadro ainda lá", () => {
  const own = shiftDrawing(boardTake(), -2);
  // Before the new page (own second 3), the two first strokes.
  assert.equal(drawingAt(own, 2.9).length, 2);
  assert.equal(boardAt(own, 2.9)?.color, BOARD_COLORS.white);
  // After it, none of them; the board stays.
  assert.equal(drawingAt(own, 3.2).length, 0);
  assert.ok(boardAt(own, 3.2));
  // The marker at own second 4 is taken back by the undo at 4.5; the pen at 3.5 stays.
  assert.equal(drawingAt(own, 4.3).length, 2);
  assert.deepEqual(
    drawingAt(own, 4.7).map((s) => s.tool ?? "pen"),
    ["pen"],
  );
  assert.equal(boardAt(own, 6.5), null);
});

test("um desfazer depois de uma página nova não tira um traço que já tinha saído", () => {
  const replay = replayJournal(
    [
      { k: "first", src: "screen", part: 0, qpc: q, file: "tela-0.mp4" },
      stroke(1000, 0.1),
      { k: "drawClear", qpc: q + 2000 },
      { k: "drawUndo", qpc: q + 2500 },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n"),
  );
  const d = drawingInTake(replay, [{ start: q, duration: 5 }]);
  assert.equal(d?.strokes[0].until, undefined);
});

test("cliques do desenho não geram zoom, som de clique nem atividade na limpeza", () => {
  // A drag of the pen from 2 s to 3 s while drawing, and a click on the lesson at 7 s.
  const moves: [number, number, number, number][] = [];
  for (let t = 2; t <= 3; t += 0.02) moves.push([t, 300 + (t - 2) * 600, 400, 0]);
  moves.push([7, 1200, 600, 0]);
  const data = normalizeCursorData({
    version: 2,
    width: 1920,
    height: 1080,
    moves,
    clicks: [
      [2, 300, 400, 0, 1],
      [7, 1200, 600, 0, 0.05],
    ],
  });
  const drawn = dropDrawingClicks(data, [[1.5, 4]]);
  assert.deepEqual(
    drawn.clicks.map((c) => c[0]),
    [7],
  );
  assert.ok(
    autoZooms(drawn, 12).every((z) => z.start > 4),
    "no zoom on the pen",
  );
  assert.deepEqual(clickSoundTimes(drawn, { ...DEFAULT_CURSOR_FX, clickSound: true }), [7]);
  assert.ok(
    sourceActivity(drawn).every((a) => a.end < 1.5 || a.start > 4),
    JSON.stringify(sourceActivity(drawn)),
  );
  // No zoom while a board covers the screen, even for a click outside the drawing mode.
  assert.equal(
    autoZooms(data, 12, { scale: 1.8, gap: 3.5, lead: 0.9, hold: 1.8, exclude: [[6, 8]] }).some(
      (z) => z.focus.some((f) => f.t === 7),
    ),
    false,
  );
});

test("o schema aceita a aula com e sem quadro, e o editor troca a cor e apaga um traço", () => {
  const own = shiftDrawing(boardTake(), -2);
  const asset: Asset = {
    id: "a",
    name: "Desenho e quadro",
    path: "C:/cache/desenho.webm",
    kind: "video",
    duration: 6,
    width: 1920,
    height: 1080,
    fps: 30,
    hasVideo: true,
    hasAudio: false,
    size: 1,
    proxyStatus: "none",
    generated: "annotation",
    alpha: true,
  };
  const clip = (kind: "board" | "drawing", d: Drawing): Clip => ({
    id: `c-${kind}`,
    assetId: "a",
    trackId: "t",
    start: 0,
    in: 0,
    duration: 3,
    volume: 0,
    annotation: { kind, color: "#FFFFFF", drawing: d },
  });
  const project = (c: Clip): Project => ({
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [asset],
    tracks: [{ id: "t", kind: "video", name: "Faixa", muted: false, hidden: false, locked: false }],
    clips: [c],
  });
  assert.ok(projectSchema.safeParse(project(clip("board", own))).success);
  const plain: Drawing = { strokes: own.strokes.slice(0, 1), clears: [] };
  assert.ok(projectSchema.safeParse(project(clip("drawing", plain))).success);
  const black = withBoardColor(own, 1, BOARD_COLORS.black);
  assert.equal(boardAt(black, 1)?.color, BOARD_COLORS.black);
  const fewer = withoutStroke(own, 0);
  assert.equal(fewer.strokes.length, own.strokes.length - 1);
  assert.equal(drawingAt(fewer, 2.9).length, 1);
  assert.ok(projectSchema.safeParse(project(clip("board", fewer))).success);
});
