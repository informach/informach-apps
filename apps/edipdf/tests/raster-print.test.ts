import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildRasterPrint } from "../src/shared/raster-print.ts";

test("raster print preserves physical page sizes and images without importing source text or metadata", async () => {
  const require = createRequire(import.meta.url),
    canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json"));
  const { createCanvas } = canvasRequire("@napi-rs/canvas");
  const canvas = createCanvas(200, 100),
    context = canvas.getContext("2d");
  context.fillStyle = "#c42d18";
  context.fillRect(0, 0, 200, 100);
  const jpeg = new Uint8Array(canvas.toBuffer("image/jpeg")),
    source = new Uint8Array(jpeg);
  const output = await buildRasterPrint({
    pages: [
      { bytes: jpeg, width: 72, height: 36 },
      { bytes: jpeg, width: 72, height: 36 },
    ],
  });
  const pdf = await PDFDocument.load(output.bytes);
  assert.equal(output.pages, 2);
  assert.deepEqual(
    pdf.getPages().map((page) => page.getSize()),
    [
      { width: 72, height: 36 },
      { width: 72, height: 36 },
    ],
  );
  assert.equal(pdf.getTitle(), undefined);
  assert.equal(pdf.getForm().getFields().length, 0);
  assert.deepEqual(jpeg, source);
  assert.ok(pdf.getPages().every((page) => page.node.Resources()?.has(pdf.context.obj("XObject"))));
  await assert.rejects(
    buildRasterPrint({ pages: [{ bytes: jpeg, width: 144, height: 36 }] }),
    /200 dpi/,
  );
  await assert.rejects(
    buildRasterPrint({ pages: [{ bytes: new Uint8Array([1, 2, 3]), width: 72, height: 36 }] }),
    /JPEG/,
  );
});
