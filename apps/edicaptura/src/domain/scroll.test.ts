import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alignScroll,
  cropScroll,
  NO_MARGINS,
  SCROLL_BYTES,
  scrollAcquisitionBudget,
  scrollBudget,
  scrollDimensions,
  scrollPublicationBudget,
  scrollSignature,
  stitchScroll,
} from "./scroll.ts";

function frame(width: number, height: number) {
  const bitmap = new Uint8Array(width * height * 4);
  let seed = 37;
  for (let i = 0; i < bitmap.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    bitmap[i] = seed >>> 24;
  }
  return { width, height, bitmap };
}
for (const axis of ["vertical", "horizontal"] as const)
  test(`exact pixels, seams and full preview: ${axis}`, () => {
    const full = frame(axis === "vertical" ? 40 : 180, axis === "vertical" ? 180 : 40);
    const a = cropScroll(full, { ...NO_MARGINS, [axis === "vertical" ? "bottom" : "right"]: 80 });
    const b = cropScroll(full, {
      ...NO_MARGINS,
      [axis === "vertical" ? "top" : "left"]: 40,
      [axis === "vertical" ? "bottom" : "right"]: 40,
    });
    const c = cropScroll(full, { ...NO_MARGINS, [axis === "vertical" ? "top" : "left"]: 80 });
    const seam = alignScroll(scrollSignature(a, axis), scrollSignature(b, axis));
    assert.equal(seam.overlap, 60);
    assert.equal(seam.confidence, 1);
    assert.equal(seam.warning, "");
    assert.deepEqual(stitchScroll([a, b, c], [0, 60, 60], axis).bitmap, full.bitmap);
    assert.deepEqual(stitchScroll([a, b, c], [0, 60, 60], axis, true).bitmap, full.bitmap);
  });
test("repeating/dynamic regions never receive confident seams", () => {
  const a = frame(60, 100),
    b = frame(60, 100);
  a.bitmap.fill(19);
  b.bitmap.fill(27);
  assert.equal(
    alignScroll(scrollSignature(a, "vertical"), scrollSignature(b, "vertical")).automatic,
    false,
  );
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 60; x++) {
      const n = (y % 10) * 20;
      a.bitmap.fill(n, (y * 60 + x) * 4, (y * 60 + x + 1) * 4);
      b.bitmap.fill(((y + 4) % 10) * 20, (y * 60 + x) * 4, (y * 60 + x + 1) * 4);
    }
  assert.equal(
    alignScroll(scrollSignature(a, "vertical"), scrollSignature(b, "vertical")).automatic,
    false,
  );
});
test("crop excludes all four fixed edges and rejects empty moving area", () => {
  const original = frame(9, 8),
    crop = cropScroll(original, { top: 2, bottom: 1, left: 3, right: 2 });
  assert.equal(crop.width, 4);
  assert.equal(crop.height, 5);
  for (let y = 0; y < 5; y++)
    assert.deepEqual(
      crop.bitmap.subarray(y * 16, (y + 1) * 16),
      original.bitmap.subarray(((y + 2) * 9 + 3) * 4, ((y + 2) * 9 + 7) * 4),
    );
  assert.throws(() => cropScroll(original, { ...NO_MARGINS, top: 8 }), /Área móvel/);
});
test("aggregate budget includes retained undo/copies, output and preview before allocation", () => {
  assert.equal(
    scrollBudget([{ width: 100, height: 200 }], { width: 100, height: 400 }),
    100 * 200 * 16 + 100 * 400 * 12 + 64 * 1048576,
  );
  assert.throws(
    () => scrollBudget([{ width: 10000, height: 10000 }], { width: 1, height: 1 }),
    /512 MiB/,
  );
  assert.throws(
    () =>
      scrollDimensions(
        [
          { width: 20000, height: 1 },
          { width: 20000, height: 1 },
        ],
        [0, 0],
        "horizontal",
      ),
    /tamanho/,
  );
  assert.throws(
    () => scrollDimensions([{ width: 20, height: 20 }], [1], "vertical"),
    /Sobreposição/,
  );
});
test("staged publication admits compressible 4K, rejects noisy output and exact over-budget edge", () => {
  const size = { width: 3840, height: 2160 };
  assert.ok(scrollBudget([size], size) < SCROLL_BYTES);
  assert.ok(scrollPublicationBudget([size], size, 4 * 1048576) < SCROLL_BYTES);
  assert.throws(
    () => scrollPublicationBudget([size], size, size.width * size.height * 4),
    /512 MiB/,
  );
  const base = size.width * size.height * 32 + 64 * 1048576;
  const limit = Math.floor((SCROLL_BYTES - base) / 12);
  assert.equal(scrollPublicationBudget([size], size, limit), base + limit * 12);
  assert.throws(() => scrollPublicationBudget([size], size, limit + 1), /512 MiB/);
});
test("all-screen acquisition charges source set, normalization, exact encoding and crop at strict threshold", () => {
  const size = { width: 100, height: 100 };
  const base = 64 * 1048576;
  const expected = base + 4 * 40000 + 80000 + 40000 + 80000;
  assert.equal(scrollAcquisitionBudget(base, [size, size, size, size], size, size), expected);
  const available = SCROLL_BYTES - (expected - 40000);
  assert.equal(
    scrollAcquisitionBudget(base, [size, size, size, size], size, size, available),
    SCROLL_BYTES,
  );
  assert.throws(
    () => scrollAcquisitionBudget(base, [size, size, size, size], size, size, available + 1),
    /512 MiB/,
  );
});
