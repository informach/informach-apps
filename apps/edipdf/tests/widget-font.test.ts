import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { setFormWidgetFont } from "../src/shared/form-font.ts";
import { widgetFonts } from "../src/shared/widget-font.ts";

const italic = new Uint8Array(
  await readFile(new URL("../resources/fonts/NotoSans-Italic.ttf", import.meta.url)),
);
test("widget font reading preserves built-in styles and shares exact full TrueType programs", async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage(),
    builtin = await pdf.embedFont(StandardFonts.CourierBoldOblique);
  for (const name of ["original", "local1", "local2"]) {
    const field = pdf.getForm().createTextField(name);
    field.setText(name);
    field.addToPage(page, { x: 30, y: 100, width: 200, height: 30, font: builtin });
    field.updateAppearances(builtin);
  }
  await setFormWidgetFont(pdf, "local1", italic);
  await setFormWidgetFont(pdf, "local2", italic);
  const reopened = await PDFDocument.load(await pdf.save({ updateFieldAppearances: false })),
    read = widgetFonts(reopened);
  assert.deepEqual(read.get("original"), {
    kind: "builtin",
    family: "monospace",
    bold: true,
    italic: true,
  });
  const first = read.get("local1"),
    second = read.get("local2");
  assert.ok(first?.kind === "truetype" && second?.kind === "truetype");
  assert.deepEqual(first.bytes, italic);
  assert.equal(first.bytes, second.bytes);
  reopened.getForm().getTextField("local1").acroField.dict.delete(PDFName.of("EdiWidgetFont"));
  const imported = widgetFonts(reopened).get("local1");
  assert.ok(imported?.kind === "truetype");
  assert.deepEqual(imported.bytes, italic);
});
test("unrecognized widget font metadata produces an explicit preview warning without changing the field", async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage(),
    field = pdf.getForm().createTextField("example");
  field.setText("PRESERVADO");
  field.addToPage(page, { x: 20, y: 20, width: 100, height: 20 });
  field.acroField.dict.set(PDFName.of("EdiWidgetFont"), pdf.context.obj({ Version: 2 }));
  const before = field.acroField.dict.toString(),
    result = widgetFonts(pdf).get("example");
  assert.ok(result?.kind === "fallback");
  assert.match(result.reason, /Versão/);
  assert.equal(field.acroField.dict.toString(), before);
  assert.equal(field.getText(), "PRESERVADO");
});
