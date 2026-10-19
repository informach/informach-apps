import assert from "node:assert/strict";
import { test } from "node:test";
import {
  constrainSelection,
  globalToPixel,
  magnifierSample,
  nudgeSelection,
  pixelToGlobal,
} from "./selection-precision.ts";

test("physical pixel precision survives negative DIP origins and scaled preview", () => {
  const area = { x: -400, y: -100, width: 600, height: 200 },
    size = { width: 1200, height: 400 };
  const rect = { x: 200, y: 100, width: 300, height: 200 };
  assert.deepEqual(globalToPixel(pixelToGlobal(rect, area, size), area, size), rect);
  assert.equal(nudgeSelection(rect, "ArrowRight", false, size).x, 201);
  assert.equal(nudgeSelection(rect, "ArrowLeft", true, size).x, 190);
  assert.deepEqual(constrainSelection(rect, size, { kind: "fixed", width: 640, height: 360 }), {
    ...rect,
    width: 640,
    height: 360,
    y: 40,
  });
  assert.equal(constrainSelection(rect, size, { kind: "ratio", width: 16, height: 9 }).height, 169);
  assert.throws(() => constrainSelection(rect, size, { kind: "fixed", width: 1280, height: 720 }));
  assert.deepEqual(magnifierSample(1199, 399, size), { x: 1185, y: 385, width: 15, height: 15 });
});
