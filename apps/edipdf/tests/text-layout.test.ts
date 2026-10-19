import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import { extractGlyphTable, lineParagraph, nativeTextLines } from "../src/shared/text-layout.ts";

const require = createRequire(import.meta.url);
const engine = await LocalPdfEngine.create(
  await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
);

test("table extraction reads true PDF glyph geometry, keeps empty cells and records source areas", async () => {
  const doc = await PDFDocument.create(),
    page = doc.addPage([600, 800]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [text, x, y] of [
    ["Produto", 50, 700],
    ["Valor", 300, 700],
    ["Arroz integral", 50, 670],
    ["12,50", 300, 670],
    ["Feijao", 50, 640],
  ] as const)
    page.drawText(text, { x, y, font, size: 12 });
  const glyphs = engine.textDocument(await doc.save(), { includeAnnotations: false, layout: true })
    .pages[0].glyphs;
  const table = extractGlyphTable(glyphs, { x: 40, y: 80, w: 500, h: 100 }, [250]);
  assert.deepEqual(
    table.rows.map((row) => row.map((cell) => cell.value)),
    [
      ["Produto", "Valor"],
      ["Arroz integral", "12,50"],
      ["Feijao", ""],
    ],
  );
  assert.ok(table.rows[1][0].box);
  assert.equal(table.rows[2][1].box, null);
  assert.deepEqual(table.warnings, []);
  const ambiguous = extractGlyphTable(glyphs, { x: 40, y: 80, w: 500, h: 100 }, [75]);
  assert.ok(ambiguous.warnings.length);
  assert.ok(ambiguous.rows.flat().some((cell) => cell.ambiguous));
  assert.throws(
    () => extractGlyphTable(glyphs, { x: 0, y: 0, w: 600, h: 800 }, [300, 200]),
    /divisões/,
  );
});

test("native lines preserve Unicode, font emphasis and multi-run words", async () => {
  const doc = await PDFDocument.create(),
    page = doc.addPage([400, 400]);
  const regular = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText("Texto ", { x: 30, y: 300, size: 14, font: regular });
  page.drawText("negrito", { x: 69, y: 300, size: 14, font: bold });
  page.drawText("Outra linha", { x: 30, y: 270, size: 12, font: regular });
  const glyphs = engine.textDocument(await doc.save(), { includeAnnotations: false, styles: true })
    .pages[0].glyphs;
  const lines = nativeTextLines(glyphs),
    paragraphs = lines.map(lineParagraph);
  assert.match(lines.map((line) => line.text).join("\n"), /Texto negrito\nOutra linha/);
  assert.equal(
    paragraphs[0].runs
      .filter((run) => run.bold)
      .map((run) => run.text)
      .join(""),
    "negrito",
  );
  assert.ok(paragraphs[0].runs.every((run) => run.size === 14));
});

test("table extraction keeps combining accents with their base glyph instead of making another row", () => {
  const glyphs = [
    { text: "a", box: { x: 10, y: 20, w: 8, h: 10 } },
    { text: "\u0303", box: { x: 10, y: 14, w: 8, h: 4 } },
    { text: "b", box: { x: 18, y: 20, w: 8, h: 10 } },
  ];
  const table = extractGlyphTable(glyphs, { x: 0, y: 0, w: 100, h: 100 }, []);
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0][0].value, "a\u0303b");
});
