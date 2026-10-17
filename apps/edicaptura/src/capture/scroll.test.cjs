const { test } = require("node:test");
const assert = require("node:assert/strict");
const { signature, findOverlap, stitchBitmaps } = require("./scroll.cjs");
function page(width, height) {
  const bitmap = Buffer.alloc(width * height * 4);
  let seed = 123;
  for (let i = 0; i < bitmap.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    bitmap[i] = seed % 256;
    bitmap[i + 1] = (seed >>> 8) % 256;
    bitmap[i + 2] = (seed >>> 16) % 256;
    bitmap[i + 3] = 255;
  }
  return bitmap;
}
test("rolagens diferentes se unem sem duplicar ou perder pixels", () => {
  const width = 120,
    height = 200,
    original = page(width, 410),
    starts = [0, 100, 210];
  const frames = starts.map((y) => ({
    width,
    height,
    bitmap: original.subarray(y * width * 4, (y + height) * width * 4),
  }));
  const samples = frames.map((f) => signature(f.bitmap, width, height));
  const overlaps = [0, findOverlap(samples[0], samples[1]), findOverlap(samples[1], samples[2])];
  assert.deepEqual(overlaps, [0, 100, 90]);
  const merged = stitchBitmaps(frames, overlaps);
  assert.equal(merged.height, 410);
  assert.deepEqual(merged.bitmap, original);
});
test("tela parada não gera trechos duplicados", () => {
  const sample = signature(page(80, 150), 80, 150);
  assert.equal(findOverlap(sample, sample), 150);
});
test("alinha trecho com pequenas mudanças de renderização", () => {
  const width = 120,
    height = 200,
    original = page(width, 300);
  const next = Buffer.from(original.subarray(100 * width * 4));
  for (let i = 0; i < next.length; i++) if (i % 4 !== 3) next[i] = Math.min(255, next[i] + 4);
  assert.equal(
    findOverlap(
      signature(original.subarray(0, 200 * width * 4), width, height),
      signature(next, width, height),
    ),
    100,
  );
});
test("recusa união de telas sem sobreposição e movimento para cima", () => {
  const bitmap = page(80, 500),
    sample = (y) => signature(bitmap.subarray(y * 80 * 4, (y + 150) * 80 * 4), 80, 150);
  assert.equal(findOverlap(sample(0), sample(300)), null);
  assert.equal(findOverlap(sample(100), sample(0)), null);
});
test("valida dimensões, corte manual e limite antes de alocar imagem", () => {
  const frame = { width: 2, height: 3, bitmap: Buffer.alloc(24, 7) };
  assert.equal(stitchBitmaps([frame, frame], [0, 1]).height, 5);
  assert.throws(() => stitchBitmaps([frame, frame], [0, 3]));
  assert.throws(() => stitchBitmaps([frame, { ...frame, width: 3 }], [0, 0]));
  assert.throws(() => stitchBitmaps(Array(10001).fill(frame), Array(10001).fill(0)), /longa/);
});
