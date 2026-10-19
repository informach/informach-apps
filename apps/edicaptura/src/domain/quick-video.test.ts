import assert from "node:assert/strict";
import { test } from "node:test";
import { validateVideoRecipe } from "./quick-video.ts";

test("quick video recipes refuse nonfinite, internal cuts and outside ranges", () => {
  for (const value of [
    { version: 1, start: NaN, end: 3 },
    { version: 1, start: 2, end: 1 },
    { version: 1, start: 0, end: 4 },
    { version: 1, start: 0, end: 2, intervals: [] },
  ])
    assert.throws(() => validateVideoRecipe(value, 3));
  assert.deepEqual(validateVideoRecipe(null, 3), { version: 1, start: 0, end: 3 });
});
