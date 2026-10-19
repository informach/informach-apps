import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { buildPdf } from "../src/shared/build.ts";
import {
  rotatedSignatureGeometry,
  signatureAnnotations,
  signatureLayout,
} from "../src/shared/graphic-signature.ts";
import { takeEditableAnnotations } from "../src/shared/pdf-annotations.ts";
import type { SavedSignature } from "../src/shared/types.ts";

const signature: SavedSignature = {
  id: "sig",
  src: "data:image/png;base64,AA==",
  width: 120,
  height: 40,
  strokes: [
    { points: [10, 10, 50, 20, 100, 10], color: "#111111", width: 5 },
    { points: [90, 30], color: "#1D3FAF", width: 4 },
  ],
};
test("graphical handwriting and dots remain vector annotations with one movable date group", async () => {
  const document = await PDFDocument.create();
  document.addPage([600, 800]);
  const annots = signatureAnnotations(signature, "p", { w: 600, h: 800 }, "18/10/2026");
  assert.equal(annots.length, 3);
  assert.ok(annots.every((annot) => annot.group === annots[0].group));
  const out = await PDFDocument.load(
    await buildPdf({
      content: {
        pages: [{ id: "p", src: "a", index: 0, rotation: 0 }],
        annots,
        forms: {},
        meta: {},
        watermark: null,
        pageNumbers: null,
      },
      sources: { a: await document.save() },
      primary: "a",
    }),
  );
  assert.deepEqual(
    out
      .getPage(0)
      .node.Annots()
      ?.asArray()
      .map((ref) => out.context.lookup(ref, PDFDict).get(PDFName.of("Subtype"))),
    [PDFName.of("Ink"), PDFName.of("Ink"), PDFName.of("FreeText")],
  );
  assert.equal(
    out.context
      .enumerateIndirectObjects()
      .some(
        ([, value]) =>
          value instanceof PDFDict && value.get(PDFName.of("Subtype")) === PDFName.of("Image"),
      ),
    false,
  );
  const restored = takeEditableAnnotations(out).get(0) ?? [];
  assert.equal(restored[0].kind === "ink" && restored[0].signature, true);
  assert.equal(restored[2].kind === "text" && restored[2].text, "18/10/2026");
});
test("signature rotation transforms every stroke consistently without changing the stored original", () => {
  const rotated = rotatedSignatureGeometry(signature, 90);
  assert.deepEqual([rotated.width, rotated.height], [40, 120]);
  assert.deepEqual(rotated.strokes?.[0].points, [30, 10, 20, 50, 30, 100]);
  assert.deepEqual(signature.strokes?.[0].points, [10, 10, 50, 20, 100, 10]);
  assert.equal(rotatedSignatureGeometry(signature, 180).strokes?.[1].points[0], 30);
});

test("direct placement keeps the signature and its date inside every page corner, including narrow rotated images", () => {
  for (const angle of [0, 90, 180, 270] as const) {
    const geometry = rotatedSignatureGeometry(signature, angle);
    for (const size of [
      { w: 600, h: 800 },
      { w: 80, h: 60 },
      { w: 15, h: 20 },
    ]) {
      for (const [centerX, centerY] of [
        [0, 0],
        [size.w, 0],
        [0, size.h],
        [size.w, size.h],
      ]) {
        const layout = signatureLayout(geometry, size, "18/10/2026", {
          centerX,
          centerY,
          width: 300,
        });
        for (const box of [layout.box, layout.dateBox]) {
          assert.ok(box && box.x >= 4 - 1e-8 && box.y >= 4 - 1e-8);
          assert.ok(box.x + box.w <= size.w - 4 + 1e-8);
          assert.ok(box.y + box.h <= size.h - 4 + 1e-8);
        }
        assert.ok(layout.box.y + layout.box.h < (layout.dateBox?.y ?? 0));
      }
    }
  }
  assert.throws(() => signatureLayout(signature, { w: 8, h: 8 }), /espaço/);
  assert.throws(
    () =>
      signatureLayout(signature, { w: 600, h: 800 }, undefined, {
        centerX: NaN,
        centerY: 2,
        width: 100,
      }),
    /posição/,
  );
  assert.deepEqual(signature.strokes?.[0].points, [10, 10, 50, 20, 100, 10]);
});
