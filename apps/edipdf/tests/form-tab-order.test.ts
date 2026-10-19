import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, StandardFonts } from "pdf-lib";
import { pageWidgetTabOrder, setCustomWidgetTabOrder } from "../src/shared/form-tab-order.ts";

function appearance(document: PDFDocument, name: string): Uint8Array {
  const widget = document.getForm().getTextField(name).acroField.getWidgets()[0];
  assert.ok(widget);
  const ap = widget.dict.lookup(PDFName.of("AP"));
  assert.ok(ap instanceof PDFDict);
  const stream = ap.lookup(PDFName.of("N"));
  assert.ok(stream instanceof PDFRawStream);
  return stream.getContents();
}
test("manual widget order roundtrips with explicit PDF extension and unchanged appearances/non-widgets", async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage(),
    second = pdf.addPage(),
    font = await pdf.embedFont(StandardFonts.Courier);
  for (const [index, name] of ["primeiro", "segundo", "terceiro"].entries()) {
    const field = pdf.getForm().createTextField(name);
    field.setText(name.toUpperCase());
    field.addToPage(page, { x: 20 + index * 120, y: 500, width: 100, height: 30, font });
    field.updateAppearances(font);
    if (index === 1)
      page.node.addAnnot(
        pdf.context.register(
          pdf.context.obj({
            Type: "Annot",
            Subtype: "Text",
            Rect: [10, 10, 30, 30],
            Contents: PDFString.of("COMENTARIO"),
          }),
        ),
      );
  }
  const other = pdf.getForm().createTextField("outra_pagina");
  other.addToPage(second, { x: 30, y: 30, width: 100, height: 30, font });
  other.updateAppearances(font);
  pdf.catalog.set(
    PDFName.of("Extensions"),
    pdf.context.obj({
      OTHER: { BaseVersion: PDFName.of("1.7"), ExtensionLevel: 5 },
      ADBE: { BaseVersion: PDFName.of("1.7"), ExtensionLevel: 8 },
    }),
  );
  const original = await pdf.save(),
    loaded = await PDFDocument.load(original),
    initial = pageWidgetTabOrder(loaded, 0),
    before = appearance(loaded, "primeiro"),
    otherOrder = pageWidgetTabOrder(loaded, 1);
  setCustomWidgetTabOrder(loaded, 0, initial.map((item) => item.id).reverse());
  const saved = await loaded.save({ updateFieldAppearances: false }),
    reopened = await PDFDocument.load(saved);
  assert.deepEqual(
    pageWidgetTabOrder(reopened, 0).map((item) => item.name),
    ["terceiro", "segundo", "primeiro"],
  );
  assert.deepEqual(pageWidgetTabOrder(reopened, 1), otherOrder);
  assert.deepEqual(appearance(reopened, "primeiro"), before);
  assert.equal(reopened.getPage(0).node.get(PDFName.of("Tabs")), PDFName.of("W"));
  const extensions = reopened.catalog.lookup(PDFName.of("Extensions"));
  assert.ok(extensions instanceof PDFDict);
  const adobe = extensions.lookup(PDFName.of("ADBE"));
  assert.ok(adobe instanceof PDFDict);
  assert.equal(String(adobe.get(PDFName.of("ExtensionLevel"))), "8");
  assert.ok(extensions.has(PDFName.of("OTHER")));
  const annotations = reopened.getPage(0).node.Annots();
  assert.ok(annotations);
  const note = reopened.context.lookup(annotations.get(2));
  assert.ok(note instanceof PDFDict);
  assert.equal(note.get(PDFName.of("Subtype")), PDFName.of("Text"));
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"),
    reader = await getDocument({
      data: new Uint8Array(saved),
      standardFontDataUrl: `${resolve("node_modules/pdfjs-dist/standard_fonts")}/`,
    }).promise;
  try {
    const widgets = (await (await reader.getPage(1)).getAnnotations()).filter(
      (item) => item.subtype === "Widget",
    );
    assert.deepEqual(
      widgets.map((item) => item.fieldName),
      ["terceiro", "segundo", "primeiro"],
    );
  } finally {
    await reader.loadingTask.destroy();
  }
});

test("manual order refuses stale/partial/duplicate selections before mutating a PDF", async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage();
  for (const name of ["a", "b"])
    pdf.getForm().createTextField(name).addToPage(page, { x: 20, y: 100, width: 100, height: 20 });
  const initial = pageWidgetTabOrder(pdf, 0),
    ids = initial.map((item) => item.id),
    annots = page.node.Annots()?.toString();
  for (const invalid of [ids.slice(0, 1), ["stale", ids[0] ?? ""], [ids[0] ?? "", ids[0] ?? ""]]) {
    assert.throws(() => setCustomWidgetTabOrder(pdf, 0, invalid));
    assert.equal(page.node.Annots()?.toString(), annots);
    assert.equal(page.node.get(PDFName.of("Tabs")), undefined);
    assert.equal(pdf.catalog.get(PDFName.of("Extensions")), undefined);
  }
  setCustomWidgetTabOrder(pdf, 0, ids.slice().reverse());
  const extensions = pdf.catalog.lookup(PDFName.of("Extensions"));
  assert.ok(extensions instanceof PDFDict);
  const adobe = extensions.lookup(PDFName.of("ADBE"));
  assert.ok(adobe instanceof PDFDict);
  assert.equal(String(adobe.get(PDFName.of("ExtensionLevel"))), "3");
  assert.equal(pdf.catalog.get(PDFName.of("Version")), PDFName.of("1.7"));
});
