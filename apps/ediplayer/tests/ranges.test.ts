import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clock,
  evenSplitPoints,
  invertRanges,
  isPartRemoved,
  keptRanges,
  keyframeAtOrBefore,
  moveCut,
  normalizeRanges,
  piecesFromPoints,
  type Range,
  setPartRemoved,
  snapDrift,
  snapToKeyframes,
  startsOffKeyframes,
  subtractRange,
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

test("deleting parts made by Dividir keeps the rest, in either mode", () => {
  const [a, b, c] = piecesFromPoints([10, 20], 30) as [Range, Range, Range];
  // Remover marcados: the part becomes a removed stretch, merged with what was marked.
  const removed = setPartRemoved(b, true, [{ start: 2, end: 4 }], "remove", 30);
  assert.deepEqual(removed, [
    { start: 2, end: 4 },
    { start: 10, end: 20 },
  ]);
  assert.equal(isPartRemoved(b, removed ?? [], "remove", 30), true);
  assert.equal(isPartRemoved(a, removed ?? [], "remove", 30), false);
  // Bringing it back leaves the earlier mark alone.
  assert.deepEqual(setPartRemoved(b, false, removed ?? [], "remove", 30), [{ start: 2, end: 4 }]);
  // Manter só eles: the part leaves the kept stretches; with no marks everything was kept.
  const keep = setPartRemoved(c, true, [], "keep", 30);
  assert.deepEqual(keep, [{ start: 0, end: 20 }]);
  assert.equal(isPartRemoved(c, keep ?? [], "keep", 30), true);
  assert.deepEqual(setPartRemoved(c, false, keep ?? [], "keep", 30), [{ start: 0, end: 30 }]);
  // The last part left cannot go: there would be nothing to save.
  const two = setPartRemoved(
    a,
    true,
    setPartRemoved(b, true, [], "remove", 30) ?? [],
    "remove",
    30,
  );
  assert.equal(setPartRemoved(c, true, two ?? [], "remove", 30), null);
  assert.deepEqual(subtractRange([{ start: 0, end: 30 }], { start: 10, end: 20 }, 30), [
    { start: 0, end: 10 },
    { start: 20, end: 30 },
  ]);
});

test("moving a cut keeps it between its neighbours and drags the deleted part's edge", () => {
  const marks = [{ start: 10, end: 20 }];
  assert.deepEqual(moveCut([10, 20], marks, 0, 12.5, 30), {
    points: [12.5, 20],
    marks: [{ start: 12.5, end: 20 }],
  });
  // Never past the next cut or the end: parts keep at least MIN_PART.
  assert.deepEqual(moveCut([10, 20], [], 0, 25, 30).points, [19.9, 20]);
  assert.deepEqual(moveCut([10, 20], [], 1, 40, 30).points, [10, 29.9]);
  // A mark that does not touch the cut stays put.
  assert.deepEqual(moveCut([10], [{ start: 2, end: 4 }], 0, 11, 30).marks, [{ start: 2, end: 4 }]);
});

test("the exact cut re-encodes only when a stretch starts off a keyframe", () => {
  const keys = [0, 2, 4, 6, 8];
  const at = (start: number) => [{ start, end: start + 1 }];
  assert.equal(startsOffKeyframes(at(0), keys, 30), false);
  assert.equal(startsOffKeyframes(at(6), keys, 30), false);
  // Within half a frame of the keyframe is the keyframe.
  assert.equal(startsOffKeyframes(at(6.01), keys, 30), false);
  assert.equal(startsOffKeyframes(at(7.3), keys, 30), true);
  // Unknown keyframes: only a start at 0 is known to be exact.
  assert.equal(startsOffKeyframes(at(0), null, 30), false);
  assert.equal(startsOffKeyframes(at(4), null, 30), true);
});

test("clock formats minutes, hours and tenths", () => {
  assert.equal(clock(724), "12:04");
  assert.equal(clock(3735), "1:02:15");
  assert.equal(clock(724.37, true), "12:04,3");
  assert.equal(clock(Number.NaN), "00:00");
});
