import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFRawStream, StandardFonts } from "pdf-lib";
import { buildPdf, mergePdfs } from "../src/shared/build.ts";
import { compressPdf, type Reencode, unpng } from "../src/shared/compress.ts";
import type { DocContent, PageRef } from "../src/shared/model.ts";

/** A PDF with one noisy (incompressible) RGB image per page, optionally PNG-predicted. */
async function imagePdf(pages: number, size: number, predictor = false): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pages; p++) {
    const raw = new Uint8Array(size * size * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (Math.random() * 256) | 0;
    let data = raw;
    if (predictor) {
      // Filter type 0 ("None") on every row is still a valid PNG-predicted stream.
      data = new Uint8Array(size * (size * 3 + 1));
      for (let r = 0; r < size; r++)
        data.set(raw.subarray(r * size * 3, (r + 1) * size * 3), r * (size * 3 + 1) + 1);
    }
    const img = doc.context.register(
      doc.context.stream(deflateSync(data), {
        Type: "XObject",
        Subtype: "Image",
        Width: size,
        Height: size,
        ColorSpace: "DeviceRGB",
        BitsPerComponent: 8,
        Filter: "FlateDecode",
        ...(predictor ? { DecodeParms: { Predictor: 15, Colors: 3, Columns: size } } : {}),
      }),
    );
    const page = doc.addPage([595, 842]);
    const name = page.node.newXObject("Im", img);
    page.drawText(`Página ${p + 1}`, { x: 40, y: 800, size: 14, font });
    const content = doc.context.flateStream(`q 400 0 0 400 100 300 cm ${name.asString()} Do Q`);
    page.node.addContentStream(doc.context.register(content));
  }
  return doc.save();
}

/** Stand-in for the canvas encoder: a fake JPEG of 1 byte per 50 pixels, at the requested size. */
const fakeReencode: Reencode = async (img, maxSide) => {
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.round(img.width * k);
  const height = Math.round(img.height * k);
  if (img.kind === "pixels")
    assert.equal(img.data.length >= img.width * img.height * img.channels, true);
  return { bytes: new Uint8Array(Math.ceil((width * height) / 50)).fill(0xff), width, height };
};

const imageStreams = (doc: PDFDocument) =>
  doc.context
    .enumerateIndirectObjects()
    .filter(
      ([, o]) =>
        o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"),
    ) as [unknown, PDFRawStream][];

test("unpng reverses Sub, Up, Average and Paeth rows", () => {
  // 2 pixels x 2 rows, 1 channel. Row 0 uses Sub, row 1 uses Up.
  const out = unpng(new Uint8Array([1, 10, 5, 2, 1, 1]), 1, 2);
  assert.deepEqual([...out], [10, 15, 11, 16]);
  const paeth = unpng(new Uint8Array([4, 7, 3, 4, 1, 1]), 1, 2);
  assert.deepEqual([...paeth], [7, 10, 8, 11]);
});

test("recompresses large images and keeps page count", async () => {
  const src = await imagePdf(2, 600);
  let progress = 0;
  const res = await compressPdf(src, "balanced", fakeReencode, () => progress++);
  assert.equal(res.images, 2);
  assert.equal(res.recompressed, 2);
  assert.ok(
    res.bytes.length < src.length / 5,
    `expected big reduction, got ${src.length} -> ${res.bytes.length}`,
  );
  assert.ok(progress >= 2);
  const out = await PDFDocument.load(res.bytes);
  assert.equal(out.getPageCount(), 2);
  for (const [, s] of imageStreams(out))
    assert.equal(s.dict.get(PDFName.of("Filter")), PDFName.of("DCTDecode"));
  // The replaced image streams are gone, not just unreferenced.
  assert.equal(imageStreams(out).length, 2);
});

test("decodes PNG-predicted images", async () => {
  const src = await imagePdf(1, 300, true);
  const res = await compressPdf(src, "strong", fakeReencode);
  assert.equal(res.recompressed, 1);
});

test("saving after deleting pages drops their objects", async () => {
  const src = await imagePdf(3, 400);
  const pages: PageRef[] = [{ id: "p", src: "a", index: 0, rotation: 0 }];
  const content: DocContent = {
    pages,
    annots: [],
    watermark: null,
    pageNumbers: null,
    meta: {},
    forms: {},
  };
  const out = await buildPdf({ content, sources: { a: src }, primary: "a" });
  assert.ok(out.length < src.length / 2, `${src.length} -> ${out.length}`);
  assert.equal(imageStreams(await PDFDocument.load(out)).length, 1);
});

test("merges whole files in order", async () => {
  const a = await imagePdf(2, 50);
  const b = await imagePdf(1, 50);
  const merged = await PDFDocument.load(await mergePdfs([a, b, a]));
  assert.equal(merged.getPageCount(), 5);
});
