import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCursorData } from "../src/shared/cursorData.ts";
import {
  buildGuidedRun,
  cursorShapeFor,
  type GuidedLogLine,
  normalizeGuidedRun,
  parseGuidedLog,
  synthesizeCursor,
} from "../src/shared/guidedCursor.ts";
import { CURSOR_SHAPES } from "../src/shared/recording.ts";

const viewport = { width: 1280, height: 720 };
const begin: GuidedLogLine = {
  k: "begin",
  v: 1,
  planId: "plano-1",
  planName: "Blocos",
  timing: "0badc0de",
  fps: 30,
  viewport,
  from: 0,
  narrationOffset: 2.5,
  steps: [
    { index: 0, id: "a", speech: "Clique", action: "click", start: 0.5, act: 2.5, end: 4 },
    { index: 1, id: "b", speech: "Arraste", action: "drag", start: 4.5, act: 6.5, end: 9.2 },
  ],
};
/** Pointer to (300, 200), click; hold; to the block, drag it to (900, 500); a key; the wheel. */
const log: GuidedLogLine[] = [
  begin,
  { k: "move", t: 0, x: 640, y: 360 },
  { k: "step", t: 0, index: 0, status: "start" },
  { k: "glide", t: 0.5, until: 1.7, from: { x: 640, y: 360 }, to: { x: 300, y: 200 } },
  { k: "shape", t: 1.7, cursor: "pointer" },
  { k: "down", t: 2.5, x: 300, y: 200, b: 0 },
  { k: "up", t: 2.5, x: 300, y: 200, b: 0 },
  { k: "act", t: 2.5, until: 2.5, kind: "click", step: 0 },
  { k: "step", t: 4, index: 0, status: "done" },
  { k: "hold", at: 4.5, duration: 2.75, reason: "navigation", step: 1 },
  { k: "step", t: 4.5, index: 1, status: "start" },
  { k: "glide", t: 4.5, until: 5.7, from: { x: 300, y: 200 }, to: { x: 120, y: 60 } },
  { k: "shape", t: 5.7, cursor: "url(grab.cur), grab" },
  { k: "down", t: 6.5, x: 120, y: 60, b: 0 },
  { k: "glide", t: 6.5, until: 7.7, from: { x: 120, y: 60 }, to: { x: 900, y: 500 }, drag: true },
  { k: "up", t: 7.7, x: 900, y: 500, b: 0 },
  { k: "act", t: 6.5, until: 7.7, kind: "drag", step: 1 },
  { k: "key", t: 8, label: "Ctrl+Z" },
  { k: "wheel", t: 8.5, x: 900, y: 500, dx: 0, dy: 100 },
  { k: "step", t: 9.2, index: 1, status: "done" },
  { k: "end", t: 9.2, status: "done" },
];

/** Where the pointer is at `t` by the moves (the editor holds the last one). */
const pointerAt = (moves: [number, number, number, number][], t: number) =>
  [...moves].reverse().find((m) => m[0] <= t + 1e-9);

test("the pointer passes through the click point at the click's second, a move per frame", () => {
  const data = synthesizeCursor(log, viewport, 30, 9.2);
  assert.equal(data.version, 2);
  assert.equal(data.width, 1280);
  // Every click is where the pointer is at that second.
  for (const [t, x, y] of data.clicks) {
    const move = pointerAt(data.moves, t);
    assert.ok(move, `move before ${t}`);
    assert.deepEqual([move[1], move[2]], [x, y], `pointer at ${t}`);
  }
  // A move on every frame of a glide (1.2 s at 30 fps), on the frame grid.
  const gliding = data.moves.filter((m) => m[0] > 0.5 && m[0] <= 1.7 + 1e-9);
  assert.equal(gliding.length, 36);
  // Times are kept to the millisecond.
  for (const m of data.moves) assert.ok(Math.abs(m[0] * 30 - Math.round(m[0] * 30)) < 0.03);
  // The curve slows down at both ends.
  const steps = gliding.map((m, i) =>
    i ? Math.hypot(m[1] - gliding[i - 1][1], m[2] - gliding[i - 1][2]) : 0,
  );
  assert.ok(steps[1] < steps[18] && steps[34] < steps[18]);
  // A drag is a click held for its whole movement, with moves in between.
  const drag = data.clicks.find((c) => c[0] === 6.5);
  assert.deepEqual(drag, [6.5, 120, 60, 0, 1.2]);
  assert.ok(data.moves.filter((m) => m[0] > 6.5 && m[0] < 7.7).length > 30);
  assert.deepEqual(data.keys, [[8, "Ctrl+Z"]]);
  // 100 CSS pixels down is one notch of the wheel down.
  assert.deepEqual(data.wheel, [[8.5, 900, 500, -120]]);
  // Shapes come from the computed cursor: pointer and grab are drawn as the hand.
  const hand = CURSOR_SHAPES.indexOf("hand");
  assert.equal(pointerAt(data.moves, 2)?.[3], hand);
  assert.equal(pointerAt(data.moves, 0.4)?.[3], CURSOR_SHAPES.indexOf("arrow"));
  assert.equal(pointerAt(data.moves, 6)?.[3], hand);
  // The editor reads it like any recording's cursor.json.
  assert.deepEqual(normalizeCursorData(JSON.parse(JSON.stringify(data))).moves, data.moves);
});

test("holds have no moves: the video's seconds go on from where the writer stopped", () => {
  const data = synthesizeCursor(log, viewport, 30, 9.2);
  // While the writer held at 4.5 the pointer stood still: after the click, nothing until the
  // next glide starts.
  const still = data.moves.filter((m) => m[0] > 1.7 + 1e-9 && m[0] <= 4.5 + 1e-9);
  assert.deepEqual(still, [[2.5, 300, 200, CURSOR_SHAPES.indexOf("hand")]]);
  const next = data.moves.find((m) => m[0] > 4.5);
  // The glide starts slowly: its first pixel comes a frame or two after 4.5.
  assert.ok(next && next[0] <= 4.5 + 3 / 30, `next move at ${next?.[0]}`);
  // A pointer that never moves gives a single move, in the middle when nothing placed it.
  const idle = synthesizeCursor([begin], viewport, 60, 5);
  assert.deepEqual(idle.moves, [[0, 640, 360, 0]]);
});

test("guided-run.json keeps the steps, the interactions and the holds; the log survives a cut", () => {
  const run = buildGuidedRun(log, 9.2);
  assert.ok(run);
  assert.equal(run.status, "done");
  assert.deepEqual(
    run.steps.map((s) => [s.index, s.status, s.began, s.finished]),
    [
      [0, "done", 0, 4],
      [1, "done", 4.5, 9.2],
    ],
  );
  assert.deepEqual(run.actions, [
    { t: 2.5, until: 2.5, kind: "click", step: 0 },
    { t: 6.5, until: 7.7, kind: "drag", step: 1 },
  ]);
  assert.deepEqual(run.holds, [{ at: 4.5, duration: 2.75, reason: "navigation", step: 1 }]);
  assert.equal(run.narrationOffset, 2.5);
  assert.deepEqual(normalizeGuidedRun(JSON.parse(JSON.stringify(run))), run);
  assert.throws(() => normalizeGuidedRun({ version: 2 }), /gravação guiada/);

  // A crash cuts the last line in half: the rest still reads, the run counts as stopped.
  const text = log
    .filter((l) => l.k !== "end")
    .map((l) => JSON.stringify(l))
    .join("\n");
  const cut = parseGuidedLog(`${text}\n{"k":"step","t":9.3,"ind`);
  assert.equal(cut.length, log.length - 1);
  const stopped = buildGuidedRun(cut, 9.2);
  assert.equal(stopped?.status, "stopped");
  assert.equal(buildGuidedRun([], 1), null);
  const failed = buildGuidedRun(
    [begin, { k: "step", t: 4.6, index: 1, status: "failed", message: "Etapa 2: sumiu" }],
    5,
  );
  assert.deepEqual(
    failed?.steps.map((s) => s.status),
    ["pending", "failed"],
  );
  assert.equal(failed?.steps[1].message, "Etapa 2: sumiu");
});

test("computed CSS cursors map to the editor's shapes", () => {
  assert.equal(cursorShapeFor("pointer"), "hand");
  assert.equal(cursorShapeFor("grabbing"), "hand");
  assert.equal(cursorShapeFor("text"), "text");
  assert.equal(cursorShapeFor("auto", true), "text");
  assert.equal(cursorShapeFor("auto"), "arrow");
  assert.equal(cursorShapeFor("default"), "arrow");
  assert.equal(cursorShapeFor("not-allowed"), "no");
  assert.equal(cursorShapeFor("col-resize"), "ew");
  assert.equal(cursorShapeFor("none"), "hidden");
  assert.equal(cursorShapeFor('url("x.png") 4 4, pointer'), "hand");
});
