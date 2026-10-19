import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  StandardFonts,
} from "pdf-lib";
import { buildPdf } from "../src/shared/build.ts";
import { setFormWidgetFont, updateDirtyFormAppearances } from "../src/shared/form-font.ts";

const italic = new Uint8Array(
  await readFile(new URL("../resources/fonts/NotoSans-Italic.ttf", import.meta.url)),
);
function appearance(document: PDFDocument, name: string): Uint8Array {
  const widget = document.getForm().getTextField(name).acroField.getWidgets()[0];
  assert.ok(widget);
  const ap = widget.dict.lookup(PDFName.of("AP"));
  assert.ok(ap instanceof PDFDict);
  const stream = ap.lookup(PDFName.of("N"));
  assert.ok(stream instanceof PDFRawStream);
  return stream.getContents();
}
async function fixture(): Promise<PDFDocument> {
  const document = await PDFDocument.create(),
    page = document.addPage(),
    font = await document.embedFont(StandardFonts.Courier);
  for (const [index, name] of ["editado", "intocado"].entries()) {
    const field = document.getForm().createTextField(name);
    field.setText(name.toUpperCase());
    field.addToPage(page, { x: 20, y: 500 - index * 60, width: 240, height: 30, font });
    field.setFontSize(15);
    field.updateAppearances(font);
  }
  return PDFDocument.load(await document.save({ updateFieldAppearances: false }));
}
test("selected widget font is truly embedded with Unicode while clean peers retain appearances", async () => {
  const document = await fixture(),
    before = appearance(document, "intocado"),
    field = document.getForm().getTextField("editado");
  field.setText("CAMPO_áβ_123");
  await setFormWidgetFont(document, "editado", italic);
  await updateDirtyFormAppearances(document, italic);
  const reopened = await PDFDocument.load(await document.save({ updateFieldAppearances: false }));
  assert.equal(reopened.getForm().getTextField("editado").getText(), "CAMPO_áβ_123");
  assert.match(
    reopened.getForm().getTextField("editado").acroField.getDefaultAppearance() ?? "",
    /15 Tf/,
  );
  assert.deepEqual(appearance(reopened, "intocado"), before);
  assert.ok(
    reopened.context
      .enumerateIndirectObjects()
      .some(
        ([, object]) =>
          object instanceof PDFDict &&
          /NotoSans.*Italic/.test(String(object.get(PDFName.of("BaseFont")))),
      ),
  );
});
test("clean imported widgets do not require reparsing or re-embedding a replacement font", async () => {
  const document = await fixture(),
    before = appearance(document, "intocado");
  await updateDirtyFormAppearances(document, new Uint8Array());
  assert.deepEqual(appearance(document, "intocado"), before);
  document.getForm().getTextField("editado").setText("NOVO_áβ");
  await updateDirtyFormAppearances(document, italic);
  assert.deepEqual(appearance(document, "intocado"), before);
  assert.equal(document.getForm().getTextField("editado").needsAppearancesUpdate(), false);
  document.getForm().getTextField("editado").setText("MISSING_🙂");
  await assert.rejects(() => updateDirtyFormAppearances(document, italic), /não contém/);
});

test("editable widget fonts are embedded whole and deduplicated across controls", async () => {
  const document = await fixture();
  await setFormWidgetFont(document, "editado", italic);
  await setFormWidgetFont(document, "intocado", new Uint8Array(italic));
  document.getForm().getTextField("editado").setText("Ж_FUTURO");
  await updateDirtyFormAppearances(document, italic);
  const reopened = await PDFDocument.load(await document.save({ updateFieldAppearances: false }));
  const descriptors = reopened.context
    .enumerateIndirectObjects()
    .map(([, value]) => value)
    .filter((value) => value instanceof PDFDict && value.has(PDFName.of("FontFile2")));
  assert.equal(descriptors.length, 1);
  const descriptor = descriptors[0];
  assert.ok(descriptor instanceof PDFDict);
  const stream = descriptor.lookup(PDFName.of("FontFile2"));
  assert.ok(stream instanceof PDFRawStream);
  assert.equal(Buffer.compare(decodePDFRawStream(stream).decode(), italic), 0);
  assert.equal(reopened.getForm().getTextField("editado").getText(), "Ж_FUTURO");
});

test("filling an authored field later retains its chosen font through repeated PDF builds", async () => {
  const document = await fixture();
  await setFormWidgetFont(document, "editado", italic);
  const original = await document.save({ updateFieldAppearances: false }),
    before = appearance(await PDFDocument.load(original), "intocado");
  let bytes = original;
  for (const text of ["PRIMEIRA_áβ", "SEGUNDA_Ж"]) {
    bytes = await buildPdf({
      primary: "source",
      sources: { source: bytes },
      content: {
        pages: [{ id: "p", src: "source", index: 0, rotation: 0 }],
        annots: [],
        forms: { editado: text },
        meta: {},
        watermark: null,
        pageNumbers: null,
      },
    });
    const reopened = await PDFDocument.load(bytes),
      field = reopened.getForm().getTextField("editado");
    assert.equal(field.getText(), text);
    assert.match(field.acroField.getDefaultAppearance() ?? "", /NotoSans.*Italic/);
    assert.deepEqual(appearance(reopened, "intocado"), before);
  }
  assert.equal(
    (await PDFDocument.load(original)).getForm().getTextField("editado").getText(),
    "EDITADO",
  );
});
