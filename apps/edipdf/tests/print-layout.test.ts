import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { plainText } from "@informach/edi-ocr/search";
import { degrees, PDFDocument, rgb } from "pdf-lib";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import { DEFAULT_PRINT_SETTINGS } from "../src/shared/print-format.ts";
import { imposePrintPdf, printLayout } from "../src/shared/print-layout.ts";

const require = createRequire(import.meta.url),
  engine = await LocalPdfEngine.create(
    await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
  );
async function document(count: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < count; index++)
    pdf.addPage([400, 600]).drawText(`PAGE_${index + 1}`, { x: 50, y: 500 });
  return new Uint8Array(await pdf.save());
}
test("print plans retain explicit order, parity and blank booklet slots", () => {
  assert.deepEqual(
    printLayout(7, { ...DEFAULT_PRINT_SETTINGS, layout: "booklet", paper: "a4" }).sheets,
    [
      [null, 0],
      [1, 6],
      [5, 2],
      [3, 4],
    ],
  );
  assert.deepEqual(
    printLayout(7, { ...DEFAULT_PRINT_SETTINGS, range: "5-3,1", reverse: true }).selected,
    [0, 2, 3, 4],
  );
  assert.deepEqual(
    printLayout(7, {
      ...DEFAULT_PRINT_SETTINGS,
      range: "pares",
      layout: "multiple",
      paper: "a4",
      perSheet: 2,
    }).sheets,
    [[1, 3], [5]],
  );
  assert.throws(() => printLayout(1, { ...DEFAULT_PRINT_SETTINGS, range: "pares" }), /não contém/);
  assert.throws(() => printLayout(4, { ...DEFAULT_PRINT_SETTINGS, layout: "booklet" }), /papel/);
});
test("vector imposition keeps native searchable text, selected page order and booklet sides", async () => {
  const bytes = await document(7);
  const single = await imposePrintPdf(bytes, { ...DEFAULT_PRINT_SETTINGS, range: "7,3-1" });
  assert.equal(single.pages, 4);
  assert.deepEqual(
    engine
      .textDocument(single.bytes, { includeAnnotations: false })
      .pages.map((page) => plainText(page.glyphs)),
    ["PAGE_7", "PAGE_3", "PAGE_2", "PAGE_1"],
  );
  const booklet = await imposePrintPdf(bytes, {
    ...DEFAULT_PRINT_SETTINGS,
    layout: "booklet",
    paper: "a4",
  });
  assert.equal(booklet.pages, 4);
  assert.deepEqual(
    engine
      .textDocument(booklet.bytes, { includeAnnotations: false })
      .pages.map((page) => plainText(page.glyphs).replace(/\s/g, "")),
    ["PAGE_1", "PAGE_2PAGE_7", "PAGE_6PAGE_3", "PAGE_4PAGE_5"],
  );
  const multiple = await imposePrintPdf(bytes, {
    ...DEFAULT_PRINT_SETTINGS,
    layout: "multiple",
    paper: "a4",
    perSheet: 4,
  });
  assert.equal(multiple.pages, 2);
  assert.ok(
    engine
      .textDocument(multiple.bytes, { includeAnnotations: false })
      .pages.every((page) => page.glyphs.length > 0),
  );
});
async function render(bytes: Uint8Array, pageNumber = 1) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"),
    loading = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const page = await (await loading.promise).getPage(pageNumber),
      viewport = page.getViewport({ scale: 1 });
    const canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json")),
      { createCanvas } = canvasRequire("@napi-rs/canvas");
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
    const pixels: Uint8ClampedArray = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    const centroid = (channel: 0 | 2) => {
      let x = 0,
        y = 0,
        count = 0;
      for (let offset = 0; offset < pixels.length; offset += 4)
        if (
          pixels[offset + channel] > 230 &&
          pixels[offset + 1] < 20 &&
          pixels[offset + (channel === 0 ? 2 : 0)] < 20
        ) {
          x += (offset / 4) % canvas.width;
          y += Math.floor(offset / 4 / canvas.width);
          count++;
        }
      assert.ok(count > 100);
      return { x: x / count, y: y / count };
    };
    return { width: viewport.width, height: viewport.height, red: centroid(0), blue: centroid(2) };
  } finally {
    await loading.destroy();
  }
}
test("imposition preserves CropBox origins and visual orientation for all four rotations", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const pdf = await PDFDocument.create(),
      page = pdf.addPage([400, 500]);
    page.setCropBox(50, 70, 180, 240);
    page.setRotation(degrees(rotation));
    page.drawRectangle({ x: 60, y: 80, width: 40, height: 60, color: rgb(1, 0, 0) });
    page.drawRectangle({ x: 180, y: 260, width: 40, height: 40, color: rgb(0, 0, 1) });
    const bytes = await pdf.save(),
      original = await render(bytes),
      result = await imposePrintPdf(bytes, { ...DEFAULT_PRINT_SETTINGS, paper: "a4" }),
      composed = await render(result.bytes);
    const scale = Math.min(
        (composed.width - 36) / original.width,
        (composed.height - 36) / original.height,
      ),
      x = (composed.width - original.width * scale) / 2,
      y = (composed.height - original.height * scale) / 2;
    for (const color of ["red", "blue"] as const) {
      assert.ok(
        Math.abs(composed[color].x - (x + original[color].x * scale)) < 2,
        `${rotation}: ${color} x`,
      );
      assert.ok(
        Math.abs(composed[color].y - (y + original[color].y * scale)) < 2,
        `${rotation}: ${color} y`,
      );
    }
  }
});
test("print layout refuses unflattened forms and warns when requested scale clips content", async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([600, 800]),
    field = pdf.getForm().createTextField("name");
  field.setText("KEEP_APPEARANCE");
  field.addToPage(page, { x: 50, y: 500, width: 150, height: 25 });
  await assert.rejects(imposePrintPdf(await pdf.save(), DEFAULT_PRINT_SETTINGS), /aparências/);
  const enlarged = await imposePrintPdf(await document(1), {
    ...DEFAULT_PRINT_SETTINGS,
    paper: "a4",
    scale: 400,
  });
  assert.ok(enlarged.warnings.some((warning) => warning.includes("corta conteúdo")));
});

test("scaling original-sized mixed pages preserves each paper size instead of silently imposing A4", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]).drawText("SMALL", { x: 30, y: 300 });
  pdf.addPage([800, 600]).drawText("WIDE", { x: 50, y: 500 });
  const result = await imposePrintPdf(await pdf.save(), { ...DEFAULT_PRINT_SETTINGS, scale: 75 });
  assert.deepEqual(
    (await PDFDocument.load(result.bytes)).getPages().map((page) => page.getSize()),
    [
      { width: 300, height: 400 },
      { width: 800, height: 600 },
    ],
  );
  assert.deepEqual(
    engine
      .textDocument(result.bytes, { includeAnnotations: false })
      .pages.map((page) => plainText(page.glyphs)),
    ["SMALL", "WIDE"],
  );
});
