import assert from "node:assert/strict";
import { test } from "node:test";
import { borderColor, refineAlpha, uniformCutout } from "../src/shared/masks.ts";

test("grow, shrink and feather match a direct neighborhood evaluator including image edges", () => {
  const w = 7,
    h = 5,
    input = Uint8ClampedArray.from({ length: w * h }, (_, i) => (i * 53) % 256);
  for (const radius of [1, 2, 8])
    for (const kind of ["grow", "shrink", "blur"]) {
      const output = refineAlpha(
        input,
        w,
        h,
        kind === "grow" ? radius : kind === "shrink" ? -radius : 0,
        kind === "blur" ? radius : 0,
      );
      let expected = input.slice();
      for (const horizontal of [true, false]) {
        const next = new Uint8ClampedArray(w * h);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const values = [];
            for (let k = -radius; k <= radius; k++) {
              const xx = x + (horizontal ? k : 0),
                yy = y + (horizontal ? 0 : k);
              values.push(xx < 0 || xx >= w || yy < 0 || yy >= h ? 0 : expected[yy * w + xx]);
            }
            next[y * w + x] =
              kind === "grow"
                ? Math.max(...values)
                : kind === "shrink"
                  ? Math.min(...values)
                  : values.reduce((a, b) => a + b, 0) / values.length;
          }
        expected = next;
      }
      assert.deepEqual(output, expected, `${kind} ${radius}`);
    }
});
test("uniform backgrounds remove only border-connected colors and keep original alpha", () => {
  const w = 9,
    h = 9,
    pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) pixels.set([255, 255, 255, 255], i * 4);
  for (let y = 2; y < 7; y++)
    for (let x = 2; x < 7; x++) pixels.set([220, 0, 0, 255], (y * w + x) * 4);
  pixels.set([255, 255, 255, 128], (4 * w + 4) * 4);
  const output = uniformCutout(pixels, w, h, "#ffffff", 10);
  assert.equal(output[3], 0);
  assert.equal(output[(3 * w + 3) * 4 + 3], 255);
  assert.equal(output[(4 * w + 4) * 4 + 3], 128);
  assert.equal(pixels[3], 255);
  assert.equal(borderColor(pixels, w, h), "#ffffff");
  assert.throws(() => refineAlpha(new Uint8ClampedArray(3), 2, 2));
});
