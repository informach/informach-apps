import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFString,
} from "pdf-lib";
import { buildPdf } from "../src/shared/build.ts";
import type { DocContent } from "../src/shared/model.ts";

const content: DocContent = {
  pages: [{ id: "first", src: "source", index: 0, rotation: 0 }],
  annots: [],
  forms: {},
  meta: {},
  watermark: null,
  pageNumbers: null,
};
const name = PDFName.of;

test("deleting tagged pages removes alternate text and parent/id references while preserving live tags", async () => {
  const doc = await PDFDocument.create();
  const first = doc.addPage(),
    second = doc.addPage();
  first.drawText("PUBLICO");
  second.drawText("SEGREDO_REMOVIDO");
  const root = doc.context.obj({ Type: "StructTreeRoot" });
  const rootRef = doc.context.register(root);
  const keep = doc.context.register(
    doc.context.obj({
      Type: "StructElem",
      S: "P",
      P: rootRef,
      Pg: first.ref,
      K: 0,
      ActualText: PDFString.of("ALTERNATIVO_PUBLICO"),
    }),
  );
  const gone = doc.context.register(
    doc.context.obj({
      Type: "StructElem",
      S: "P",
      P: rootRef,
      Pg: second.ref,
      K: 0,
      ActualText: PDFString.of("SEGREDO_REMOVIDO"),
    }),
  );
  root.set(name("K"), doc.context.obj([keep, gone]));
  root.set(name("ParentTree"), doc.context.obj({ Nums: [0, [keep], 1, [gone]] }));
  root.set(
    name("IDTree"),
    doc.context.obj({ Names: [PDFString.of("keep"), keep, PDFString.of("gone"), gone] }),
  );
  doc.catalog.set(name("StructTreeRoot"), rootRef);
  const result = await PDFDocument.load(
    await buildPdf({ content, sources: { source: await doc.save() }, primary: "source" }),
  );
  const objects = result.context
    .enumerateIndirectObjects()
    .map(([, object]) => object.toString())
    .join("\n");
  assert.doesNotMatch(objects, /SEGREDO_REMOVIDO|\(gone\)/);
  assert.match(objects, /ALTERNATIVO_PUBLICO/);
  assert.equal(result.catalog.has(name("StructTreeRoot")), true);
});

test("malformed cyclic accessibility trees refuse page deletion without returning a corrupt PDF", async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  const removed = doc.addPage();
  const root = doc.context.obj({ Type: "StructTreeRoot" });
  const rootRef = doc.context.register(root);
  const node = doc.context.obj({ Type: "StructElem", S: "P", Pg: removed.ref });
  const ref = doc.context.register(node);
  node.set(name("K"), doc.context.obj([ref]));
  root.set(name("K"), doc.context.obj([ref]));
  doc.catalog.set(name("StructTreeRoot"), rootRef);
  await assert.rejects(
    buildPdf({ content, sources: { source: await doc.save() }, primary: "source" }),
    /circular/,
  );
});

async function fixture(mode: "outline" | "field" | "destination") {
  const doc = await PDFDocument.create();
  const first = doc.addPage();
  first.drawText("PUBLICO");
  const second = doc.addPage();
  second.drawText("SEGREDO_REMOVIDO");
  if (mode === "field") {
    const field = doc.getForm().createTextField("cliente.nome");
    field.addToPage(first, { x: 50, y: 500, width: 200, height: 20 });
    field.addToPage(second, { x: 50, y: 500, width: 200, height: 20 });
  } else if (mode === "outline") {
    const root = doc.context.obj({ Type: "Outlines" });
    const rootRef = doc.context.register(root);
    const keep = doc.context.obj({
      Title: PDFString.of("Público"),
      Parent: rootRef,
      Dest: [first.ref, name("Fit")],
    });
    const gone = doc.context.obj({
      Title: PDFString.of("Segredo"),
      Parent: rootRef,
      Dest: [second.ref, name("Fit")],
    });
    const keepRef = doc.context.register(keep);
    const goneRef = doc.context.register(gone);
    keep.set(name("Next"), goneRef);
    gone.set(name("Prev"), keepRef);
    root.set(name("First"), keepRef);
    root.set(name("Last"), goneRef);
    root.set(name("Count"), doc.context.obj(2));
    doc.catalog.set(name("Outlines"), rootRef);
  } else {
    doc.catalog.set(
      name("Names"),
      doc.context.obj({
        Dests: {
          Names: [
            PDFString.of("segredo"),
            [second.ref, name("Fit")],
            PDFString.of("publico"),
            [first.ref, name("Fit")],
          ],
        },
      }),
    );
    first.node.addAnnot(
      doc.context.register(
        doc.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [0, 0, 100, 100],
          A: { S: "GoTo", D: PDFString.of("segredo") },
        }),
      ),
    );
    first.node.addAnnot(
      doc.context.register(
        doc.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [0, 100, 100, 200],
          Dest: [first.ref, name("Fit")],
        }),
      ),
    );
  }
  return doc.save();
}

for (const mode of ["outline", "field", "destination"] as const) {
  test(`removed page content is unreachable after saving with ${mode} references`, async () => {
    const source = await fixture(mode);
    const saved = await PDFDocument.load(
      await buildPdf({ content, sources: { source }, primary: "source" }),
    );
    assert.equal(saved.getPageCount(), 1);
    const objects = saved.context.enumerateIndirectObjects();
    assert.equal(
      objects.filter(
        ([, value]) => value instanceof PDFDict && value.get(name("Type")) === name("Page"),
      ).length,
      1,
    );
    for (const [, value] of objects) {
      if (!(value instanceof PDFRawStream)) continue;
      const stream = Buffer.from(decodePDFRawStream(value).decode()).toString("latin1");
      assert.ok(!stream.includes(Buffer.from("SEGREDO_REMOVIDO").toString("hex").toUpperCase()));
    }
    if (mode === "field") {
      const widgets = saved.getForm().getTextField("cliente.nome").acroField.getWidgets();
      assert.equal(widgets.length, 1);
      assert.equal(widgets[0].P(), saved.getPage(0).ref);
    }
    if (mode === "outline") {
      const outline = saved.catalog.lookup(name("Outlines"), PDFDict);
      assert.equal(outline.get(name("First")), outline.get(name("Last")));
      const item = outline.lookup(name("First"), PDFDict);
      assert.equal(item.lookup(name("Title"), PDFString).decodeText(), "Público");
      assert.equal(item.has(name("Next")), false);
    }
    if (mode === "destination") assert.equal(saved.getPage(0).node.Annots()?.size(), 1);
  });
}
