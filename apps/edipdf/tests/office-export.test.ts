import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import fontkit from "@pdf-lib/fontkit";
import {
  exportDocx,
  exportTableCsv,
  exportXlsx,
  obfuscateOfficeFont,
} from "../src/shared/office-export.ts";
import { officeDocumentSchema } from "../src/shared/office-format.ts";
import { officePart, readOfficePackage } from "../src/shared/office-package.ts";
import { parseOfficeXml } from "../src/shared/office-xml.ts";

const names = ["Regular", "Bold", "Italic", "BoldItalic"];
const [regular, bold, italic, boldItalic] = await Promise.all(
  names.map((name) =>
    readFile(new URL(`../resources/fonts/NotoSans-${name}.ttf`, import.meta.url)),
  ),
);
const fonts = { regular, bold, italic, boldItalic };
const license = await readFile(
  new URL("../resources/licenses/Noto-OFL.txt", import.meta.url),
  "utf8",
);
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

test("DOCX contains editable paragraphs, tables and Unicode with embedded licensed fonts", () => {
  const input = officeDocumentSchema.parse({
    title: "Conversão local",
    warnings: [],
    pages: [
      {
        width: 600,
        height: 800,
        blocks: [
          {
            kind: "paragraph",
            heading: 1,
            align: "center",
            runs: [{ text: "Ação αβγ", bold: true, color: "#123456", size: 18 }],
          },
          {
            kind: "paragraph",
            bullet: true,
            runs: [{ text: "Linha\tcom tabulação\r\nOutra linha", italic: true }],
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
        blocks: [{ kind: "paragraph", runs: [{ text: "SEGUNDA PÁGINA" }] }],
      },
    ],
  });
  const parts = readOfficePackage(exportDocx(input, fonts, license));
  for (const [name, bytes] of parts)
    if (name.endsWith(".xml") || name.endsWith(".rels"))
      assert.ok(parseOfficeXml(bytes).documentElement, name);
  const document = parseOfficeXml(officePart(parts, "word/document.xml"));
  assert.ok(document.getElementsByTagNameNS(W, "t").length > 6);
  assert.match(document.documentElement?.textContent ?? "", /Ação αβγ/);
  assert.equal(document.getElementsByTagNameNS(W, "tbl").length, 1);
  assert.equal(document.getElementsByTagNameNS(W, "tab").length, 1);
  assert.equal(document.getElementsByTagNameNS(W, "br").length, 1);
  assert.equal(document.getElementsByTagNameNS(W, "sectPr").length, 2);
  assert.equal(new TextDecoder().decode(officePart(parts, "word/fonts/LICENSE.txt")), license);
  const table = parseOfficeXml(officePart(parts, "word/fontTable.xml"));
  for (const [style, original] of Object.entries(fonts)) {
    const tag = {
      regular: "embedRegular",
      bold: "embedBold",
      italic: "embedItalic",
      boldItalic: "embedBoldItalic",
    }[style];
    assert.ok(tag);
    const relationship = table.getElementsByTagNameNS(W, tag).item(0);
    assert.ok(relationship);
    assert.equal(relationship.getAttributeNS(R, "id"), `font-${style}`);
    const restored = obfuscateOfficeFont(
      officePart(parts, `word/fonts/${style}.odttf`),
      relationship.getAttributeNS(W, "fontKey") ?? "",
    );
    assert.deepEqual(restored, new Uint8Array(original));
    assert.ok(fontkit.create(restored).hasGlyphForCodePoint("α".codePointAt(0) ?? 0));
  }
});

test("XLSX keeps formulas as literal text and preserves numbers, booleans, nulls and column references", () => {
  const rows = [
    ["Texto", "Número", "Booleano", "Vazio"],
    ["=SUM(A1:A2)", 12.5, true, null],
    Array.from({ length: 28 }, (_, index) => `Coluna ${index + 1}`),
  ];
  const parts = readOfficePackage(
    exportXlsx([
      { name: "Ação", rows, header: true },
      { name: "Outra", rows: [["αβγ <&>"]], header: false },
    ]),
  );
  for (const [name, bytes] of parts)
    if (name.endsWith(".xml") || name.endsWith(".rels"))
      assert.ok(parseOfficeXml(bytes).documentElement, name);
  const xml = new TextDecoder().decode(officePart(parts, "xl/worksheets/sheet1.xml"));
  assert.match(xml, /r="A2"[^>]*t="inlineStr"/);
  assert.match(xml, /=SUM\(A1:A2\)/);
  assert.doesNotMatch(xml, /<f[ >]/);
  assert.match(xml, /r="B2"[^>]*><v>12.5/);
  assert.match(xml, /r="C2"[^>]*t="b"><v>1/);
  assert.match(xml, /r="AB3"/);
  assert.match(xml, /autoFilter ref="A1:AB3"/);
});

test("CSV is UTF-8 with BOM, quotes separators/newlines and protects formula-looking strings", () => {
  const bytes = exportTableCsv([
    ["Ação; local", "linha\nsegunda", 'aspas "', "=1+2", "\t@cmd", -12, null],
  ]);
  assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191]);
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /"Ação; local"/);
  assert.match(text, /"linha\nsegunda"/);
  assert.match(text, /"aspas """/);
  assert.match(text, /"'=1\+2"/);
  assert.match(text, /"'\t@cmd"/);
  assert.match(text, /"-12"/);
  assert.match(new TextDecoder().decode(exportTableCsv([["=1+2"]], ",", false)), /"=1\+2"/);
});

test("DOCX export refuses unsupported glyphs and page sizes instead of changing content silently", () => {
  const document = officeDocumentSchema.parse({
    title: "x",
    warnings: [],
    pages: [{ width: 600, height: 800, blocks: [{ kind: "paragraph", runs: [{ text: "漢" }] }] }],
  });
  assert.throws(() => exportDocx(document, fonts, license), /não contém/);
  const wide = { ...document, pages: [{ width: 2000, height: 800, blocks: [] }] };
  assert.throws(() => exportDocx(wide, fonts, license), /22 polegadas/);
});
