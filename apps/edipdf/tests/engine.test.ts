import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFString,
  StandardFonts,
} from "pdf-lib";
import { buildPdf, loadPdf, ProtectedPdfError } from "../src/shared/build.ts";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import type { DocContent } from "../src/shared/model.ts";
import { changePageGeometry } from "../src/shared/page-geometry.ts";
import { takeEditableAnnotations } from "../src/shared/pdf-annotations.ts";
import { REDACTION_SANITIZE, sanitizePdf } from "../src/shared/pdf-sanitize.ts";
import { findTextMatches, plainText } from "../src/shared/text-search.ts";

const require = createRequire(import.meta.url);
const wasm = await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm"));
const engine = await LocalPdfEngine.create(wasm);
const font = await readFile(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url));
const fonts = { regular: font, bold: font, italic: font, boldItalic: font };
const empty = (): DocContent => ({
  pages: [{ id: "p", src: "a", index: 0, rotation: 0 }],
  annots: [],
  forms: {},
  watermark: null,
  pageNumbers: null,
  meta: {},
});

async function fixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  page.drawText("CONFIDENCIAL", { x: 50, y: 700, size: 20 });
  page.drawText("PUBLICO", { x: 50, y: 600, size: 20 });
  const field = doc.getForm().createTextField("nome");
  field.addToPage(page, { x: 50, y: 500, width: 200, height: 24 });
  field.setText("CAMPO_PRESERVADO");
  doc.addPage([400, 300]).drawText("OUTRA_PAGINA");
  return doc.save();
}
async function texts(bytes: Uint8Array, password?: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: bytes.slice(),
    password,
    standardFontDataUrl: `${resolve("node_modules/pdfjs-dist/standard_fonts")}/`,
  }).promise;
  try {
    const out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      out.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return out;
  } finally {
    await pdf.loadingTask.destroy();
  }
}

test("native text replacement removes the original and preserves other pages and fields", async () => {
  const original = await fixture();
  const changed = engine.transform(original, [
    { kind: "text", page: 0, object: 0, text: "Edição αβγ Ж", font },
  ]);
  const extracted = await texts(changed);
  assert.match(extracted[0], /Edição αβγ Ж/);
  assert.doesNotMatch(extracted.join(" "), /CONFIDENCIAL/);
  assert.match(extracted[0], /PUBLICO/);
  assert.match(extracted[1], /OUTRA_PAGINA/);
  const restored = await PDFDocument.load(changed);
  assert.equal(restored.getForm().getTextField("nome").getText(), "CAMPO_PRESERVADO");
  assert.match((await texts(original))[0], /CONFIDENCIAL/);
});

test("native replacement embeds a selected italic TrueType face and refuses restricted embedding", async () => {
  const original = await fixture(),
    selectedFont = new Uint8Array(
      await readFile(new URL("../resources/fonts/NotoSans-Italic.ttf", import.meta.url)),
    );
  const changed = engine.transform(original, [
    { kind: "text", page: 0, object: 0, text: "Fonte própria áβ", font: selectedFont },
  ]);
  assert.match((await texts(changed))[0], /Fonte própria áβ/);
  const pdf = await PDFDocument.load(changed);
  assert.ok(
    pdf.context
      .enumerateIndirectObjects()
      .some(
        ([, value]) =>
          value instanceof PDFDict &&
          /NotoSans.*Italic/i.test(String(value.get(PDFName.of("BaseFont")))),
      ),
  );
  assert.equal(pdf.getForm().getTextField("nome").getText(), "CAMPO_PRESERVADO");
  const restricted = new Uint8Array(selectedFont),
    view = new DataView(restricted.buffer);
  for (let at = 12; at < 12 + view.getUint16(4) * 16; at += 16) {
    if (new TextDecoder().decode(restricted.subarray(at, at + 4)) !== "OS/2") continue;
    view.setUint16(view.getUint32(at + 8) + 8, 2);
  }
  assert.throws(
    () =>
      engine.transform(original, [
        { kind: "text", page: 0, object: 0, text: "Recusado", font: restricted },
      ]),
    /incorporação/,
  );
  assert.match((await texts(original))[0], /CONFIDENCIAL/);
});

test("conversion text index returns real font emphasis and size without changing the ordinary search payload", async () => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.HelveticaBoldOblique);
  document.addPage([300, 300]).drawText("ENFASE", { x: 30, y: 200, size: 18, font });
  const bytes = await document.save();
  const ordinary = engine.textDocument(bytes, { includeAnnotations: false });
  assert.ok(ordinary.pages[0].glyphs.every((glyph) => !glyph.style));
  const indexed = engine.textDocument(bytes, { includeAnnotations: false, styles: true });
  const style = indexed.pages[0].glyphs.find((glyph) => glyph.text === "E")?.style;
  assert.ok(style);
  assert.equal(style.size, 18);
  assert.equal(style.bold, true);
  assert.equal(style.italic, true);
  assert.match(style.family ?? "", /Helvetica|Arial/i);
});

test("native glyph index includes current FreeText annotations and filled fields with real rotated geometry", async () => {
  const content = empty();
  content.pages[0].rotation = 90;
  content.annots.push({
    id: "text",
    page: "p",
    kind: "text",
    x: 70,
    y: 120,
    text: "NOVO αβγ",
    size: 18,
    font: "helvetica",
    color: "#111111",
  });
  content.forms.nome = "PREENCHIDO";
  const output = await buildPdf({ content, sources: { a: await fixture() }, primary: "a", fonts });
  const index = engine.textDocument(output, { includeAnnotations: true });
  assert.equal(index.pages[0].error, undefined);
  const text = plainText(index.pages[0].glyphs);
  assert.match(text, /NOVO αβγ/);
  assert.match(text, /PREENCHIDO/);
  const result = findTextMatches(index.pages[0].glyphs, "NOVO αβγ");
  assert.equal(result.length, 1);
  assert.ok(
    result[0].rects.every((box) => box.x >= 65 && box.x < 200 && box.y >= 115 && box.y < 150),
  );
});

test("unsupported glyphs and invalid object batches fail before returning any replacement", async () => {
  const original = await fixture();
  assert.throws(
    () => engine.transform(original, [{ kind: "text", page: 0, object: 0, text: "漢", font }]),
    /caractere/,
  );
  assert.throws(
    () =>
      engine.transform(original, [
        { kind: "delete", page: 0, object: 0 },
        { kind: "delete", page: 99, object: 0 },
      ]),
    /Página inexistente/,
  );
  assert.match((await texts(original))[0], /CONFIDENCIAL/);
});

test("image replacement, extraction and partial redaction modify actual pixels", async () => {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(
    Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=",
        "base64",
      ),
    ),
  );
  doc.addPage([200, 200]).drawImage(image, { x: 0, y: 0, width: 100, height: 100 });
  const pixels = new Uint8Array(100 * 100 * 4);
  for (let i = 0; i < 100 * 100; i++) {
    pixels[i * 4 + (i % 100 < 50 ? 0 : 2)] = 255;
    pixels[i * 4 + 3] = 255;
  }
  const replaced = engine.transform(await doc.save(), [
    { kind: "image", page: 0, object: 0, width: 100, height: 100, pixels },
  ]);
  assert.deepEqual(engine.imagePixels(replaced, 0, 0).pixels, pixels);
  const rendered = engine.imagePixels(replaced, 0, 0, true);
  assert.equal(rendered.width, 200);
  assert.equal(rendered.height, 200);
  assert.ok(rendered.pixels[0] > 200 && rendered.pixels[(rendered.width - 1) * 4 + 2] > 200);
  const redacted = engine.transform(replaced, [
    { kind: "redact", page: 0, rect: { left: 0, bottom: 0, right: 50, top: 100 } },
  ]);
  const objects = engine.inspect(redacted).pages[0].objects.filter((item) => item.type === 3);
  assert.ok(objects.length > 0);
  let blue = 0;
  for (const object of objects) {
    const result = engine.imagePixels(redacted, 0, object.index);
    for (let i = 0; i < result.pixels.length; i += 4) {
      assert.ok(
        !(
          result.pixels[i] > 200 &&
          result.pixels[i + 1] < 20 &&
          result.pixels[i + 2] < 20 &&
          result.pixels[i + 3] > 0
        ),
        "Confidential red pixels remained inside an image",
      );
      if (result.pixels[i + 2] > 200 && result.pixels[i] < 20) blue++;
    }
  }
  assert.ok(blue > 1000, "Pixels outside the redaction must remain");
});

test("replacing one shared image instance cannot change another page using the same original resource", async () => {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  for (let index = 0; index < 2; index++)
    doc.addPage([200, 200]).drawImage(image, { x: 0, y: 0, width: 100, height: 100 });
  const original = await doc.save(),
    before = engine.imagePixels(original, 1, 0);
  const pixels = new Uint8Array([255, 0, 0, 255]);
  const replaced = engine.transform(original, [
    { kind: "image", page: 0, object: 0, width: 1, height: 1, pixels },
  ]);
  assert.equal(Buffer.compare(engine.imagePixels(replaced, 0, 0).pixels, pixels), 0);
  assert.equal(Buffer.compare(engine.imagePixels(replaced, 1, 0).pixels, before.pixels), 0);
});

test("AES encryption and authorized local decryption retain vector text and AcroForm", async () => {
  const original = await fixture();
  const encrypted = engine.encrypt(original, {
    user: "abrir123",
    owner: "administrar123",
    print: true,
    copy: false,
    modify: false,
    fill: true,
  });
  await assert.rejects(loadPdf(encrypted), ProtectedPdfError);
  assert.throws(() => engine.inspect(encrypted, "errada"), /código 4/);
  assert.throws(() => engine.decrypt(encrypted, "abrir123"), /administração/);
  assert.match((await texts(encrypted, "abrir123"))[0], /CONFIDENCIAL/);
  const decrypted = engine.decrypt(encrypted, "administrar123");
  assert.equal(engine.inspect(decrypted).encrypted, false);
  assert.equal(
    (await PDFDocument.load(decrypted)).getForm().getTextField("nome").getText(),
    "CAMPO_PRESERVADO",
  );
});

test("redaction removes text, hidden tags, metadata, attachments and overlapping annotations", async () => {
  const doc = await PDFDocument.load(await fixture());
  const page = doc.getPage(0);
  doc.setTitle("CONFIDENCIAL");
  await doc.attach(new TextEncoder().encode("CONFIDENCIAL"), "segredo.txt");
  doc.catalog.set(
    PDFName.of("StructTreeRoot"),
    doc.context.obj({
      Type: "StructTreeRoot",
      K: [{ Type: "StructElem", S: "P", Pg: page.ref, ActualText: PDFString.of("CONFIDENCIAL") }],
    }),
  );
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const stream = doc.context.flateStream(
    new TextEncoder().encode(
      `/Span << /ActualText (CONFIDENCIAL_OCULTO) >> BDC BT /${page.node.newFontDictionary("F", font.ref).decodeText()} 12 Tf 50 750 Td (SECRETO) Tj ET EMC`,
    ),
  );
  page.node.addContentStream(doc.context.register(stream));
  page.node.addAnnot(
    doc.context.register(
      doc.context.obj({
        Type: "Annot",
        Subtype: "Text",
        Rect: [50, 695, 80, 725],
        Contents: PDFString.of("CONFIDENCIAL"),
      }),
    ),
  );
  const before = await sanitizePdf(await doc.save(), REDACTION_SANITIZE);
  const redacted = engine.transform(before, [
    { kind: "redact", page: 0, rect: { left: 45, bottom: 690, right: 240, top: 770 } },
  ]);
  const final = await sanitizePdf(redacted, REDACTION_SANITIZE);
  const extracted = (await texts(final)).join(" ");
  assert.doesNotMatch(extracted, /CONFIDENCIAL|SECRETO/);
  assert.match(extracted, /PUBLICO/);
  assert.match(extracted, /CAMPO_PRESERVADO/);
  const output = await PDFDocument.load(final, { updateMetadata: false });
  assert.equal(output.catalog.has(PDFName.of("StructTreeRoot")), false);
  assert.equal(output.catalog.has(PDFName.of("AcroForm")), false);
  let all = "";
  for (const [, object] of output.context.enumerateIndirectObjects()) {
    all += object.toString();
    if (object instanceof PDFRawStream)
      all += new TextDecoder().decode(decodePDFRawStream(object).decode());
  }
  assert.doesNotMatch(all, /CONFIDENCIAL|SECRETO|ActualText|EmbeddedFiles/);
});

test("Unicode annotations retain exact model text and embed a font; missing glyphs fail explicitly", async () => {
  const content = empty();
  content.annots.push({
    id: "unicode",
    page: "p",
    kind: "text",
    x: 50,
    y: 100,
    text: "Português αβγ Ж",
    font: "helvetica",
    size: 18,
    color: "#111111",
  });
  const bytes = await buildPdf({ content, sources: { a: await fixture() }, primary: "a", fonts });
  const restored = await PDFDocument.load(bytes);
  const annotations = takeEditableAnnotations(restored).get(0);
  assert.equal(annotations?.[0].kind === "text" ? annotations[0].text : "", "Português αβγ Ж");
  content.annots[0] = { ...content.annots[0], text: "漢" };
  await assert.rejects(
    buildPdf({ content, sources: { a: await fixture() }, primary: "a", fonts }),
    /caractere/,
  );
});

test("rotated page scale and crop keep editable annotation geometry aligned", async () => {
  const content = empty();
  content.pages[0].rotation = 90;
  content.annots.push({
    id: "shape",
    page: "p",
    kind: "rect",
    x: 100,
    y: 100,
    w: 80,
    h: 40,
    stroke: "#FF0000",
    fill: null,
    width: 2,
  });
  const bytes = await buildPdf({ content, sources: { a: await fixture() }, primary: "a" });
  const scaled = await changePageGeometry(bytes, 0, { kind: "scale", factor: 0.5 });
  const parsed = await PDFDocument.load(scaled);
  assert.equal(parsed.getPage(0).getRotation().angle, 90);
  const annotations = takeEditableAnnotations(parsed).get(0);
  assert.equal(annotations?.[0].kind === "rect" ? annotations[0].x : 0, 50);
  const cropped = await changePageGeometry(scaled, 0, {
    kind: "crop",
    box: { x: 20, y: 30, w: 300, h: 200 },
  });
  const result = await PDFDocument.load(cropped);
  const restored = takeEditableAnnotations(result).get(0);
  assert.equal(restored?.[0].kind === "rect" ? restored[0].x : 0, 30);
  assert.equal(result.getPage(0).getCropBox().width, 200);
  assert.equal(result.getPage(0).getCropBox().height, 300);
});

test("scaling preserves nonzero page boxes and destination positions", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  page.setMediaBox(10, 20, 600, 800);
  page.setCropBox(50, 80, 400, 500);
  page.drawText("ALINHADO", { x: 80, y: 650, size: 20 });
  doc.catalog.set(
    PDFName.of("OpenAction"),
    doc.context.obj([page.ref, PDFName.of("XYZ"), 80, 650, null]),
  );
  const output = await PDFDocument.load(
    await changePageGeometry(await doc.save(), 0, { kind: "scale", factor: 0.5 }),
  );
  assert.deepEqual(output.getPage(0).getMediaBox(), { x: 5, y: 10, width: 300, height: 400 });
  assert.deepEqual(output.getPage(0).getCropBox(), { x: 25, y: 40, width: 200, height: 250 });
  assert.match(output.catalog.get(PDFName.of("OpenAction"))?.toString() ?? "", /\/XYZ 40 325 null/);
});
