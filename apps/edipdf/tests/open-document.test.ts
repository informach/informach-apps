import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { exportXlsx } from "../src/shared/office-export.ts";
import { officeDocumentSchema } from "../src/shared/office-format.ts";
import { writeOfficePackage } from "../src/shared/office-package.ts";
import { exportOdt } from "../src/shared/open-document/export.ts";
import {
  MIMES,
  readOpenPackage,
  resourceName,
  writeOpenPackage,
} from "../src/shared/open-document/package.ts";
import { exportOds, importOds } from "../src/shared/open-document/spreadsheet.ts";
import { importOdt } from "../src/shared/open-document/text.ts";
import type { UnicodeFonts } from "../src/shared/unicode-fonts.ts";

const [regular, bold, italic, boldItalic, license] = await Promise.all([
  readFile(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url)),
  readFile(new URL("../resources/fonts/NotoSans-Bold.ttf", import.meta.url)),
  readFile(new URL("../resources/fonts/NotoSans-Italic.ttf", import.meta.url)),
  readFile(new URL("../resources/fonts/NotoSans-BoldItalic.ttf", import.meta.url)),
  readFile(new URL("../resources/licenses/Noto-OFL.txt", import.meta.url), "utf8"),
]);
const fonts: UnicodeFonts = { regular, bold, italic, boldItalic };
const independent = new Uint8Array(
  await readFile(new URL("fixtures/open-document/independent.odt", import.meta.url)),
);

test("ODT independently authored with odfpy preserves Unicode, spaces, styles, breaks, tables and images", () => {
  const result = importOdt(independent, "Independente");
  assert.equal(result.pages.length, 2);
  const first = result.pages[0];
  assert.ok(first);
  assert.ok(Math.abs(first.width - 595.276) < 0.01);
  const heading = first.blocks[0],
    paragraph = first.blocks[1];
  assert.ok(heading?.kind === "paragraph");
  assert.equal(heading.heading, 1);
  assert.equal(heading.runs.map((run) => run.text).join(""), "ODT_LOCAL_αβγ — Ação e informação");
  assert.ok(paragraph?.kind === "paragraph");
  assert.equal(
    paragraph.runs.map((run) => run.text).join(""),
    "Espaços:   A\tênfase\nsegunda linha",
  );
  const emphasis = paragraph.runs.find((run) => run.text === "ênfase");
  assert.equal(emphasis?.bold, true);
  assert.equal(emphasis?.italic, true);
  assert.equal(emphasis?.size, 14);
  const table = result.pages[1]?.blocks.find((block) => block.kind === "table");
  assert.deepEqual(table?.rows[2], ["αβγ", "Literal =1+2"]);
  const image = result.pages[1]?.blocks.find((block) => block.kind === "image");
  assert.equal(image?.format, "png");
  assert.ok(image && image.width > 56 && image.width < 57);
});

test("ODT editable export keeps per-page geometry, literal whitespace, all font bytes and table-first page boundaries", () => {
  const source = officeDocumentSchema.parse({
    title: "Exportação <&> αβγ",
    warnings: [],
    pages: [
      {
        width: 600,
        height: 800,
        margins: { left: 40, right: 30, top: 20, bottom: 50 },
        blocks: [
          {
            kind: "paragraph",
            align: "right",
            runs: [
              {
                text: "  Ação\tαβγ\nlinha  ",
                bold: true,
                italic: true,
                color: "#123456",
                size: 14,
              },
            ],
          },
        ],
      },
      {
        width: 800,
        height: 600,
        blocks: [
          {
            kind: "table",
            rows: [
              ["Produto", "=1+2"],
              ["Ação", 12.5],
            ],
            header: true,
          },
        ],
      },
    ],
  });
  const output = exportOdt(source, fonts, license),
    input = readOpenPackage(output, "text"),
    restored = importOdt(output, "Retomada");
  assert.equal(new TextDecoder().decode(input.parts.get("mimetype")), MIMES.text);
  assert.deepEqual(input.parts.get("Fonts/regular.ttf"), new Uint8Array(regular));
  assert.equal(restored.pages.length, 2);
  assert.equal(restored.pages[1]?.width, 800);
  const paragraph = restored.pages[0]?.blocks[0];
  assert.ok(paragraph?.kind === "paragraph");
  assert.equal(paragraph.align, "right");
  assert.equal(paragraph.runs.map((run) => run.text).join(""), "  Ação\tαβγ\nlinha  ");
  assert.equal(paragraph.runs[0]?.bold, true);
  assert.ok(restored.pages[1]?.blocks[0]?.kind === "table");
});

test("OpenDocument rejects external/traversal references, malformed MIME placement, macros and encrypted packages", () => {
  for (const path of [
    "https://example.org/a.png",
    "file:///secret",
    "../secret",
    "%2e%2e/secret",
    "Pictures/%2fsecret",
    "C:/secret",
    "//host/a",
    "Pictures/a.png#x",
  ])
    assert.throws(() => resourceName(path));
  assert.equal(resourceName("./Pictures/A%20B.png"), "Pictures/A B.png");
  const parts = Object.fromEntries(readOpenPackage(independent, "text").parts);
  assert.throws(() => readOpenPackage(zipSync(parts), "text"), /mimetype/);
  assert.throws(
    () =>
      readOpenPackage(
        writeOfficePackage({ "x.xml": strToU8("<x/>"), ...parts }, { uncompressed: ["mimetype"] }),
        "text",
      ),
    /mimetype/,
  );
  assert.throws(
    () =>
      readOpenPackage(
        writeOfficePackage(
          { ...parts, "Scripts/test.js": strToU8("x") },
          { uncompressed: ["mimetype"] },
        ),
        "text",
      ),
    /Macros/,
  );
  const manifest = new TextDecoder()
    .decode(parts["META-INF/manifest.xml"])
    .replace(
      /<manifest:file-entry[^>]*manifest:full-path="content.xml"[^>]*\/>/,
      '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"><manifest:encryption-data/></manifest:file-entry>',
    );
  parts["META-INF/manifest.xml"] = strToU8(manifest);
  assert.throws(
    () => readOpenPackage(writeOfficePackage(parts, { uncompressed: ["mimetype"] }), "text"),
    /Criptografia/,
  );
});

test("ODT rejects hidden-crop disclosure, circular styles, unsupported embedded objects and oversized text repeats", () => {
  const original = readOpenPackage(independent, "text");
  const mutate = (from: string, to: string, part = "content.xml") => {
    const parts = Object.fromEntries(
      [...original.parts].filter(
        ([name]) => name !== "mimetype" && name !== "META-INF/manifest.xml",
      ),
    );
    parts[part] = strToU8(new TextDecoder().decode(parts[part]).replace(from, to));
    return writeOpenPackage("text", parts);
  };
  assert.throws(() => importOdt(mutate('text:c="3"', 'text:c="999999999"'), "x"), /Quantidade/);
  assert.throws(() => importOdt(mutate("<draw:image", "<draw:object"), "x"));
  assert.throws(
    () =>
      importOdt(
        mutate(
          'style:name="EmphasisLocal"',
          'style:name="EmphasisLocal" style:parent-style-name="EmphasisLocal"',
          "styles.xml",
        ),
        "x",
      ),
    /circular/,
  );
  const cropped = Object.fromEntries(
    [...original.parts].filter(([name]) => name !== "mimetype" && name !== "META-INF/manifest.xml"),
  );
  cropped["content.xml"] = strToU8(
    new TextDecoder()
      .decode(cropped["content.xml"])
      .replace("<draw:frame", '<draw:frame draw:style-name="CropLocal"'),
  );
  cropped["styles.xml"] = strToU8(
    new TextDecoder()
      .decode(cropped["styles.xml"])
      .replace(
        "</office:styles>",
        '<style:style style:name="CropLocal" style:family="graphic"><style:graphic-properties fo:clip="rect(1cm, 1cm, 1cm, 1cm)"/></style:style></office:styles>',
      ),
  );
  assert.throws(() => importOdt(writeOpenPackage("text", cropped), "x"), /área oculta/);
  assert.throws(
    () =>
      exportOdt(
        officeDocumentSchema.parse({
          title: "x",
          warnings: [],
          pages: [
            { width: 600, height: 800, blocks: [{ kind: "paragraph", runs: [{ text: "漢" }] }] },
          ],
        }),
        fonts,
        license,
      ),
    /não contém/,
  );
});

test("ODT numbered labels remain literal with explicit start values and multiple paragraphs per item", () => {
  const parts = Object.fromEntries(
    [...readOpenPackage(independent, "text").parts].filter(
      ([name]) => name !== "mimetype" && name !== "META-INF/manifest.xml",
    ),
  );
  parts["styles.xml"] = strToU8(
    new TextDecoder()
      .decode(parts["styles.xml"])
      .replace(
        "</office:styles>",
        '<text:list-style style:name="Numbers"><text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix=")" text:start-value="3"/></text:list-style></office:styles>',
      ),
  );
  parts["content.xml"] = strToU8(
    new TextDecoder()
      .decode(parts["content.xml"])
      .replace("<text:list>", '<text:list text:style-name="Numbers">')
      .replace(
        "<text:p>Item independente</text:p>",
        "<text:p>Item independente</text:p><text:p>Continuação</text:p>",
      ),
  );
  const document = importOdt(writeOpenPackage("text", parts), "x");
  const paragraphs = document.pages[0]?.blocks
    .filter((block) => block.kind === "paragraph")
    .map((block) => block.runs.map((run) => run.text).join(""));
  assert.ok(paragraphs?.includes("3) Item independente"));
  assert.ok(paragraphs?.includes("Continuação"));
  assert.ok(!paragraphs?.includes("3) Continuação"));
});

test("ODS independent fixture trims a million empty rows and preserves long sheet names and literal typed cells", async () => {
  const bytes = new Uint8Array(
      await readFile(new URL("fixtures/open-document/independent.ods", import.meta.url)),
    ),
    imported = importOds(bytes);
  assert.equal(imported.sheets[0]?.name, "Planejamento da turma — Outubro 2026");
  assert.equal(imported.sheets[0]?.rows.length, 3);
  assert.deepEqual(imported.sheets[0]?.rows[1], ["=1+2", 12.5, true]);
  assert.deepEqual(imported.sheets[0]?.rows[2], ["αβγ", -3.25, false, ""]);
  assert.ok(imported.warnings.some((warning) => warning.includes("vazias")));
  const restored = importOds(exportOds(imported.sheets));
  assert.deepEqual(restored.sheets, imported.sheets);
  assert.throws(() => exportXlsx(imported.sheets), /Excel/);
});

test("ODS repeat expansion preserves intermediate/leading positions and refuses real data expansion limits", () => {
  const build = (rows: string) =>
    writeOpenPackage("spreadsheet", {
      "content.xml": strToU8(
        `<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3"><office:body><office:spreadsheet><table:table table:name="Dados">${rows}</table:table></office:spreadsheet></office:body></office:document-content>`,
      ),
    });
  const empty =
    '<table:table-row table:number-rows-repeated="2"><table:table-cell table:number-columns-repeated="1024"/></table:table-row>';
  const cells =
    '<table:table-row><table:table-cell table:number-columns-repeated="2"/><table:table-cell office:value-type="float" office:value="42"/></table:table-row>';
  assert.deepEqual(importOds(build(empty + cells + empty)).sheets[0]?.rows, [
    [],
    [],
    [null, null, 42],
  ]);
  assert.throws(
    () =>
      importOds(
        build(
          '<table:table-row table:number-rows-repeated="200001"><table:table-cell office:value-type="float" office:value="42"/></table:table-row>',
        ),
      ),
    /limite local/,
  );
  assert.throws(
    () => importOds(build('<table:table-row table:number-rows-repeated="1048577"/>')),
    /Quantidade/,
  );
  assert.throws(
    () =>
      importOds(
        build(
          '<table:table-row><table:table-cell table:formula="of:=SUM(A1:A2)"/></table:table-row>',
        ),
      ),
    /não tem resultado salvo/,
  );
  assert.deepEqual(
    importOds(
      build(
        '<table:table-row><table:table-cell table:formula="of:=1+2" office:value-type="float" office:value="3"/></table:table-row>',
      ),
    ).sheets[0]?.rows,
    [[3]],
  );
});
