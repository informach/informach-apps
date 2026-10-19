import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { type BuildInput, buildPdf } from "../src/shared/build.ts";
import { documentBuildRequestSchema } from "../src/shared/document-build-format.ts";
import { takeEditableAnnotations } from "../src/shared/pdf-annotations.ts";

async function input(): Promise<BuildInput> {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]).drawText("PAGINA_RETIDA", { x: 30, y: 300 });
  pdf.addPage([300, 400]).drawText("PAGINA_REMOVIDA", { x: 30, y: 300 });
  const field = pdf.getForm().createTextField("nome");
  field.setText("Antigo");
  field.addToPage(pdf.getPage(0), { x: 30, y: 200, width: 200, height: 25 });
  return {
    sources: { source: await pdf.save() },
    primary: "source",
    content: {
      requiresCopy: true,
      baseSource: "source",
      pages: [{ id: "retained", src: "source", index: 0, rotation: 0 }],
      annots: [
        {
          kind: "text",
          id: "annotation",
          page: "retained",
          x: 20,
          y: 20,
          text: "REVISAO_ATUAL",
          color: "#123456",
          font: "helvetica",
          size: 12,
          locked: true,
        },
      ],
      forms: { "source\u001fnome": "Atual" },
      meta: { title: "Revisao atual" },
      watermark: null,
      pageNumbers: null,
    },
  };
}
test("worker build contract retains current annotations, form values, metadata and source bytes while removing deleted pages", async () => {
  const request = await input(),
    source = request.sources.source;
  assert.ok(source);
  const original = new Uint8Array(source),
    parsed = documentBuildRequestSchema.parse(request),
    output = await buildPdf(parsed),
    document = await PDFDocument.load(output);
  assert.equal(document.getPageCount(), 1);
  assert.equal(document.getTitle(), "Revisao atual");
  assert.equal(document.getForm().getTextField("nome").getText(), "Atual");
  const annotations = takeEditableAnnotations(document).get(0);
  assert.equal(annotations?.[0]?.kind, "text");
  assert.ok(
    annotations?.some(
      (annotation) =>
        annotation.kind === "text" && annotation.text === "REVISAO_ATUAL" && annotation.locked,
    ),
  );
  assert.deepEqual(request.sources.source, original);
});
test("worker composition refuses missing sources, missing base and duplicated page identities before rendering", async () => {
  const request = await input();
  assert.throws(() => documentBuildRequestSchema.parse({ ...request, sources: {} }), /fonte|Fonte/);
  assert.throws(
    () => documentBuildRequestSchema.parse({ ...request, primary: "absent" }),
    /principal/,
  );
  assert.throws(
    () =>
      documentBuildRequestSchema.parse({
        ...request,
        content: {
          ...request.content,
          pages: [...request.content.pages, ...request.content.pages],
        },
      }),
    /identidade repetida/,
  );
});
