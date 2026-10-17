import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_TOOLS } from "../src/shared/aiTools.ts";
import { DEFAULT_VECTOR, IDENTITY } from "../src/shared/doc.ts";
import { floodMask } from "../src/shared/selection.ts";
import { docToLocal, dragRect, localToDoc, pathData, shapePath } from "../src/shared/vector.ts";

test("Bézier path closes using last outgoing and first incoming handles", () => {
  const d = pathData(
    [
      { x: 0, y: 0, incoming: { x: -3, y: 0 }, outgoing: { x: 3, y: 0 } },
      { x: 10, y: 10, incoming: { x: 7, y: 10 }, outgoing: { x: 13, y: 10 } },
    ],
    true,
  );
  assert.equal(d, "M 0 0 C 3 0 7 10 10 10 C 13 10 -3 0 0 0 Z");
});
test("handle coordinates round trip under rotation, scaling and flips", () => {
  for (const flipX of [true, false])
    for (const flipY of [true, false]) {
      const t = { ...IDENTITY, x: 73, y: 98, rotation: 127, scale: 0.43, flipX, flipY },
        p = { x: 43, y: -22 };
      const result = docToLocal(localToDoc(p, t, 200, 50), t, 200, 50);
      assert.ok(Math.abs(p.x - result.x) < 1e-10);
      assert.ok(Math.abs(p.y - result.y) < 1e-10);
    }
});
test("shape drawing supports reverse drags, centered drawing and constrained proportions", () => {
  assert.deepEqual(dragRect({ x: 50, y: 50 }, { x: 10, y: 30 }), {
    x: 30,
    y: 40,
    width: 40,
    height: 20,
  });
  assert.deepEqual(dragRect({ x: 50, y: 50 }, { x: 10, y: 30 }, true, true), {
    x: 50,
    y: 50,
    width: 80,
    height: 80,
  });
  assert.ok(!shapePath({ ...DEFAULT_VECTOR, width: 20, height: 10, radius: 99 }).includes("99"));
});
test("wand respects connectivity and does not select identical isolated colors", () => {
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255]);
  const mask = floodMask(data, 3, 1, [0], 10);
  assert.equal(mask[3], 255);
  assert.equal(mask[7], 0);
  assert.equal(mask[11], 0);
  assert.equal(floodMask(data, 3, 1, [0, 2], 10)[11], 255);
});
test("AI rejects invalid vector dimensions, excessive polygons and invalid colors", () => {
  assert.equal(AI_TOOLS.add_vector.input.safeParse({ vector: { width: -1 } }).success, false);
  assert.equal(AI_TOOLS.add_vector.input.safeParse({ vector: { sides: 200 } }).success, false);
  assert.equal(
    AI_TOOLS.add_vector.input.safeParse({ vector: { fillColor: "red" } }).success,
    false,
  );
  assert.equal(
    AI_TOOLS.add_vector.input.safeParse({
      vector: {
        shape: "path",
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 20, outgoing: { x: 55, y: 30 } },
        ],
      },
    }).success,
    true,
  );
});
