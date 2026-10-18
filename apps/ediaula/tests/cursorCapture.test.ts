import assert from "node:assert/strict";
import { test } from "node:test";
import { insideSegments, mergeHookEvents, toVideoTime } from "../src/shared/cursorCapture.ts";
import { buildCursorData } from "../src/shared/cursorData.ts";
import type { HookEvent } from "../src/shared/helperProtocol.ts";
import { CURSOR_SHAPES } from "../src/shared/recording.ts";

/** The journal of a take paused between the two segments, with these markers. */
const journal = (markers: { qpc: number; kind: "marker" | "retake" }[]) => ({
  markers,
  pauses: [] as [number, number][],
  failures: [],
});

// Two segments: 0-2 s of video from QPC 10 000 ms, then a pause, then 2-3 s from QPC 20 000 ms.
const segments = [
  { start: 10000, duration: 2 },
  { start: 20000, duration: 1 },
];
const region = { x: 100, y: 50, width: 1280, height: 720 };
const shape = (name: (typeof CURSOR_SHAPES)[number]) => CURSOR_SHAPES.indexOf(name);

test("QPC times map across segments and pauses map to nothing", () => {
  assert.equal(toVideoTime(segments, 10500), 0.5);
  assert.equal(toVideoTime(segments, 20250), 2.25);
  assert.equal(toVideoTime(segments, 15000), -1);
  assert.equal(toVideoTime(segments, 9000), -1);
});

test("helper events become the editor's cursor.json (v2) in video seconds and region pixels", () => {
  const events: HookEvent[] = [
    { e: "ready", t: 9000, pid: 1, v: "0.1.0", keys: true },
    {
      e: "img",
      id: "hand",
      hash: "0123456789abcdef",
      w: 32,
      h: 32,
      hx: 8,
      hy: 0,
      file: "cursors/0123456789abcdef.png",
      std: "hand",
      inv: 0,
    },
    {
      e: "img",
      id: "fedcba9876543210",
      hash: "fedcba9876543210",
      w: 32,
      h: 32,
      hx: 0,
      hy: 0,
      file: "cursors/fedcba9876543210.png",
      std: null,
      inv: 0,
    },
    { e: "c", t: 9500, id: "arrow" },
    { e: "m", t: 10100, x: 200, y: 150 },
    { e: "d", t: 10200, x: 200, y: 150, b: "left" },
    { e: "u", t: 10450, x: 200, y: 150, b: "left" },
    // The app switches to its own copy of the hand while the pointer rests.
    { e: "c", t: 10600, id: "hand" },
    { e: "m", t: 10700, x: 210, y: 160, inj: true },
    { e: "w", t: 10800, x: 210, y: 160, d: -120 },
    { e: "w", t: 10810, x: 210, y: 160, d: 120, h: true },
    { e: "k", t: 10900, vk: 67, m: "1000" },
    // During the pause: dropped.
    { e: "m", t: 15000, x: 900, y: 900 },
    { e: "d", t: 15100, x: 900, y: 900, b: "right" },
    { e: "c", t: 20100, id: "fedcba9876543210" },
    { e: "m", t: 20200, x: 300, y: 250, src: "p" },
    { e: "d", t: 20300, x: 300, y: 250, b: "right" },
    { e: "c", t: 20400, id: "hidden" },
    { e: "health", t: 20500, hook: "dead" },
  ];
  const data = buildCursorData(
    events,
    journal([
      { qpc: 10300, kind: "marker" },
      { qpc: 15000, kind: "retake" },
    ]),
    segments,
    region,
  );
  assert.equal(data.version, 2);
  assert.equal(data.width, 1280);
  assert.equal(data.height, 720);
  assert.deepEqual(data.moves, [
    [0.1, 100, 100, shape("arrow")],
    [0.6, 100, 100, shape("hand")],
    [0.7, 110, 110, shape("hand")],
    // The app's own image comes after the standard shapes.
    [2.1, 110, 110, CURSOR_SHAPES.length],
    [2.2, 200, 200, CURSOR_SHAPES.length],
    [2.4, 200, 200, shape("hidden")],
  ]);
  assert.deepEqual(data.clicks, [
    [0.2, 100, 100, 0, 0.25],
    [2.3, 200, 200, 1, 0],
  ]);
  assert.deepEqual(data.wheel, [[0.8, 110, 110, -120]]);
  assert.deepEqual(data.keys, [[0.9, "Ctrl+C"]]);
  // The standard hand keeps its saved image; the app's own cursor gets a shape of its own.
  assert.equal(data.shapes[shape("hand")].image, "cursors/0123456789abcdef.png");
  assert.deepEqual(data.shapes[CURSOR_SHAPES.length], {
    id: "fedcba9876543210",
    image: "cursors/fedcba9876543210.png",
    w: 32,
    h: 32,
    hotX: 0,
    hotY: 0,
  });
  // A marker pressed during the pause lands where the video resumes.
  assert.deepEqual(data.markers, [
    { t: 0.3, kind: "marker" },
    { t: 2, kind: "retake" },
  ]);
});

test("memory and journal merge into one stream without repeats, in time order", () => {
  const img: HookEvent = {
    e: "img",
    id: "hand",
    hash: "0123456789abcdef",
    w: 32,
    h: 32,
    hx: 8,
    hy: 0,
    file: null,
    std: "hand",
    inv: 0,
  };
  const memory: HookEvent[] = [
    { e: "m", t: 10100, x: 1, y: 1 },
    { e: "m", t: 10300, x: 3, y: 3 },
  ];
  // The journal also has what memory missed while the helper was replaced.
  const journal: HookEvent[] = [
    img,
    { e: "m", t: 10100, x: 1, y: 1 },
    { e: "d", t: 10200, x: 2, y: 2, b: "left" },
    { e: "m", t: 10300, x: 3, y: 3 },
  ];
  assert.deepEqual(mergeHookEvents(memory, journal), [
    img,
    { e: "m", t: 10100, x: 1, y: 1 },
    { e: "d", t: 10200, x: 2, y: 2, b: "left" },
    { e: "m", t: 10300, x: 3, y: 3 },
  ]);
  const data = buildCursorData(
    mergeHookEvents(memory, journal),
    { markers: [], pauses: [], failures: [] },
    segments,
    region,
  );
  assert.equal(data.clicks.length, 1);
});

test("the journal keeps only what happened inside the segments, plus the cursor images", () => {
  assert.equal(insideSegments({ e: "k", t: 10500, vk: 67, m: "1000" }, segments), true);
  assert.equal(insideSegments({ e: "k", t: 15000, vk: 67, m: "1000" }, segments), false);
  assert.equal(
    insideSegments({ e: "ready", t: 9000, pid: 1, v: "x", keys: true }, segments),
    false,
  );
  assert.equal(
    insideSegments(
      {
        e: "img",
        id: "x",
        hash: "0123456789abcdef",
        w: 1,
        h: 1,
        hx: 0,
        hy: 0,
        file: null,
        std: null,
        inv: 0,
      },
      segments,
    ),
    true,
  );
});
