import assert from "node:assert/strict";
import { test } from "node:test";
import { identityTransform, multiply, transformMatrix } from "@informach/edi-motion";
import { lottieGlobalTransform } from "./globalTransform";

test("paint layer normalizes nonzero viewBox outside local styles and retains source coordinates; solid fill-only retains affine baking", () => {
  for (const rotation of [0, 33, 173]) {
    const transform = {
        ...identityTransform(),
        x: 8,
        y: -4,
        sx: 2,
        sy: 1.25,
        opacity: 80,
        rotation,
      },
      box: [number, number, number, number] = [10, 20, 300, 200],
      paint = lottieGlobalTransform(transform, box, true),
      fill = lottieGlobalTransform(transform, box, false),
      expected = multiply(
        [1, 0, 0, 1, -10, -20],
        transformMatrix({ ...transform, px: 160, py: 120 }),
      ),
      layer = paint.layer;
    const actual = transformMatrix({
      x: layer.p.k[0] - layer.a.k[0],
      y: layer.p.k[1] - layer.a.k[1],
      px: layer.a.k[0],
      py: layer.a.k[1],
      rotation: layer.r.k,
      sx: layer.s.k[0] / 100,
      sy: layer.s.k[1] / 100,
      skewX: -layer.sk.k,
    });
    for (const [index, value] of expected.entries())
      assert.ok(Math.abs(value - (actual[index] ?? NaN)) < 1e-10);
    assert.deepEqual(paint.localPrefix, [1, 0, 0, 1, 0, 0]);
    assert.deepEqual(layer.a.k, [160, 120, 0]);
    for (const [index, value] of paint.worldPrefix.entries())
      assert.ok(Math.abs(value - (actual[index] ?? NaN)) < 1e-10);
    assert.deepEqual(fill.localPrefix, fill.worldPrefix);
    assert.deepEqual(fill.layer.p.k, [0, 0, 0]);
    assert.equal(paint.layer.o.k, 80);
    assert.equal(fill.layer.o.k, 80);
    assert.deepEqual(JSON.parse(JSON.stringify(layer)), layer);
  }
});

test("global Lottie properties refuse excessive derived coordinates before rendering or storing output", () => {
  assert.throws(
    () =>
      lottieGlobalTransform(
        { ...identityTransform(), x: 1e7, opacity: 100 },
        [0, 0, 300, 200],
        true,
      ),
    /global/,
  );
});
