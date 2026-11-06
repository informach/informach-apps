import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clock,
  evenSplitPoints,
  invertRanges,
  keptRanges,
  keyframeAtOrBefore,
  normalizeRanges,
  piecesFromPoints,
  snapDrift,
  snapToKeyframes,
  totalDuration,
} from "../src/shared/ranges.ts";

test("normalizeRanges clamps, sorts, merges and drops empty stretches", () => {
  assert.deepEqual(
    normalizeRanges(
      [
        { start: 30, end: 20 },
        { start: -5, end: 3 },
        { start: 2, end: 6 },
        { start: 50, end: 50.01 },
        { start: 90, end: 200 },
      ],
      100,
    ),
    [
      { start: 0, end: 6 },
      { start: 20, end: 30 },
      { start: 90, end: 100 },
    ],
  );
});

test("removing marked stretches keeps the rest; keep mode keeps only them", () => {
  const marks = [
    { start: 0, end: 130 },
    { start: 900, end: 1050 },
    { start: 1900, end: 2300 },
  ];
  const removed = keptRanges(marks, "remove", 2300);
  assert.deepEqual(removed, [
    { start: 130, end: 900 },
    { start: 1050, end: 1900 },
  ]);
  // The canvas example: 38:20 minus 11:20 leaves 27:00.
  assert.equal(totalDuration(removed), 1620);
  assert.equal(clock(totalDuration(removed)), "27:00");
  assert.deepEqual(keptRanges(marks, "keep", 2300), normalizeRanges(marks, 2300));
  assert.deepEqual(keptRanges([], "remove", 10), [{ start: 0, end: 10 }]);
  assert.deepEqual(invertRanges([{ start: 0, end: 10 }], 10), []);
});

test("cuts without re-encoding start on the keyframe at or before the mark", () => {
  const keys = [0, 2, 4, 6, 8];
  assert.equal(keyframeAtOrBefore(5.9, keys), 4);
  assert.equal(keyframeAtOrBefore(6, keys), 6);
  assert.equal(keyframeAtOrBefore(-1, keys), 0);
  assert.equal(keyframeAtOrBefore(3, []), 3);
  assert.deepEqual(snapToKeyframes([{ start: 5, end: 7 }], keys), [{ start: 4, end: 7 }]);
  assert.equal(
    snapDrift(
      [
        { start: 5.5, end: 7 },
        { start: 8, end: 9 },
      ],
      keys,
    ),
    1.5,
  );
});

test("split points never leave a last piece under a second", () => {
  assert.deepEqual(evenSplitPoints(600, 300), [300]);
  assert.deepEqual(evenSplitPoints(600.5, 300), [300]);
  assert.deepEqual(evenSplitPoints(100, 300), []);
  assert.deepEqual(piecesFromPoints([300, 10, 300, 900], 600), [
    { start: 0, end: 10 },
    { start: 10, end: 300 },
    { start: 300, end: 600 },
  ]);
});

test("clock formats minutes, hours and tenths", () => {
  assert.equal(clock(724), "12:04");
  assert.equal(clock(3735), "1:02:15");
  assert.equal(clock(724.37, true), "12:04,3");
  assert.equal(clock(Number.NaN), "00:00");
});
