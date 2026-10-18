import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTrack, cursorAt, DEFAULT_CURSOR_FX } from "../src/shared/cursor.ts";
import {
  buildCursorData,
  cursorDataForPart,
  MAX_CURSOR_SHAPES,
  normalizeCursorData,
  shapeName,
} from "../src/shared/cursorData.ts";
import type { HookEvent } from "../src/shared/helperProtocol.ts";
import { CURSOR_SHAPES } from "../src/shared/recording.ts";

const segments = [{ start: 10000, duration: 5 }];
const region = { x: 0, y: 0, width: 1280, height: 720 };
const none = { markers: [], pauses: [], failures: [] };

const image = (id: string, std: string | null = null): HookEvent => ({
  e: "img",
  id,
  hash: id.padEnd(16, "0").slice(0, 16),
  w: 32,
  h: 32,
  hx: 4,
  hy: 2,
  file: `cursors/${id.padEnd(16, "0").slice(0, 16)}.png`,
  std,
  inv: 0,
});

test("a version 1 file reads as version 2, and anything else is refused", () => {
  const v1 = {
    version: 1,
    width: 1920,
    height: 1080,
    moves: [[0, 10, 20, 4]],
    clicks: [[1, 10, 20, 0, 0.1]],
    wheel: [],
    markers: [{ t: 2, kind: "retake" }],
  };
  const data = normalizeCursorData(v1);
  assert.equal(data.version, 2);
  assert.equal(data.shapes.length, CURSOR_SHAPES.length);
  assert.deepEqual(
    data.shapes.map((s) => s.id),
    [...CURSOR_SHAPES],
  );
  assert.deepEqual(data.moves, v1.moves);
  assert.deepEqual(data.markers, [{ t: 2, kind: "retake" }]);
  assert.deepEqual([data.keys, data.pauses, data.hidden, data.gaps], [[], [], [], []]);
  assert.equal(shapeName(data, 4), "hand");
  for (const bad of [
    null,
    {},
    { version: 3, width: 1, height: 1, moves: [], clicks: [] },
    { ...v1, moves: [[0, "x", 1, 0]] },
  ])
    assert.throws(() => normalizeCursorData(bad), /cursor/);
});

test("images of the take come after the standard shapes, up to the limit; old readers see the standard ones", () => {
  const raw = {
    version: 2,
    width: 100,
    height: 100,
    shapes: [
      ...CURSOR_SHAPES.map((id) => ({ id, std: id, w: 0, h: 0, hotX: 0, hotY: 0 })),
      { id: "drag", std: "move", image: "cursors/a.png", w: 32, h: 32, hotX: 1, hotY: 1 },
      { id: "custom", image: "cursors/b.png", w: 16, h: 16, hotX: 0, hotY: 0, inverted: true },
    ],
    moves: [
      [0, 1, 1, CURSOR_SHAPES.length],
      [1, 2, 2, CURSOR_SHAPES.length + 1],
    ],
    clicks: [],
    pauses: [[3, 4]],
    hidden: [[1, 2]],
    gaps: [[5, 6]],
  };
  const data = normalizeCursorData(raw);
  assert.equal(shapeName(data, CURSOR_SHAPES.length), "move");
  assert.equal(shapeName(data, CURSOR_SHAPES.length + 1), "other");
  assert.equal(data.shapes[CURSOR_SHAPES.length + 1].inverted, true);
  assert.deepEqual([data.pauses, data.hidden, data.gaps], [[[3, 4]], [[1, 2]], [[5, 6]]]);
  // The editor draws the images as the shape they resemble, for now.
  const track = buildTrack(data, { ...DEFAULT_CURSOR_FX, smooth: 0 }, 2);
  assert.equal(cursorAt(track, 0.5).shape, "move");
  assert.equal(cursorAt(track, 1.5).shape, "other");

  const many: HookEvent[] = Array.from({ length: 300 }, (_, i) =>
    image(`c${String(i).padStart(3, "0")}`),
  );
  const built = buildCursorData(
    [...many, { e: "c", t: 10100, id: "c299" }, { e: "m", t: 10200, x: 5, y: 5 }],
    none,
    segments,
    region,
  );
  assert.equal(built.shapes.length, MAX_CURSOR_SHAPES);
  // A shape past the limit is drawn as "other".
  assert.deepEqual(built.moves, [[0.2, 5, 5, CURSOR_SHAPES.indexOf("other")]]);
});

test("over the recorder's controls the pointer stays where it was and the clicks there are dropped", () => {
  const events: HookEvent[] = [
    { e: "m", t: 10500, x: 100, y: 100 },
    { e: "m", t: 11000, x: 900, y: 650, ui: true },
    { e: "d", t: 11100, x: 900, y: 650, b: "left", ui: true },
    { e: "u", t: 11150, x: 900, y: 650, b: "left", ui: true },
    { e: "w", t: 11200, x: 900, y: 650, d: 120, ui: true },
    { e: "m", t: 12000, x: 120, y: 110 },
    { e: "d", t: 12500, x: 120, y: 110, b: "left" },
    { e: "u", t: 12600, x: 120, y: 110, b: "left" },
    { e: "m", t: 14000, x: 1000, y: 700, ui: true },
  ];
  const data = buildCursorData(events, none, segments, region);
  assert.deepEqual(data.moves, [
    [0.5, 100, 100, 0],
    [2, 120, 110, 0],
  ]);
  assert.deepEqual(data.clicks, [[2.5, 120, 110, 0, 0.1]]);
  assert.deepEqual(data.wheel, []);
  // Until the pointer came back, and from when it went there again to the end of the take.
  assert.deepEqual(data.hidden, [
    [1, 2],
    [4, 5],
  ]);
  const track = buildTrack(data, { ...DEFAULT_CURSOR_FX, smooth: 0 }, 5);
  assert.deepEqual([cursorAt(track, 1.5).x, cursorAt(track, 1.5).y], [100, 100]);
});

test("the helper's silences, restarts and failure become gaps; pauses and markers come from the journal", () => {
  const beats = (from: number, to: number): HookEvent[] =>
    Array.from({ length: Math.floor((to - from) / 500) + 1 }, (_, i) => ({
      e: "hb",
      t: from + i * 500,
      q: 0,
      drop: 0,
      hook: "ok",
      re: 0,
      out: 0,
      jq: 0,
    }));
  // Heartbeats until 1 s into the take, nothing for 3 s, then a new helper.
  const events: HookEvent[] = [
    ...beats(9500, 11000),
    { e: "ready", t: 14000, pid: 2, v: "x", keys: false },
    ...beats(14000, 15000),
  ];
  const data = buildCursorData(
    events,
    { markers: [{ qpc: 12000, kind: "marker" }], pauses: [[13000, 13500]], failures: [] },
    segments,
    region,
  );
  assert.deepEqual(data.gaps, [[1, 4]]);
  assert.deepEqual(data.pauses, [[3, 3.5]]);
  assert.deepEqual(data.markers, [{ t: 2, kind: "marker" }]);

  // Without heartbeats (the journal was not readable), the restart still shows.
  const memory = buildCursorData(
    [
      { e: "ready", t: 9000, pid: 1, v: "x", keys: false },
      { e: "m", t: 11000, x: 1, y: 1 },
      { e: "ready", t: 13000, pid: 2, v: "x", keys: false },
    ],
    none,
    segments,
    region,
  );
  assert.deepEqual(memory.gaps, [[1, 3]]);
  // The helper stopped for good at 2 s.
  const failed = buildCursorData(
    [],
    { markers: [], pauses: [], failures: [{ src: "cursor", qpc: 12000, message: "parou" }] },
    segments,
    region,
  );
  assert.deepEqual(failed.gaps, [[2, 5]]);
});

test("a part of a take gets its own stretch of the cursor data, in its own seconds", () => {
  const data = normalizeCursorData({
    version: 2,
    width: 10,
    height: 10,
    moves: [
      [1, 1, 1, 0],
      [5, 2, 2, 0],
    ],
    clicks: [[5.5, 2, 2, 0, 0.1]],
    keys: [[6, "Ctrl+C"]],
    markers: [{ t: 4.5, kind: "marker" }],
    pauses: [[3, 5]],
    hidden: [],
    gaps: [],
  });
  const part = cursorDataForPart(data, 4, 3);
  assert.deepEqual(part.moves, [[1, 2, 2, 0]]);
  assert.deepEqual(part.clicks, [[1.5, 2, 2, 0, 0.1]]);
  assert.deepEqual(part.keys, [[2, "Ctrl+C"]]);
  assert.deepEqual(part.markers, [{ t: 0.5, kind: "marker" }]);
  assert.deepEqual(part.pauses, [[0, 1]]);
});
