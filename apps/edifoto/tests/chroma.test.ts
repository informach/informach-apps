import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_KEY, detectScreen, keyFrame, keyUsable } from "../src/shared/chroma.ts";

test("green screen disappears while skin and neutral colors stay intact", () => {
  const src = new Uint8ClampedArray([0, 255, 0, 255, 210, 150, 120, 255, 80, 80, 80, 255]);
  const out = keyFrame(src, 4, 3, 1, { ...DEFAULT_KEY, color: "#00ff00" });
  assert.equal(out[3], 0);
  assert.deepEqual([...out.slice(4)], [...src.slice(4)]);
});

test("existing alpha is preserved, including fully transparent pixels and unsupported key colors", () => {
  const src = new Uint8ClampedArray([180, 100, 80, 91, 100, 90, 80, 0]);
  for (const color of ["#00ff00", "#808080"]) {
    const out = keyFrame(src, 4, 2, 1, { ...DEFAULT_KEY, color });
    assert.equal(out[3], 91);
    assert.equal(out[7], 0);
  }
  assert.equal(keyUsable("#zzzzzz"), false);
});

test("blue key preserves dark navy clothing and red objects", () => {
  const src = new Uint8ClampedArray([0, 0, 255, 255, 10, 20, 55, 255, 200, 20, 10, 255]);
  const out = keyFrame(src, 4, 3, 1, { ...DEFAULT_KEY, color: "#0000ff" });
  assert.equal(out[3], 0);
  assert.deepEqual([...out.slice(4)], [...src.slice(4)]);
});

test("subpixel hair coverage survives and edge colors are unmixed", () => {
  const w = 64,
    h = 48,
    src = new Uint8ClampedArray(w * h * 4);
  const f = [140, 90, 60],
    key = [0, 255, 0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = x < 32 ? 1 : x === 32 ? 0.5 : x === 33 ? 0.01 : 0;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) src[i + c] = a * f[c] + (1 - a) * key[c];
      src[i + 3] = 255;
    }
  const out = keyFrame(src, 4, w, h, { ...DEFAULT_KEY, color: "#00ff00" });
  const edge = (24 * w + 32) * 4,
    hair = edge + 4;
  assert.ok(Math.abs(out[edge + 3] - 128) < 3);
  assert.ok(out[hair + 3] > 0 && out[hair + 3] < 8);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(out[edge + c] - f[c]) < 3);
});

test("choke contracts alpha and reused output has no leftover transparency", () => {
  const w = 9,
    h = 9,
    src = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      src.set(
        x >= 2 && x <= 6 && y >= 2 && y <= 6 ? [200, 100, 80, 255] : [0, 255, 0, 255],
        (y * w + x) * 4,
      );
  const out = keyFrame(src, 4, w, h, { ...DEFAULT_KEY, color: "#00ff00", choke: 1 });
  assert.equal(out[(2 * w + 2) * 4 + 3], 0);
  assert.equal(out[(4 * w + 4) * 4 + 3], 255);
  src.fill(0);
  keyFrame(src, 4, w, h, { ...DEFAULT_KEY, color: "#00ff00" }, out);
  assert.ok(out.every((v) => v === 0));
});

test("detection ignores transparent border RGB and invalid buffers fail", () => {
  const src = new Uint8ClampedArray(40 * 40 * 4);
  for (let i = 0; i < src.length; i += 4) src.set([0, 255, 0, 0], i);
  assert.equal(detectScreen(src, 4, 40, 40), null);
  for (let i = 3; i < src.length; i += 4) src[i] = 255;
  assert.equal(detectScreen(src, 4, 40, 40), "#00FF00");
  assert.throws(() => keyFrame(src, 4, 0, 40, { ...DEFAULT_KEY, color: "#00ff00" }));
});

test("cyan confetti and blue monitor colors are not green screen", () => {
  // Representative colors from the reported image, including the former 9%-alpha cyan.
  const colors = [
    [5, 180, 252],
    [1, 70, 122],
    [0, 51, 93],
    [249, 156, 3],
    [250, 240, 180],
  ];
  for (const rgb of colors) {
    const src = new Uint8ClampedArray([...rgb, 255]);
    assert.deepEqual(keyFrame(src, 4, 1, 1, { ...DEFAULT_KEY, color: "#08C321" }), src);
  }
});

test("multicolored opaque interior keeps its original RGB and alpha", () => {
  const w = 80,
    h = 80,
    src = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const outside = x < 8 || x >= 72 || y < 8 || y >= 72;
      const rgb = outside ? [8, 195, 33] : x < 40 ? [0, 51, 93] : [249, 156, 3];
      src.set([...rgb, 255], (y * w + x) * 4);
    }
  const out = keyFrame(src, 4, w, h, { ...DEFAULT_KEY, color: "#08C321" });
  for (let y = 12; y < 68; y++)
    for (let x = 12; x < 68; x++) {
      const i = (y * w + x) * 4;
      assert.deepEqual(out.slice(i, i + 4), src.slice(i, i + 4));
    }
  assert.equal(out[3], 0);
});

test("lime object interior is protected without filling genuine green holes", () => {
  const w = 80,
    h = 80,
    src = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const subject = x > 10 && x < 70 && y > 10 && y < 70;
      const hole = x > 35 && x < 45 && y > 35 && y < 45;
      src.set(subject && !hole ? [140, 219, 74, 255] : [8, 195, 33, 255], (y * w + x) * 4);
    }
  const out = keyFrame(src, 4, w, h, { ...DEFAULT_KEY, color: "#08C321" });
  const i = (25 * w + 25) * 4;
  assert.deepEqual(out.slice(i, i + 4), src.slice(i, i + 4));
  assert.equal(out[(40 * w + 40) * 4 + 3], 0);
  assert.equal(out[3], 0);
});
