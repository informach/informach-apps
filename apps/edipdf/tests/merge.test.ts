import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDict, PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { mergePdfs } from "../src/shared/build.ts";
import { mergeRequestSchema } from "../src/shared/merge-format.ts";
import { livePdfPages } from "../src/shared/pdf-pages.ts";

test("ordered merge keeps namespaced form values and prunes ghost pages referenced by removed widgets", async () => {
  const document = await PDFDocument.create();
  document.addPage();
  document.addPage();
  const field = document.getForm().createTextField("nome");
  field.setText("Atual");
  for (const page of document.getPages())
    field.addToPage(page, { x: 30, y: 200, width: 200, height: 25 });
  document.removePage(0);
  const source = await document.save(),
    immutable = new Uint8Array(source),
    progress: number[] = [],
    bytes = await mergePdfs([source, source], {
      maxPages: 2,
      progress: (index) => progress.push(index),
    }),
    output = await PDFDocument.load(bytes);
  assert.deepEqual(progress, [0, 1]);
  assert.equal(livePdfPages(output).length, 2);
  const fields = output.getForm().getFields();
  assert.equal(fields.length, 2);
  assert.equal(new Set(fields.map((field) => field.getName())).size, 2);
  for (const field of fields) {
    assert.equal(field.acroField.getWidgets().length, 1);
    assert.equal(output.getForm().getTextField(field.getName()).getText(), "Atual");
  }
  assert.equal(
    output.context
      .enumerateIndirectObjects()
      .filter(
        ([, object]) =>
          object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Page"),
      ).length,
    2,
  );
  assert.deepEqual(source, immutable);
});

test("merge refuses invalid page counts and exceeded page budgets without returning a partial output", async () => {
  const document = await PDFDocument.create();
  document.addPage();
  document.addPage();
  const bytes = await document.save();
  await assert.rejects(() => mergePdfs([bytes], { maxPages: 1 }), /até 1 páginas/);
  document.catalog.Pages().set(PDFName.of("Count"), PDFNumber.of(1));
  const malformed = await document.save();
  await assert.rejects(() => mergePdfs([malformed]), /Contagem inconsistente/);
  assert.throws(
    () => mergeRequestSchema.parse({ files: [{ name: "image.svg", bytes }] }),
    /PDF, PNG ou JPEG/,
  );
});
