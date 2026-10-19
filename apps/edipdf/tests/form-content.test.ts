import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { PDFDict, PDFDocument, PDFName, PDFRawStream, rgb } from "pdf-lib";
import {
  listFormOccurrences,
  mergeEditedFormContent,
  prepareFormContent,
  transformFormContent,
} from "../src/shared/form-content.ts";
import { cropPdfImage } from "../src/shared/image-crop.ts";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";

const require = createRequire(import.meta.url),
  engine = await LocalPdfEngine.create(
    await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
  ),
  italic = new Uint8Array(
    await readFile(new URL("../resources/fonts/NotoSans-Italic.ttf", import.meta.url)),
  );
async function fixture(): Promise<Uint8Array> {
  const source = await PDFDocument.create(),
    child = source.addPage([200, 100]);
  child.drawText("ORIGINAL_CHILD", { x: 10, y: 60, size: 14 });
  child.drawRectangle({ x: 10, y: 10, width: 40, height: 20, color: rgb(1, 0, 0) });
  child.drawImage(
    await source.embedPng(
      await readFile(new URL("./fixtures/tiff/rgb-raw-1.png", import.meta.url)),
    ),
    { x: 60, y: 10, width: 80, height: 40 },
  );
  const document = await PDFDocument.create(),
    [form] = await document.embedPdf(await source.save(), [0]);
  assert.ok(form);
  const first = document.addPage([600, 800]);
  first.drawPage(form, { x: 30, y: 500, width: 200, height: 100 });
  first.drawPage(form, { x: 300, y: 500, width: 200, height: 100 });
  document.addPage([600, 800]).drawPage(form, { x: 30, y: 500, width: 200, height: 100 });
  const field = document.getForm().createTextField("peer");
  field.setText("PRESERVED");
  field.addToPage(first, { x: 30, y: 700, width: 200, height: 30 });
  return document.save();
}
const text = (bytes: Uint8Array) =>
  engine
    .textDocument(bytes, { includeAnnotations: false, layout: true })
    .pages.map((page) => page.glyphs.map((glyph) => glyph.text).join(""));
test("isolated Form text editing persists Unicode/font and preserves shared occurrences, fields, geometry and source", async () => {
  const original = await fixture(),
    snapshot = new Uint8Array(original),
    occurrences = await listFormOccurrences(original, 0);
  assert.equal(occurrences.length, 2);
  assert.deepEqual(occurrences[0]?.matrix, [1, 0, 0, 1, 30, 500]);
  const prepared = await prepareFormContent(original, 0, 0),
    inside = engine.inspect(prepared.bytes).pages[prepared.page]?.objects;
  assert.ok(inside);
  const object = inside.find((object) => object.type === 1);
  assert.ok(object);
  const edited = await transformFormContent(engine, original, 0, 0, {
      kind: "text",
      page: 0,
      object: object.index,
      text: "EDITADO β",
      font: italic,
    }),
    actual = text(edited);
  assert.match(actual[0] ?? "", /EDITADO β/);
  assert.equal((actual[0]?.match(/ORIGINAL_CHILD/g) ?? []).length, 1);
  assert.equal(actual[1], "ORIGINAL_CHILD");
  const reopened = await PDFDocument.load(edited);
  const originalPdf = await PDFDocument.load(original),
    originalAppearance = originalPdf
      .getForm()
      .getTextField("peer")
      .acroField.getWidgets()[0]
      ?.getAppearances()?.normal,
    actualAppearance = reopened
      .getForm()
      .getTextField("peer")
      .acroField.getWidgets()[0]
      ?.getAppearances()?.normal;
  assert.ok(originalAppearance instanceof PDFRawStream && actualAppearance instanceof PDFRawStream);
  assert.deepEqual(actualAppearance.contents, originalAppearance.contents);
  assert.equal(reopened.getPageCount(), 2);
  assert.equal(reopened.getForm().getTextField("peer").getText(), "PRESERVED");
  assert.deepEqual(
    await listFormOccurrences(edited, 0),
    occurrences.map((occurrence, index) =>
      index ? occurrence : { ...occurrence, name: "EdiFormCopy1" },
    ),
  );
  assert.deepEqual(
    engine.renderPage(edited, 1, 72).pixels,
    engine.renderPage(original, 1, 72).pixels,
  );
  assert.deepEqual(original, snapshot);
});
test("isolated Form removal affects one occurrence and moving a child persists its local coordinates", async () => {
  const original = await fixture(),
    prepared = await prepareFormContent(original, 0, 0),
    child = engine
      .inspect(prepared.bytes)
      .pages[prepared.page]?.objects.find((object) => object.type === 1);
  assert.ok(child);
  const deleted = await transformFormContent(engine, original, 0, 0, {
    kind: "delete",
    page: 0,
    object: child.index,
  });
  assert.equal(text(deleted)[0], "ORIGINAL_CHILD");
  assert.equal(text(deleted)[1], "ORIGINAL_CHILD");
  assert.deepEqual(
    engine.renderPage(deleted, 1, 72).pixels,
    engine.renderPage(original, 1, 72).pixels,
  );
  const matrix = [...child.matrix];
  matrix[4] += 20;
  const moved = await transformFormContent(engine, original, 0, 0, {
      kind: "transform",
      page: 0,
      object: child.index,
      matrix: [matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]],
    }),
    reopened = await prepareFormContent(moved, 0, 0),
    actual = engine
      .inspect(reopened.bytes)
      .pages[reopened.page]?.objects.find((object) => object.type === 1);
  assert.ok(actual);
  assert.ok(Math.abs(actual.matrix[4] - (child.matrix[4] + 20)) < 0.001);
  assert.deepEqual(
    engine.renderPage(moved, 1, 72).pixels,
    engine.renderPage(original, 1, 72).pixels,
  );
  const outside = await transformFormContent(engine, original, 0, 0, {
    kind: "transform",
    page: 0,
    object: child.index,
    matrix: [
      child.matrix[0],
      child.matrix[1],
      child.matrix[2],
      child.matrix[3],
      250,
      child.matrix[5],
    ],
  });
  assert.deepEqual(
    engine.renderPage(outside, 0, 72).pixels,
    engine.renderPage(deleted, 0, 72).pixels,
    "The original Form BBox must still clip the moved text without removing its sibling drawing.",
  );
});
test("isolated image cropping preserves actual pixels and other Form occurrences", async () => {
  const original = await fixture(),
    prepared = await prepareFormContent(original, 0, 0),
    child = engine.inspect(prepared.bytes).pages[0]?.objects.find((object) => object.type === 3);
  assert.ok(child);
  const image = engine.imagePixels(prepared.bytes, 0, child.index),
    start = Math.ceil(image.width / 2);
  assert.ok(image.width >= 2);
  const cropped = await cropPdfImage(engine, prepared.bytes, 0, child.index, {
      x: 0.5,
      y: 0,
      w: 0.5,
      h: 1,
    }),
    output = await mergeEditedFormContent(original, 0, 0, cropped),
    reopened = await prepareFormContent(output, 0, 0),
    actual = engine.imagePixels(reopened.bytes, 0, child.index),
    expected = new Uint8Array((image.width - start) * image.height * 4);
  for (let y = 0; y < image.height; y++)
    expected.set(
      image.pixels.subarray((y * image.width + start) * 4, (y + 1) * image.width * 4),
      y * (image.width - start) * 4,
    );
  assert.equal(actual.width, image.width - start);
  assert.equal(actual.height, image.height);
  assert.deepEqual(actual.pixels, expected);
  assert.deepEqual(
    engine.renderPage(output, 1, 72).pixels,
    engine.renderPage(original, 1, 72).pixels,
  );
});

test("removing the last child leaves a valid empty Form and an inspectable page", async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 100]).drawText("LAST_CHILD", { x: 10, y: 60, size: 14 });
  const document = await PDFDocument.create(),
    [form] = await document.embedPdf(await source.save(), [0]);
  assert.ok(form);
  document.addPage([300, 200]).drawPage(form);
  const original = await document.save(),
    output = await transformFormContent(engine, original, 0, 0, {
      kind: "delete",
      page: 0,
      object: 0,
    });
  assert.equal(text(output)[0], "");
  assert.equal(engine.inspect(output).pages.length, 1);
  assert.ok(engine.renderPage(output, 0, 72).pixels.every((pixel) => pixel === 255));
});

test("internal Form editing preserves rotated, mirrored and skewed placements with a nonzero BBox origin", async () => {
  const sourceBytes = await fixture(),
    first = (await listFormOccurrences(sourceBytes, 0))[0];
  assert.ok(first);
  for (const matrix of [
    [0, 1, -1, 0, 200, 300],
    [-1, 0, 0, 1, 250, 500],
    [1, 0.2, 0.3, 1, 30, 400],
  ]) {
    const document = await PDFDocument.load(sourceBytes),
      page = document.getPage(0),
      name = PDFName.of(first.name),
      resource = page.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict)?.lookup(name);
    assert.ok(resource instanceof PDFRawStream);
    resource.dict.set(PDFName.of("BBox"), document.context.obj([-10, -20, 200, 100]));
    page.node.set(
      PDFName.of("Contents"),
      document.context.register(
        document.context.flateStream(
          `q ${matrix.join(" ")} cm ${name.toString()} Do Q\nq 1 0 0 1 300 500 cm ${name.toString()} Do Q`,
        ),
      ),
    );
    const input = await document.save({ updateFieldAppearances: false }),
      prepared = await prepareFormContent(input, 0, 0),
      child = engine.inspect(prepared.bytes).pages[0]?.objects.find((object) => object.type === 1);
    assert.ok(child);
    const output = await transformFormContent(engine, input, 0, 0, {
      kind: "text",
      page: 0,
      object: child.index,
      text: "LOCAL β",
      font: italic,
    });
    assert.deepEqual(
      await listFormOccurrences(output, 0),
      (await listFormOccurrences(input, 0)).map((item, index) =>
        index ? item : { ...item, name: "EdiFormCopy1" },
      ),
    );
    assert.match(text(output)[0] ?? "", /LOCAL β/);
    assert.equal(text(output)[1], "ORIGINAL_CHILD");
    assert.deepEqual(
      engine.renderPage(output, 1, 72).pixels,
      engine.renderPage(input, 1, 72).pixels,
    );
  }
});

test("Form bridge refuses unsupported wrappers, transparency, nonidentity Form matrices and safe-redaction substitution", async () => {
  const original = await fixture();
  await assert.rejects(() => prepareFormContent(original, 0, 99), /inexistente/);
  await assert.rejects(
    () =>
      transformFormContent(engine, original, 0, 0, {
        kind: "redact",
        page: 0,
        rect: { left: 0, bottom: 0, right: 20, top: 20 },
      }),
    /sanitização/,
  );
  const document = await PDFDocument.load(original);
  document.getPage(0).drawText("ROOT_TEXT", { x: 30, y: 100 });
  await assert.rejects(async () => listFormOccurrences(await document.save(), 0), /perfil/);
  const transparent = await PDFDocument.load(original);
  transparent
    .getPage(0)
    .node.set(PDFName.of("Group"), transparent.context.obj({ S: "Transparency" }));
  await assert.rejects(async () => listFormOccurrences(await transparent.save(), 0), /perfil/);
  const transformed = await PDFDocument.load(original),
    occurrence = (await listFormOccurrences(original, 0))[0];
  assert.ok(occurrence);
  const xobjects = transformed
      .getPage(0)
      .node.Resources()
      ?.lookupMaybe(PDFName.of("XObject"), PDFDict),
    form = xobjects?.lookup(PDFName.of(occurrence.name));
  assert.ok(form instanceof PDFRawStream);
  form.dict.set(PDFName.of("Matrix"), transformed.context.obj([1, 0, 0, 1, 10, 0]));
  await assert.rejects(async () => listFormOccurrences(await transformed.save(), 0), /perfil/);
});
