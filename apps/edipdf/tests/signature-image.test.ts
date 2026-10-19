import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareSignaturePixels } from "../src/shared/signature-image.ts";

test("signature white-matte removal preserves colored strokes and gray antialiasing on white without changing input", () => {
  const pixels = new Uint8ClampedArray([
    255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 0, 255, 128, 128, 255, 255,
  ]);
  const original = pixels.slice();
  const result = prepareSignaturePixels(
    { width: 5, height: 1, pixels },
    { removeWhite: true, whiteLevel: 255, padding: 0 },
  );
  assert.equal(result.left, 1);
  assert.equal(result.width, 4);
  assert.deepEqual([...result.pixels.slice(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...result.pixels.slice(8, 12)], [255, 255, 0, 255]);
  for (const [index, input] of [
    [1, [128, 128, 128]],
    [3, [128, 128, 255]],
  ] as const) {
    const alpha = result.pixels[index * 4 + 3] / 255;
    for (let channel = 0; channel < 3; channel++)
      assert.ok(
        Math.abs(result.pixels[index * 4 + channel] * alpha + 255 * (1 - alpha) - input[channel]) <=
          1,
      );
  }
  assert.deepEqual(pixels, original);
});

test("manual cropping removes actual pixels after alpha trim and refuses an empty signature", () => {
  const pixels = new Uint8ClampedArray(8 * 4 * 4);
  pixels.set([0, 0, 0, 255], (1 * 8 + 1) * 4);
  pixels.set([0, 0, 255, 255], (2 * 8 + 6) * 4);
  const result = prepareSignaturePixels(
    { width: 8, height: 4, pixels },
    {
      removeWhite: false,
      padding: 0,
      crop: { left: 0, right: 0.5, top: 0, bottom: 0 },
    },
  );
  assert.equal(result.width, 3);
  assert.equal(result.height, 2);
  assert.equal(result.left, 1);
  assert.equal(
    result.pixels.some((value, index) => index % 4 === 2 && value === 255),
    false,
  );
  assert.throws(
    () =>
      prepareSignaturePixels(
        { width: 8, height: 4, pixels },
        {
          removeWhite: false,
          padding: 0,
          crop: { left: 0.4, right: 0.4, top: 0, bottom: 0 },
        },
      ),
    /todos os traços/,
  );
});

test("signature image processing refuses oversized dimensions, invalid buffers and invalid cleanup/crop before allocation", () => {
  assert.throws(
    () =>
      prepareSignaturePixels(
        { width: 8193, height: 1, pixels: new Uint8Array() },
        { removeWhite: true },
      ),
    /8192/,
  );
  assert.throws(
    () =>
      prepareSignaturePixels(
        { width: 2, height: 2, pixels: new Uint8Array(4) },
        { removeWhite: true },
      ),
    /16 megapixels/,
  );
  const source = { width: 1, height: 1, pixels: new Uint8Array([0, 0, 0, 255]) };
  assert.throws(
    () => prepareSignaturePixels(source, { removeWhite: true, whiteLevel: 256 }),
    /Ajustes inválidos/,
  );
  assert.throws(
    () =>
      prepareSignaturePixels(source, {
        removeWhite: false,
        crop: { left: 0.6, right: 0.6, top: 0, bottom: 0 },
      }),
    /conservar/,
  );
});
