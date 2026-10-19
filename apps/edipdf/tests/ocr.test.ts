import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { ocrResultSchema } from "@informach/edi-ocr";
import { findTextMatches, plainText } from "@informach/edi-ocr/search";
import { decodePDFRawStream, degrees, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import { addOcrLayer } from "../src/shared/ocr.ts";
import { clearOcrBookkeeping } from "../src/shared/ocr-bookkeeping.ts";
import { REDACTION_SANITIZE, sanitizePdf } from "../src/shared/pdf-sanitize.ts";

const require = createRequire(import.meta.url);
const engine = await LocalPdfEngine.create(
  await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
);
const font = await readFile(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url));
const result = {
  width: 600,
  height: 800,
  confidence: 90,
  words: [
    { text: "Ação", confidence: 94, x0: 60, y0: 100, x1: 110, y1: 120, line: 0 },
    { text: "local", confidence: 60, x0: 120, y0: 100, x1: 170, y1: 120, line: 0 },
  ],
};

async function pixels(bytes: Uint8Array): Promise<Uint8Array> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(1),
      viewport = page.getViewport({ scale: 1 });
    const canvasRequire = createRequire(require.resolve("pdfjs-dist/package.json"));
    const { createCanvas } = canvasRequire("@napi-rs/canvas");
    const canvas = createCanvas(viewport.width, viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
    return new Uint8Array(
      canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data,
    );
  } finally {
    await task.destroy();
  }
}

test("OCR creates searchable Unicode text, preserves forms and replaces only its own stream", async () => {
  const original = await PDFDocument.create();
  const page = original.addPage([600, 800]);
  page.drawRectangle({ x: 50, y: 400, width: 200, height: 200 });
  page.drawText("EXTERNO", { x: 50, y: 750 });
  const field = original.getForm().createTextField("nome");
  field.setText("PRESERVADO");
  field.addToPage(page, { x: 10, y: 30, width: 150, height: 20 });
  const originalBytes = await original.save();
  const first = await addOcrLayer(originalBytes, [{ page: 0, result, turn: 0, skew: 0 }], font);
  const text = plainText(engine.textDocument(first, { includeAnnotations: false }).pages[0].glyphs);
  assert.match(text, /Ação/);
  assert.match(text, /local/);
  assert.match(text, /EXTERNO/);
  const boxes = findTextMatches(
    engine.textDocument(first, { includeAnnotations: false }).pages[0].glyphs,
    "Ação",
  )[0].rects;
  const bounds = {
    left: Math.min(...boxes.map((box) => box.x)),
    top: Math.min(...boxes.map((box) => box.y)),
    right: Math.max(...boxes.map((box) => box.x + box.w)),
    bottom: Math.max(...boxes.map((box) => box.y + box.h)),
  };
  assert.ok(Math.abs(bounds.left - 60) < 0.1 && Math.abs(bounds.right - 110) < 0.1);
  // Fontkit outline bounds and PDFium glyph bounds differ slightly; stay within 0.5 pt (0.18 mm).
  assert.ok(
    Math.abs(bounds.top - 100) < 0.5 && Math.abs(bounds.bottom - 120) < 0.5,
    JSON.stringify(bounds),
  );
  const updated = await addOcrLayer(
    first,
    [
      {
        page: 0,
        result: { ...result, words: [{ ...result.words[0], text: "Correção" }] },
        turn: 0,
        skew: 0,
      },
    ],
    font,
  );
  const after = plainText(
    engine.textDocument(updated, { includeAnnotations: false }).pages[0].glyphs,
  );
  assert.match(after, /Correção/);
  assert.doesNotMatch(after, /Ação|local/);
  assert.match(after, /EXTERNO/);
  const document = await PDFDocument.load(updated);
  assert.equal(document.getForm().getTextField("nome").getText(), "PRESERVADO");
  assert.ok(document.getPage(0).node.has(PDFName.of("EdiOCRStream")));
  assert.deepEqual(
    await pixels(updated),
    await pixels(originalBytes),
    "Hidden OCR text must preserve visible content pixel for pixel",
  );
});

test("OCR maps rotated cropped pages to their physical PDF coordinates", async () => {
  const original = await PDFDocument.create();
  const page = original.addPage([800, 900]);
  page.setCropBox(100, 50, 600, 800);
  page.setRotation(degrees(90));
  const bytes = await addOcrLayer(
    await original.save(),
    [{ page: 0, result: { ...result, width: 800, height: 600 }, turn: 0, skew: 0 }],
    font,
  );
  const text = engine.textDocument(bytes, { includeAnnotations: false });
  assert.match(plainText(text.pages[0].glyphs), /Ação/);
  const doc = await PDFDocument.load(bytes);
  assert.deepEqual(doc.getPage(0).getCropBox(), { x: 100, y: 50, width: 600, height: 800 });
  assert.equal(doc.getPage(0).getRotation().angle, 90);
});

test("OCR rejects malformed boxes, excess resources and unsupported glyphs without producing a replacement", async () => {
  assert.equal(
    ocrResultSchema.safeParse({ ...result, words: [{ ...result.words[0], x1: 900 }] }).success,
    false,
  );
  assert.equal(ocrResultSchema.safeParse({ ...result, width: 8192, height: 8192 }).success, false);
  const doc = await PDFDocument.create();
  doc.addPage();
  await assert.rejects(
    addOcrLayer(
      await doc.save(),
      [
        {
          page: 0,
          result: { ...result, words: [{ ...result.words[0], text: "漢" }] },
          turn: 0,
          skew: 0,
        },
      ],
      font,
    ),
    /não contém/,
  );
});

test("redaction drops OCR bookkeeping before native edits so old hidden streams cannot remain reachable", async () => {
  const source = await PDFDocument.create();
  source.addPage([600, 800]).drawText("PUBLICO", { x: 50, y: 100 });
  const ocr = await addOcrLayer(
    await source.save(),
    [
      {
        page: 0,
        result: { ...result, words: [{ ...result.words[0], text: "SEGREDO_OCR" }] },
        turn: 0,
        skew: 0,
      },
    ],
    font,
  );
  const before = await PDFDocument.load(ocr);
  const old = before.context.lookup(before.getPage(0).node.get(PDFName.of("EdiOCRStream")));
  assert.ok(old instanceof PDFRawStream);
  const oldContents = decodePDFRawStream(old).decode();
  const sanitized = await sanitizePdf(ocr, REDACTION_SANITIZE);
  assert.equal(
    (await PDFDocument.load(sanitized)).getPage(0).node.has(PDFName.of("EdiOCRStream")),
    false,
  );
  const final = await sanitizePdf(
    engine.transform(sanitized, [
      { kind: "redact", page: 0, rect: { left: 50, bottom: 670, right: 200, top: 715 } },
    ]),
    REDACTION_SANITIZE,
  );
  const text = plainText(engine.textDocument(final, { includeAnnotations: false }).pages[0].glyphs);
  assert.doesNotMatch(text, /SEGREDO/);
  assert.match(text, /PUBLICO/);
  const document = await PDFDocument.load(final);
  for (const [, value] of document.context.enumerateIndirectObjects())
    if (value instanceof PDFRawStream && !value.dict.has(PDFName.of("Subtype"))) {
      assert.notDeepEqual(
        decodePDFRawStream(value).decode(),
        oldContents,
        "Pre-redaction OCR stream must not survive as private reachable data",
      );
    }
});

test("ordinary content edits cannot retain stale owned OCR streams containing the replaced text", async () => {
  const source = await PDFDocument.create();
  source.addPage([600, 800]);
  const ocr = await addOcrLayer(
    await source.save(),
    [
      {
        page: 0,
        result: { ...result, words: [{ ...result.words[0], text: "ANTIGO_OCR" }] },
        turn: 0,
        skew: 0,
      },
    ],
    font,
  );
  const ready = await clearOcrBookkeeping(ocr, [0]);
  assert.equal(
    (await PDFDocument.load(ready)).getPage(0).node.has(PDFName.of("EdiOCRStream")),
    false,
  );
  assert.match(
    plainText(engine.textDocument(ready, { includeAnnotations: false }).pages[0].glyphs),
    /ANTIGO_OCR/,
  );
  const item = engine
    .inspect(ready)
    .pages[0].objects.find((object) => object.text.includes("ANTIGO_OCR"));
  assert.ok(item);
  const edited = engine.transform(ready, [
    { kind: "text", page: 0, object: item.index, text: "NOVO_OCR", font },
  ]);
  const text = plainText(
    engine.textDocument(edited, { includeAnnotations: false }).pages[0].glyphs,
  );
  assert.match(text, /NOVO_OCR/);
  assert.doesNotMatch(text, /ANTIGO_OCR/);
  assert.equal(
    Buffer.compare(await pixels(edited), await pixels(ready)),
    0,
    "Correcting hidden OCR text must preserve invisible rendering",
  );
});
