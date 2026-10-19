import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { degrees, PDFDocument } from "pdf-lib";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import { REDACTION_SANITIZE, sanitizePdf } from "../src/shared/pdf-sanitize.ts";
import { findRedactions, selectedRedactionOperations } from "../src/shared/search-redaction.ts";
import { plainText } from "../src/shared/text-search.ts";

const require = createRequire(import.meta.url),
  engine = await LocalPdfEngine.create(
    await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
  ),
  query = { text: "SEGREDO", wholeWord: true, caseSensitive: false, accents: false };
test("reviewed search redaction removes only selected occurrences across rotations and nonzero crop origins", async () => {
  const pdf = await PDFDocument.create();
  for (const rotation of [0, 90, 180, 270]) {
    const page = pdf.addPage([400, 500]);
    page.setCropBox(20, 30, 350, 420);
    page.setRotation(degrees(rotation));
    page.drawText("SEGREDO PUBLICO", { x: 50, y: 380, size: 14 });
    page.drawText("SEGREDO MANTIDO", { x: 50, y: 320, size: 14 });
    page.drawText("SEGREDOS", { x: 50, y: 260, size: 14 });
  }
  pdf.setTitle("Metadado confidencial");
  const original = await pdf.save(),
    source = new Uint8Array(original),
    inspection = engine.inspect(original),
    text = engine.textDocument(original, { includeAnnotations: true }),
    matches = findRedactions(inspection, text, query);
  assert.equal(matches.length, 8);
  const selected = matches.filter((_, i) => i % 2 === 0).map((match) => match.id),
    operations = selectedRedactionOperations(inspection, matches, selected),
    clean = await sanitizePdf(original, REDACTION_SANITIZE),
    output = await sanitizePdf(engine.transform(clean, operations), REDACTION_SANITIZE),
    remaining = engine.textDocument(output, { includeAnnotations: true });
  for (const page of remaining.pages) {
    assert.equal(
      findRedactions(inspection, { pages: remaining.pages }, query).filter(
        (match) => match.page === page.index,
      ).length,
      1,
    );
    assert.match(plainText(page.glyphs), /PUBLICO/);
    assert.match(plainText(page.glyphs), /MANTIDO/);
    assert.match(plainText(page.glyphs), /SEGREDOS/);
  }
  assert.equal((await PDFDocument.load(output)).getTitle(), undefined);
  assert.deepEqual(original, source);
  assert.throws(() => selectedRedactionOperations(inspection, matches, ["stale"]), /seleção/);
  assert.throws(() => selectedRedactionOperations(inspection, matches, []), /seleção/);
});

test("search redaction refuses incomplete Unicode or unpositioned matches instead of implying complete removal", () => {
  const inspection = {
    pages: [
      { index: 0, rotation: 0, crop: { left: 0, bottom: 0, right: 100, top: 100 }, objects: [] },
    ],
    encrypted: false,
    ownerUnlocked: true,
    signatures: 0,
  };
  assert.throws(
    () =>
      findRedactions(inspection, { pages: [{ index: 0, glyphs: [], missingUnicode: 1 }] }, query),
    /Unicode confiável/,
  );
  assert.throws(
    () =>
      findRedactions(
        inspection,
        { pages: [{ index: 0, glyphs: [{ text: "SEGREDO" }], missingUnicode: 0 }] },
        query,
      ),
    /área confiável/,
  );
  assert.throws(() => findRedactions(inspection, { pages: [] }, query), /correspondente/);
});
