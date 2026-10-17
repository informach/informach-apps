import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { degrees, PDFDocument, StandardFonts } from "pdf-lib";
import { buildPdf, imageToPdf } from "../src/shared/build.ts";
import {
  type DocContent,
  mergeLineRects,
  type PageRef,
  rotateAnnot,
  viewToPdf,
} from "../src/shared/model.ts";

async function samplePdf(
  labels: string[],
  opts: { rotate?: number; form?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const label of labels) {
    const page = doc.addPage([600, 800]);
    page.drawText(label, { x: 50, y: 700, size: 24, font });
    if (opts.rotate) page.setRotation(degrees(opts.rotate));
  }
  if (opts.form) {
    const form = doc.getForm();
    const name = form.createTextField("nome");
    name.addToPage(doc.getPage(0), { x: 50, y: 600, width: 200, height: 24 });
    const ok = form.createCheckBox("aceito");
    ok.addToPage(doc.getPage(labels.length - 1), { x: 50, y: 500, width: 16, height: 16 });
  }
  return doc.save();
}

const empty = (pages: PageRef[]): DocContent => ({
  pages,
  annots: [],
  watermark: null,
  pageNumbers: null,
  meta: {},
  forms: {},
});
const ref = (src: string, index: number, rotation: PageRef["rotation"] = 0): PageRef => ({
  id: `${src}-${index}-${Math.random()}`,
  src,
  index,
  rotation,
});

test("rejects missing sources instead of silently dropping pages", async () => {
  const a = await samplePdf(["A"]);
  await assert.rejects(
    buildPdf({ content: empty([ref("a", 0), ref("missing", 0)]), sources: { a }, primary: "a" }),
    /indisponível/,
  );
});

test("rejects empty documents and invalid page references", async () => {
  const a = await samplePdf(["A"]);
  await assert.rejects(buildPdf({ content: empty([]), sources: {}, primary: null }), /página/);
  for (const index of [-1, 0.5, 9]) {
    await assert.rejects(
      buildPdf({ content: empty([ref("a", index)]), sources: { a }, primary: "a" }),
    );
  }
});

/** Text of every page, through pdf.js, in order. */
async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    standardFontDataUrl: resolve("node_modules/pdfjs-dist/standard_fonts") + "/",
  }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    out.push(
      tc.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" ")
        .trim(),
    );
  }
  await pdf.loadingTask.destroy();
  return out;
}

test("viewToPdf maps the corners for every rotation", () => {
  const crop = { x: 0, y: 0, w: 600, h: 800 };
  assert.deepEqual(viewToPdf(0, crop, 0, 0), [0, 800]);
  assert.deepEqual(viewToPdf(90, crop, 0, 0), [0, 0]);
  assert.deepEqual(viewToPdf(90, crop, 800, 600), [600, 800]);
  assert.deepEqual(viewToPdf(180, crop, 0, 0), [600, 0]);
  assert.deepEqual(viewToPdf(270, crop, 0, 0), [600, 800]);
});

test("rotating a page carries a rectangle with it", () => {
  const a = {
    id: "a",
    page: "p",
    kind: "rect" as const,
    x: 10,
    y: 20,
    w: 100,
    h: 50,
    stroke: "#000",
    fill: null,
    width: 1,
  };
  const r = rotateAnnot(a, 600, 800, 90);
  assert.deepEqual(
    [
      r.kind === "rect" && r.x,
      r.kind === "rect" && r.y,
      r.kind === "rect" && r.w,
      r.kind === "rect" && r.h,
    ],
    [730, 10, 50, 100],
  );
  const back = rotateAnnot(rotateAnnot(rotateAnnot(r, 800, 600, 90), 600, 800, 90), 800, 600, 90);
  assert.deepEqual(back, a);
});

test("selection rectangles merge per line", () => {
  const merged = mergeLineRects([
    { x: 10, y: 10, w: 20, h: 12 },
    { x: 30, y: 10, w: 20, h: 12 },
    { x: 10, y: 30, w: 40, h: 12 },
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], { x: 10, y: 10, w: 40, h: 12 });
});

test("reorders, duplicates, deletes and rotates pages", async () => {
  const a = await samplePdf(["A1", "A2", "A3"]);
  const pages = [ref("a", 2), ref("a", 0, 90), ref("a", 2)];
  const out = await buildPdf({ content: empty(pages), sources: { a }, primary: "a" });
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 3);
  assert.equal(doc.getPage(1).getRotation().angle, 90);
  assert.deepEqual(await pageTexts(out), ["A3", "A1", "A3"]);
});

test("merges pages from another file and inserts blank pages", async () => {
  const a = await samplePdf(["A1"]);
  const b = await samplePdf(["B1", "B2"], { rotate: 90 });
  const pages = [
    ref("b", 1),
    ref("a", 0),
    { id: "blank", src: "", index: 0, rotation: 0 as const, blank: { w: 300, h: 300 } },
    ref("b", 0, 90),
  ];
  const out = await buildPdf({ content: empty(pages), sources: { a, b }, primary: "a" });
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 4);
  assert.equal(doc.getPage(0).getRotation().angle, 90);
  assert.equal(doc.getPage(3).getRotation().angle, 180);
  assert.deepEqual(doc.getPage(2).getSize(), { width: 300, height: 300 });
  assert.deepEqual(await pageTexts(out), ["B2", "A1", "", "B1"]);
});

test("draws text annotations upright on rotated pages", async () => {
  const a = await samplePdf(["A1"]);
  const page = ref("a", 0, 90);
  const content = empty([page]);
  content.annots.push({
    id: "t",
    page: page.id,
    kind: "text",
    x: 40,
    y: 40,
    text: "Olá, ação!\nSegunda linha",
    font: "helvetica",
    size: 14,
    color: "#1d4ed8",
  });
  content.annots.push({
    id: "r",
    page: page.id,
    kind: "rect",
    x: 10,
    y: 10,
    w: 50,
    h: 20,
    stroke: "#ff0000",
    fill: "#ffffff",
    width: 2,
  });
  content.annots.push({
    id: "i",
    page: page.id,
    kind: "ink",
    paths: [[10, 10, 20, 30, 40, 20, 60, 50]],
    stroke: "#000000",
    width: 2,
  });
  content.annots.push({
    id: "h",
    page: page.id,
    kind: "highlight",
    rects: [{ x: 40, y: 40, w: 60, h: 16 }],
    color: "#ffe45c",
  });
  content.annots.push({
    id: "n",
    page: page.id,
    kind: "note",
    x: 100,
    y: 100,
    text: "Revisar",
    color: "#f59e0b",
  });
  content.annots.push({
    id: "l",
    page: page.id,
    kind: "arrow",
    x1: 100,
    y1: 200,
    x2: 200,
    y2: 260,
    stroke: "#16a34a",
    width: 3,
  });
  content.watermark = { text: "CONFIDENCIAL", size: 60, color: "#ff0000", opacity: 0.2, angle: 45 };
  content.pageNumbers = {
    format: "Página {n} de {total}",
    position: "bottom-center",
    size: 10,
    color: "#333333",
    start: 1,
  };
  content.meta = { title: "Teste", author: "EdiPDF" };
  const out = await buildPdf({ content, sources: { a }, primary: "a" });
  const [text] = await pageTexts(out);
  for (const s of ["A1", "Olá, ação!", "Segunda linha", "CONFIDENCIAL", "Página 1 de 1"])
    assert.ok(text.includes(s), `missing "${s}" in "${text}"`);
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getTitle(), "Teste");
  assert.equal(doc.getPage(0).node.Annots()?.size(), 1);
});

test("fills form fields and drops fields of deleted pages", async () => {
  const a = await samplePdf(["A1", "A2"], { form: true });
  const content = empty([ref("a", 0)]);
  content.forms = { nome: "Maria da Silva", aceito: true };
  const out = await buildPdf({ content, sources: { a }, primary: "a" });
  const form = (await PDFDocument.load(out)).getForm();
  assert.equal(form.getTextField("nome").getText(), "Maria da Silva");
  assert.deepEqual(
    form.getFields().map((f) => f.getName()),
    ["nome"],
  );
});

test("wraps images in a one-page PDF", async () => {
  // 1x1 red PNG.
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
    ),
    (c) => c.charCodeAt(0),
  );
  const doc = await PDFDocument.load(await imageToPdf(png));
  assert.equal(doc.getPageCount(), 1);
});

test("clearing a dropdown removes its previous selection in saved PDF", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const field = pdf.getForm().createDropdown("choice");
  field.addOptions(["A", "B"]);
  field.select("A");
  field.addToPage(page);
  const a = await pdf.save();
  const content = empty([ref("a", 0)]);
  content.forms.choice = "";
  const saved = await PDFDocument.load(await buildPdf({ content, sources: { a }, primary: "a" }));
  assert.deepEqual(saved.getForm().getDropdown("choice").getSelected(), []);
});

test("invalid form edits fail explicitly instead of saving the old value", async () => {
  const a = await samplePdf(["A"], { form: true });
  const content = empty([ref("a", 0)]);
  content.forms.missing = "Must not be silently lost";
  await assert.rejects(buildPdf({ content, sources: { a }, primary: "a" }), /missing/);
});
