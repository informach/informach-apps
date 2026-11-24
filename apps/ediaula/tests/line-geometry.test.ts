import assert from "node:assert/strict";
import { test } from "node:test";
import { lineHeads } from "../src/shared/annotation.ts";
import {
  lineEnds,
  lineFromDrag,
  lineThrough,
  normalAngle,
  snapEnd,
} from "../src/shared/lineGeometry.ts";

const frame = { width: 1920, height: 1080 };
const near = (a: number, b: number, eps = 1e-6): void =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test("a line drawn on the frame: its center, its angle and its length at 1080p", () => {
  // From the left quarter to the right quarter at the same height: pointing right, 960 px.
  const flat = lineFromDrag({ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }, frame);
  assert.deepEqual(flat, { x: 0.5, y: 0.5, angle: 0, length: 960 });
  // Downward and to the left: the angle follows the frame's pixels, not its fractions.
  const down = lineFromDrag(
    { x: 0.5, y: 0.2 },
    { x: 0.5 - 270 / 1920, y: 0.2 + 270 / 1080 },
    frame,
  );
  near(down.angle, 135);
  near(down.length, Math.hypot(270, 270));
  // A 4K frame keeps the lengths in 1080p pixels.
  near(
    lineFromDrag({ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { width: 3840, height: 2160 }).length,
    960,
  );
});

test("Shift snaps the end to 45° steps, the length kept", () => {
  const end = snapEnd({ x: 0, y: 0 }, { x: 100, y: 10 });
  near(end.x, Math.hypot(100, 10));
  near(end.y, 0);
  const diagonal = snapEnd({ x: 0, y: 0 }, { x: 50, y: 60 });
  near(diagonal.x, diagonal.y);
});

test("the ends on the screen go back to the same line", () => {
  const center = { x: 400, y: 300 };
  const { start, end } = lineEnds(center, 30, 200, 0.5);
  const back = lineThrough(start, end, center, 0.5);
  near(back.angle, 30);
  near(back.length, 200);
  near(back.shift.x, 0);
  near(back.shift.y, 0);
});

test("dragging one end keeps the other where it was", () => {
  const center = { x: 400, y: 300 };
  const unit = 0.5;
  const { start } = lineEnds(center, 0, 200, unit);
  const moved = { x: 500, y: 400 };
  const line = lineThrough(start, moved, center, unit);
  // The new center is halfway between the fixed start and the dragged end.
  const middle = { x: center.x + line.shift.x, y: center.y + line.shift.y };
  const again = lineEnds(middle, line.angle, line.length, unit);
  near(again.start.x, start.x);
  near(again.start.y, start.y);
  near(again.end.x, moved.x);
  near(again.end.y, moved.y);
});

test("a turned or mirrored clip: the ends are where the screen shows them", () => {
  const center = { x: 0, y: 0 };
  for (const turn of [{ rotation: 90 }, { flipH: true }, { flipV: true, rotation: -30 }]) {
    const { start, end } = lineEnds(center, 20, 100, 1, turn);
    const back = lineThrough(start, end, center, 1, turn);
    near(back.angle, 20);
    near(back.length, 100);
  }
  // Mirrored left to right, a line pointing right points left.
  const { end } = lineEnds(center, 0, 100, 1, { flipH: true });
  near(end.x, -50);
});

test("angles are kept in (-180, 180]", () => {
  assert.equal(normalAngle(190), -170);
  assert.equal(normalAngle(-180), 180);
  assert.equal(normalAngle(540), 180);
});

test("the heads of each end, and older lessons that said them with `heads`", () => {
  assert.deepEqual(lineHeads({ kind: "arrow" }), { start: "none", end: "triangle" });
  assert.deepEqual(lineHeads({ kind: "line" }), { start: "none", end: "none" });
  assert.deepEqual(lineHeads({ kind: "arrow", heads: 2 }), { start: "triangle", end: "triangle" });
  assert.deepEqual(lineHeads({ kind: "line", heads: 1, arrowStyle: "dashed" }), {
    start: "none",
    end: "notched",
  });
  // The new fields win, one end at a time.
  assert.deepEqual(lineHeads({ kind: "arrow", heads: 2, headStart: "circle" }), {
    start: "circle",
    end: "triangle",
  });
  assert.deepEqual(lineHeads({ kind: "line", headStart: "bar", headEnd: "open" }), {
    start: "bar",
    end: "open",
  });
});
