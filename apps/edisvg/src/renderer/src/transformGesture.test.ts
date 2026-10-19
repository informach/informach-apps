import assert from "node:assert/strict";
import { test } from "node:test";
import { gestureTransform } from "./transformGesture";

const pose = { x: 20, y: 30, rotation: 0, sx: 2, sy: 3, opacity: 100, px: 10, py: 10 };
test("rotation uses the authored pivot and scale handles preserve signed local axes", () => {
  assert.deepEqual(gestureTransform(pose, "rotate", { x: 40, y: 40 }, { x: 30, y: 50 }, false), {
    rotation: 90,
  });
  assert.deepEqual(gestureTransform(pose, "scale", { x: 20, y: 20 }, { x: 0, y: 30 }, false), {
    sx: -2,
    sy: 6,
  });
  assert.deepEqual(gestureTransform(pose, "scale", { x: 20, y: 20 }, { x: 30, y: 40 }, true), {
    sx: 6,
    sy: 9,
  });
  assert.throws(
    () => gestureTransform(pose, "scale", { x: 10, y: 20 }, { x: 30, y: 40 }, false),
    /pivô/,
  );
});
