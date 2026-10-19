import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { init } from "@embedpdf/pdfium";
import { PDFDocument, rgb } from "pdf-lib";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";

const require = createRequire(import.meta.url),
  wasm = new Uint8Array(await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm"))),
  native = await init({ wasmBinary: new Uint8Array(wasm).buffer }),
  engine = await LocalPdfEngine.create(wasm),
  root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../.cache/edipdf-analysis/form-objects",
  );
native.PDFiumExt_Init();
await mkdir(root, { recursive: true });
const source = await PDFDocument.create(),
  sourcePage = source.addPage([200, 100]);
sourcePage.drawText("ORIGINAL_CHILD", { x: 10, y: 60, size: 14 });
sourcePage.drawRectangle({ x: 10, y: 10, width: 40, height: 20, color: rgb(1, 0, 0) });
const sourceBytes = await source.save();
const results: unknown[] = [];
for (const shared of [false, true]) {
  const document = await PDFDocument.create(),
    [form] = await document.embedPdf(sourceBytes, [0]);
  if (!form) throw new Error("Missing fixture Form XObject.");
  const page = document.addPage([600, 800]);
  page.drawPage(form, { x: 30, y: 500, width: 200, height: 100 });
  if (shared) {
    page.drawPage(form, { x: 300, y: 500, width: 200, height: 100 });
    document.addPage([600, 800]).drawPage(form, { x: 30, y: 500, width: 200, height: 100 });
  }
  const original = await document.save();
  await writeFile(join(root, `${shared ? "shared" : "unique"}-original.pdf`), original);
  for (const operation of ["delete", "move", "text"] as const) {
    const pointer = native.pdfium.wasmExports.malloc(original.length);
    assert.ok(pointer);
    let doc = 0,
      pageHandle = 0,
      writer = 0;
    const allocations: number[] = [];
    try {
      native.pdfium.HEAPU8.set(original, pointer);
      doc = native.FPDF_LoadMemDocument64(pointer, original.length, "");
      assert.ok(doc);
      pageHandle = native.FPDF_LoadPage(doc, 0);
      assert.ok(pageHandle);
      const rootForm = native.FPDFPage_GetObject(pageHandle, 0);
      assert.equal(native.FPDFPageObj_GetType(rootForm), 5);
      const count = native.FPDFFormObj_CountObjects(rootForm),
        children = Array.from({ length: count }, (_, index) =>
          native.FPDFFormObj_GetObject(rootForm, index),
        ),
        child = children.find((object) => native.FPDFPageObj_GetType(object) === 1);
      assert.ok(child);
      const matrixPointer = native.pdfium.wasmExports.malloc(24);
      assert.ok(matrixPointer);
      allocations.push(matrixPointer);
      assert.equal(native.FPDFPageObj_GetMatrix(child, matrixPointer), true);
      const originalMatrix = Array.from({ length: 6 }, (_, index) =>
        native.pdfium.getValue(matrixPointer + index * 4, "float"),
      );
      if (operation === "delete") {
        assert.equal(native.FPDFFormObj_RemoveObject(rootForm, child), true);
        native.FPDFPageObj_Destroy(child);
      } else if (operation === "move") {
        native.pdfium.setValue(matrixPointer + 16, originalMatrix[4] + 20, "float");
        assert.equal(native.FPDFPageObj_SetMatrix(child, matrixPointer), true);
      } else {
        const text = Buffer.from("CHILD\0", "utf16le"),
          textPointer = native.pdfium.wasmExports.malloc(text.length);
        assert.ok(textPointer);
        allocations.push(textPointer);
        native.pdfium.HEAPU8.set(text, textPointer);
        assert.equal(native.FPDFText_SetText(child, textPointer), true);
      }
      assert.equal(native.FPDFPage_GenerateContent(pageHandle), true);
      writer = native.PDFiumExt_OpenFileWriter();
      assert.ok(writer);
      assert.equal(native.FPDF_SaveAsCopy(doc, writer, 2), true);
      const size = native.PDFiumExt_GetFileWriterSize(writer),
        outputPointer = native.pdfium.wasmExports.malloc(size);
      assert.ok(outputPointer);
      allocations.push(outputPointer);
      assert.ok(native.PDFiumExt_GetFileWriterData(writer, outputPointer, size));
      const output = native.pdfium.HEAPU8.slice(outputPointer, outputPointer + size);
      await writeFile(join(root, `${shared ? "shared" : "unique"}-${operation}.pdf`), output);
      const text = engine.textDocument(output, { includeAnnotations: false, layout: true }),
        pages = text.pages.map((page) => ({
          text: page.glyphs.map((glyph) => glyph.text).join(""),
          boxes: page.glyphs.filter((glyph) => glyph.box).map((glyph) => glyph.box),
        }));
      results.push({ shared, operation, children: count, originalMatrix, pages });
    } finally {
      if (writer) native.PDFiumExt_CloseFileWriter(writer);
      if (pageHandle) native.FPDF_ClosePage(pageHandle);
      if (doc) native.FPDF_CloseDocument(doc);
      for (const allocation of allocations) native.pdfium.wasmExports.free(allocation);
      native.pdfium.wasmExports.free(pointer);
    }
  }
}
await writeFile(join(root, "result.json"), JSON.stringify(results, null, 2));
console.log(
  JSON.stringify(
    results.map((result) => result),
    null,
    2,
  ),
);
