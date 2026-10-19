import assert from "node:assert/strict";
import { test } from "node:test";
import { baseLayer, IDENTITY, type RasterLayer } from "../src/shared/doc.ts";
import { apply, localPlacement, maskPlacement, resizedPlacement } from "../src/shared/placement.ts";
import { docToLocal, localToDoc } from "../src/shared/vector.ts";

test("nonuniform document scaling preserves rotated/flipped geometry and its inverse", () => {
  const t = { ...IDENTITY, x: 80, y: 60, scale: 1.3, rotation: 37, flipX: true };
  const before = localToDoc({ x: 15, y: 20 }, t, 100, 60);
  const resized = resizedPlacement(t, 2, 0.7);
  const after = localToDoc({ x: 15, y: 20 }, resized, 100, 60);
  assert.ok(Math.abs(after.x - before.x * 2) < 1e-8);
  assert.ok(Math.abs(after.y - before.y * 0.7) < 1e-8);
  const point = docToLocal(after, resized, 100, 60);
  assert.ok(Math.abs(point.x - 15) < 1e-8 && Math.abs(point.y - 20) < 1e-8);
});
test("linked masks follow placement while legacy masks stay in document space", () => {
  const reference = { ...IDENTITY, x: 50, y: 50 };
  const layer: RasterLayer = {
    ...baseLayer("Example"),
    kind: "raster",
    bitmap: "b",
    width: 100,
    height: 100,
    transform: { ...reference, x: 75 },
    mask: { bitmap: "m", enabled: true, reference },
  };
  assert.deepEqual(apply(maskPlacement(layer), { x: 60, y: 50 }), { x: 35, y: 50 });
  layer.mask = { bitmap: "m", enabled: true };
  assert.deepEqual(apply(maskPlacement(layer), { x: 60, y: 50 }), { x: 60, y: 50 });
  assert.deepEqual(apply(localPlacement(reference, 100, 100), { x: 0, y: 0 }), { x: 0, y: 0 });
});
