import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { setImageDensity } from "../src/shared/image-density.ts";

test("PNG/JPEG density updates preserve independently decoded pixels at every supported dpi", async () => {
  const require = createRequire(import.meta.url),
    canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json")),
    { createCanvas, loadImage } = canvasRequire("@napi-rs/canvas"),
    source = createCanvas(20, 10),
    context = source.getContext("2d");
  context.fillStyle = "#ff0000";
  context.fillRect(0, 0, 10, 10);
  context.fillStyle = "#00ff00";
  context.fillRect(10, 0, 10, 10);
  const decoded = async (bytes: Uint8Array) => {
    const image = await loadImage(bytes),
      canvas = createCanvas(image.width, image.height),
      ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    return Buffer.from(ctx.getImageData(0, 0, image.width, image.height).data);
  };
  for (const format of ["png", "jpg"] as const) {
    const bytes = source.toBuffer(format === "png" ? "image/png" : "image/jpeg"),
      expected = await decoded(bytes);
    for (const dpi of [72, 150, 300]) {
      const output = setImageDensity(bytes, format, dpi);
      assert.deepEqual(await decoded(output), expected);
      assert.deepEqual(await decoded(setImageDensity(output, format, dpi)), expected);
    }
  }
  assert.throws(() => setImageDensity(source.toBuffer("image/png"), "png", 999), /perfil local/);
});
