import assert from "node:assert/strict";
import { test } from "node:test";
import { cursorDataFromEvents, toVideoTime } from "../src/shared/cursorCapture.ts";
import type { HookEvent } from "../src/shared/helperProtocol.ts";
import { CURSOR_SHAPES } from "../src/shared/recording.ts";

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

test("helper events become the editor's cursor.json in video seconds and region pixels", () => {
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
  const data = cursorDataFromEvents(events, segments, region, [
    { qpc: 10300, kind: "marker" },
    { qpc: 15000, kind: "retake" },
  ]);
  assert.equal(data.version, 1);
  assert.equal(data.width, 1280);
  assert.equal(data.height, 720);
  assert.deepEqual(data.moves, [
    [0.1, 100, 100, shape("arrow")],
    [0.6, 100, 100, shape("hand")],
    [0.7, 110, 110, shape("hand")],
    [2.1, 110, 110, shape("other")],
    [2.2, 200, 200, shape("other")],
    [2.4, 200, 200, shape("hidden")],
  ]);
  assert.deepEqual(data.clicks, [
    [0.2, 100, 100, 0, 0.25],
    [2.3, 200, 200, 1, 0],
  ]);
  assert.deepEqual(data.wheel, [[0.8, 110, 110, -120]]);
  assert.deepEqual(data.keys, [[0.9, "Ctrl+C"]]);
  // A marker pressed during the pause lands where the video resumes.
  assert.deepEqual(data.markers, [
    { t: 0.3, kind: "marker" },
    { t: 2, kind: "retake" },
  ]);
});
