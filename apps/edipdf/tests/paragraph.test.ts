import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFString,
} from "pdf-lib";
import {
  decodePdfString,
  readAnnotationEnvelope,
  writeAnnotationEnvelope,
} from "../src/shared/annotation-envelope.ts";
import { buildPdf } from "../src/shared/build.ts";
import { annotationSchema } from "../src/shared/document-format.ts";
import type { ParagraphAnnot } from "../src/shared/model.ts";
import { changePageGeometry } from "../src/shared/page-geometry.ts";
import { embedParagraphFont, paragraphRequiredText } from "../src/shared/paragraph-font.ts";
import { layoutParagraph } from "../src/shared/paragraph-layout.ts";
import { takeEditableAnnotations } from "../src/shared/pdf-annotations.ts";

const bytes = new Uint8Array(
  await readFile(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url)),
);
const fonts = { regular: bytes, bold: bytes, italic: bytes, boldItalic: bytes };
const box = (): ParagraphAnnot => ({
  id: "paragraph",
  page: "p",
  kind: "paragraph",
  x: 20,
  y: 20,
  w: 180,
  h: 240,
  text: "Primeiro parágrafo com palavras que devem quebrar.\nSegunda linha com edição áβ.",
  size: 12,
  color: "#111111",
  align: "left",
  spacing: 1.1,
  padding: 8,
  list: "none",
});
test("paragraph layout wraps exact font metrics, aligns, hangs list markers and refuses overflow", async () => {
  const a = box(),
    pdf = await PDFDocument.create(),
    font = await embedParagraphFont(pdf, bytes, paragraphRequiredText({ ...a, list: "bullet" }));
  const layout = layoutParagraph(a, font);
  assert.ok(layout.lines > 2);
  assert.ok(
    layout.runs.every((run) => run.x >= a.padding && run.x + run.width <= a.w - a.padding + 0.01),
  );
  const right = layoutParagraph({ ...a, align: "right" }, font);
  assert.ok(right.runs.every((run) => Math.abs(run.x + run.width - a.w + a.padding) < 0.01));
  const list = layoutParagraph({ ...a, list: "bullet" }, font);
  assert.equal(list.runs.filter((run) => run.text === "•").length, 2);
  assert.ok(
    list.runs.filter((run) => run.text !== "•").every((run) => run.x >= a.padding + a.size * 1.5),
  );
  const long = layoutParagraph({ ...a, text: "abcdefghij".repeat(10) }, font);
  assert.equal(long.runs.map((run) => run.text).join(""), "abcdefghij".repeat(10));
  assert.throws(() => layoutParagraph({ ...a, h: 20 }, font), /ultrapassa/);
  assert.throws(() => layoutParagraph({ ...a, w: 1 }, font), /área útil/);
  assert.throws(() => annotationSchema.parse({ ...a, text: " \n " }), /Digite/);
});
test("paragraph native appearance and v2 editable envelope preserve a selected font and original frame", async () => {
  const a = {
    ...box(),
    fontData: { name: "Noto local", data: Buffer.from(bytes).toString("base64") },
  };
  const pdfBytes = await buildPdf({
    content: {
      pages: [{ id: "p", src: "", index: 0, rotation: 90, blank: { w: 400, h: 300 } }],
      annots: [a],
      forms: {},
      meta: {},
      watermark: null,
      pageNumbers: null,
    },
    sources: {},
    fonts,
  });
  const pdf = await PDFDocument.load(pdfBytes),
    annotRef = pdf.getPage(0).node.Annots()?.get(0),
    native = annotRef ? pdf.context.lookup(annotRef) : undefined;
  assert.ok(native instanceof PDFDict);
  assert.equal(native.get(PDFName.of("Subtype")), PDFName.of("FreeText"));
  assert.ok(native.has(PDFName.of("AP")) && native.has(PDFName.of("DA")));
  const metadata = native.get(PDFName.of("EdiPDFModel"));
  assert.ok(metadata instanceof PDFRef);
  const envelope = readAnnotationEnvelope(pdf, metadata);
  assert.equal(envelope?.version, 2);
  const reopened = takeEditableAnnotations(pdf).get(0)?.[0];
  assert.ok(reopened?.kind === "paragraph");
  assert.deepEqual(
    { ...reopened, id: a.id, page: a.page, fontData: undefined },
    { ...a, fontData: undefined },
  );
  assert.equal(reopened.fontData?.name, a.fontData.name);
  assert.equal(
    createHash("sha256")
      .update(reopened.fontData?.data ?? "")
      .digest("hex"),
    createHash("sha256").update(a.fontData.data).digest("hex"),
  );
  const scaled = await PDFDocument.load(
    await changePageGeometry(pdfBytes, 0, { kind: "scale", factor: 2 }),
  );
  const moved = takeEditableAnnotations(scaled).get(0)?.[0];
  assert.ok(moved?.kind === "paragraph");
  assert.deepEqual(
    { x: moved.x, y: moved.y, w: moved.w, h: moved.h, size: moved.size, padding: moved.padding },
    { x: 40, y: 40, w: 360, h: 480, size: 24, padding: 16 },
  );
});

test("large legacy Unicode metadata and bounded v2 streams reopen without an unbounded code-point call", async () => {
  const pdf = await PDFDocument.create(),
    text = "áβ🙂".repeat(10000);
  assert.equal(decodePdfString(PDFHexString.fromText(text)), text);
  assert.equal(decodePdfString(PDFString.of("a".repeat(200000))), "a".repeat(200000));
  const legacy = PDFHexString.fromText(
    JSON.stringify({
      version: 1,
      annotation: {
        ...box(),
        fontData: { name: "Noto", data: Buffer.from(bytes).toString("base64") },
      },
    }),
  );
  assert.equal(readAnnotationEnvelope(pdf, legacy)?.version, 1);
  const encoded = writeAnnotationEnvelope(pdf, {
    id: "note",
    page: "p",
    kind: "note",
    x: 1,
    y: 2,
    text,
    color: "#ffffff",
  });
  assert.equal(readAnnotationEnvelope(pdf, encoded)?.annotation.kind, "note");
  const invalid = pdf.context.register(
    pdf.context.stream(new Uint8Array([1, 2]), { Filter: "ASCII85Decode" }),
  );
  assert.throws(() => readAnnotationEnvelope(pdf, invalid), /Compressão/);
  assert.throws(() => readAnnotationEnvelope(pdf, PDFString.of("{invalid")), /corrompido/);
});

test("a font that forbids subsetting is embedded whole without changing its rights", async () => {
  const full = new Uint8Array(bytes),
    view = new DataView(full.buffer);
  let os2: number | undefined;
  for (let at = 12; at < 12 + view.getUint16(4) * 16; at += 16)
    if (new TextDecoder().decode(full.subarray(at, at + 4)) === "OS/2")
      os2 = view.getUint32(at + 8);
  assert.notEqual(os2, undefined);
  if (os2 === undefined) throw new Error("Fixture has no embedding rights table");
  view.setUint16(os2 + 8, 8 | 256);
  const pdf = await PDFDocument.create();
  const font = await embedParagraphFont(pdf, full, "INTEGRAL");
  pdf.addPage().drawText("INTEGRAL", { font });
  const saved = await PDFDocument.load(await pdf.save());
  const descriptor = saved.context
    .enumerateIndirectObjects()
    .map(([, value]) => value)
    .find((value) => value instanceof PDFDict && value.has(PDFName.of("FontFile2")));
  assert.ok(descriptor instanceof PDFDict);
  const stream = saved.context.lookup(descriptor.get(PDFName.of("FontFile2")));
  assert.ok(stream instanceof PDFRawStream);
  assert.deepEqual(new Uint8Array(decodePDFRawStream(stream).decode()), full);
  assert.equal(view.getUint16(os2 + 8), 8 | 256);
});
