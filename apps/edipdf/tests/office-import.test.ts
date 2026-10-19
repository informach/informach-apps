import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { plainText } from "@informach/edi-ocr/search";
import { strToU8 } from "fflate";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import { exportDocx, exportXlsx } from "../src/shared/office-export.ts";
import { officeDocumentSchema } from "../src/shared/office-format.ts";
import { importDocx, importXlsx, spreadsheetDocument } from "../src/shared/office-import.ts";
import { readOfficePackage, writeOfficePackage } from "../src/shared/office-package.ts";
import { renderOfficePdf } from "../src/shared/office-render.ts";

const require = createRequire(import.meta.url),
  engine = await LocalPdfEngine.create(
    await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
  );
const [regular, bold, italic, boldItalic] = await Promise.all(
  ["Regular", "Bold", "Italic", "BoldItalic"].map((name) =>
    readFile(new URL(`../resources/fonts/NotoSans-${name}.ttf`, import.meta.url)),
  ),
);
const fonts = { regular, bold, italic, boldItalic },
  license = await readFile(new URL("../resources/licenses/Noto-OFL.txt", import.meta.url), "utf8");
const input = officeDocumentSchema.parse({
  title: "Conversão local",
  warnings: [],
  pages: [
    {
      width: 600,
      height: 800,
      margins: { left: 40, right: 40, top: 50, bottom: 50 },
      blocks: [
        {
          kind: "paragraph",
          align: "center",
          runs: [{ text: "Ação αβγ", bold: true, italic: true, size: 18 }],
        },
        {
          kind: "table",
          header: true,
          rows: [
            ["Nome", "Valor"],
            ["João", 12.5],
          ],
        },
      ],
    },
    {
      width: 800,
      height: 600,
      blocks: [{ kind: "paragraph", runs: [{ text: "SEGUNDA_PÁGINA" }] }],
    },
  ],
});

test("editable DOCX roundtrips locally to searchable Unicode PDF, with source sections and typography", async () => {
  const imported = importDocx(exportDocx(input, fonts, license), "Volta local");
  assert.equal(imported.pages.length, 2);
  assert.equal(imported.pages[0].width, 600);
  assert.equal(imported.pages[0].margins.left, 40);
  const paragraph = imported.pages[0].blocks[0];
  assert.equal(paragraph.kind, "paragraph");
  assert.equal(paragraph.runs[0].bold, true);
  assert.equal(paragraph.runs[0].italic, true);
  const result = await renderOfficePdf(imported, fonts),
    text = engine.textDocument(result.bytes, { includeAnnotations: false, styles: true });
  assert.equal(text.pages.length, 2);
  assert.match(plainText(text.pages[0].glyphs), /Ação αβγ/);
  assert.match(plainText(text.pages[0].glyphs), /João/);
  assert.match(plainText(text.pages[1].glyphs), /SEGUNDA_PÁGINA/);
  assert.ok(text.pages[0].glyphs.some((glyph) => glyph.style?.bold && glyph.style.italic));
});

test("Word rejects circular style inheritance and reports external images without dereferencing", () => {
  const base = readOfficePackage(exportDocx(input, fonts, license));
  const parts = Object.fromEntries(base);
  parts["word/styles.xml"] = strToU8(
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:styleId="a"><w:basedOn w:val="b"/></w:style><w:style w:styleId="b"><w:basedOn w:val="a"/></w:style></w:styles>',
  );
  parts["word/document.xml"] = strToU8(
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="a"/></w:pPr><w:r><w:t>Preservar</w:t></w:r></w:p></w:body></w:document>',
  );
  assert.throws(() => importDocx(writeOfficePackage(parts), "Ciclo"), /circular/);
  parts["word/document.xml"] = strToU8(
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body><w:p><w:r><w:t>Texto seguro</w:t><w:drawing><a:blip r:embed="externa"/></w:drawing></w:r></w:p></w:body></w:document>',
  );
  parts["word/_rels/document.xml.rels"] = strToU8(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="externa" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.invalid/private.png" TargetMode="External"/></Relationships>',
  );
  const imported = importDocx(writeOfficePackage(parts), "Externo");
  assert.ok(imported.warnings.some((warning) => /externas não são acessados/.test(warning)));
  assert.equal(imported.pages[0].blocks.length, 1);
});

test("Excel preserves cell types, sparse positions and multiple sheets without executing formulas", async () => {
  const sheets = [
    {
      name: "Dados",
      rows: [
        ["Nome", "Valor", "Ativo"],
        ["João", 12.5, true],
        [null, "=SUM(1,2)", false],
      ],
      header: false,
    },
    { name: "Outra", rows: [["SEGUNDA_PLANILHA"]], header: false },
  ];
  const imported = importXlsx(exportXlsx(sheets));
  assert.deepEqual(imported.sheets, sheets);
  const pdf = await renderOfficePdf(spreadsheetDocument(imported, "Planilhas"), fonts);
  const text = engine
    .textDocument(pdf.bytes, { includeAnnotations: false })
    .pages.map((page) => plainText(page.glyphs))
    .join("\n");
  assert.match(text, /João/);
  assert.match(text, /=SUM\(1,2\)/);
  assert.match(text, /SEGUNDA_PLANILHA/);
  const parts = Object.fromEntries(readOfficePackage(exportXlsx(sheets)));
  parts["xl/worksheets/sheet1.xml"] = strToU8(
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>WEBSERVICE("https://example.invalid")</f><v>42</v></c></row></sheetData></worksheet>',
  );
  const cached = importXlsx(writeOfficePackage(parts));
  assert.equal(cached.sheets[0].rows[0][0], 42);
  assert.ok(cached.warnings.some((warning) => /não são executadas/.test(warning)));
  parts["xl/worksheets/sheet1.xml"] = strToU8(
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>SUM(1,2)</f></c></row></sheetData></worksheet>',
  );
  assert.throws(() => importXlsx(writeOfficePackage(parts)), /não tem resultado salvo/);
});

test("table overflow and long cells preserve the final source values on subsequent PDF pages", async () => {
  const text = `${"PALAVRA ".repeat(200)}FIM_DA_CÉLULA`,
    document = officeDocumentSchema.parse({
      title: "Tabela longa",
      warnings: [],
      pages: [
        {
          width: 300,
          height: 300,
          blocks: [
            {
              kind: "table",
              header: true,
              rows: [
                ["Descrição", "Valor"],
                [text, 123],
                ["ÚLTIMA_LINHA", 456],
              ],
            },
          ],
        },
      ],
    });
  const pdf = await renderOfficePdf(document, fonts);
  assert.ok(pdf.pages > 3);
  const pages = engine.textDocument(pdf.bytes, { includeAnnotations: false }).pages;
  const content = pages
    .map((page) => plainText(page.glyphs))
    .join("\n")
    .replace(/\s/g, "");
  assert.match(content, /FIM_DA_CÉLULA/);
  assert.match(content, /ÚLTIMA_LINHA/);
  assert.match(content, /456/);
  for (const page of pages)
    for (const glyph of page.glyphs)
      if (glyph.box)
        assert.ok(glyph.box.y >= 35 && glyph.box.y + glyph.box.h < 265, JSON.stringify(glyph));
});
