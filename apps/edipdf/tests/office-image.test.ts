import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { validateRasterImage } from "../src/shared/raster-image.ts";

test("Office images validate actual dimensions and PNG expansion before embedding", () => {
  const require = createRequire(import.meta.url),
    canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json"));
  const canvas = canvasRequire("@napi-rs/canvas").createCanvas(40, 40),
    context = canvas.getContext("2d");
  context.fillStyle = "red";
  context.fillRect(0, 0, 40, 40);
  const png = new Uint8Array(canvas.toBuffer("image/png")),
    jpg = new Uint8Array(canvas.toBuffer("image/jpeg"));
  validateRasterImage(png, "png");
  validateRasterImage(jpg, "jpg");
  const huge = new Uint8Array(png);
  new DataView(huge.buffer).setUint32(16, 0xffffffff);
  assert.throws(() => validateRasterImage(huge, "png"), /limites locais/);
  const bomb = new Uint8Array(png);
  new DataView(bomb.buffer).setUint32(16, 1);
  new DataView(bomb.buffer).setUint32(20, 1);
  assert.throws(() => validateRasterImage(bomb, "png"), /Expansão/);
  assert.throws(() => validateRasterImage(png.subarray(0, 40), "png"), /incompleta|incompleto/);
  assert.throws(() => validateRasterImage(png, "jpg"), /JPEG/);
});
