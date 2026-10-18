import assert from "node:assert/strict";
import { test } from "node:test";
import { paintCaptureCursor } from "./capture-cursor.ts";

test("cursor two-background composition preserves transparency, solid color and XOR inversion", () => {
  const output = new Uint8Array([30, 60, 90, 255, 30, 60, 90, 255, 30, 60, 90, 255]);
  paintCaptureCursor(output, 3, 1, {
    width: 3,
    height: 1,
    black: new Uint8Array([0, 0, 0, 255, 12, 34, 56, 255, 255, 255, 255, 255]),
    white: new Uint8Array([255, 255, 255, 255, 12, 34, 56, 255, 0, 0, 0, 255]),
    destination: { x: 0, y: 0, width: 3, height: 1 },
  });
  assert.deepEqual([...output], [30, 60, 90, 255, 12, 34, 56, 255, 225, 195, 165, 255]);
});
test("cursor clipping uses output coordinates and rejects malformed raster lengths", () => {
  const output = new Uint8Array(8).fill(255);
  const cursor = {
    width: 1,
    height: 1,
    black: new Uint8Array([1, 2, 3, 255]),
    white: new Uint8Array([1, 2, 3, 255]),
    destination: { x: -1, y: 0, width: 2, height: 1 },
  };
  paintCaptureCursor(output, 2, 1, cursor);
  assert.deepEqual([...output], [1, 2, 3, 255, 255, 255, 255, 255]);
  assert.throws(
    () => paintCaptureCursor(output, 2, 1, { ...cursor, black: new Uint8Array() }),
    /inválido/,
  );
});
