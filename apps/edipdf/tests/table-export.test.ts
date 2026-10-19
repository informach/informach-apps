import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { degrees, PDFDocument, StandardFonts } from "pdf-lib";
import { LocalPdfEngine } from "../src/shared/local-engine.ts";
import { importXlsx } from "../src/shared/office-import.ts";
import { importOds } from "../src/shared/open-document/spreadsheet.ts";
import { writeEditableAnnotation } from "../src/shared/pdf-annotations.ts";
import { exportPdfTable } from "../src/shared/table-export.ts";
import { tableEvidenceSchema } from "../src/shared/table-format.ts";

const require = createRequire(import.meta.url);
const engine = await LocalPdfEngine.create(
  await readFile(require.resolve("@embedpdf/pdfium/pdfium.wasm")),
);
async function fixture(rotation = 0) {
  const document = await PDFDocument.create(),
    font = await document.embedFont(StandardFonts.Helvetica);
  document.addPage([600, 800]).drawText("OUTSIDE_SELECTED_PAGE", { x: 50, y: 700, font, size: 12 });
  const page = document.addPage([600, 800]);
  if (rotation) page.setRotation(degrees(rotation));
  for (const [text, x, y] of [
    ["Produto", 50, 700],
    ["Valor", 300, 700],
    ["Arroz integral", 50, 670],
    ["12,50", 300, 670],
    ["=1+2", 50, 640],
  ] as const)
    page.drawText(text, { x, y, font, size: 12 });
  return new Uint8Array(await document.save());
}
const settings = {
  page: 1,
  area: { x: 40, y: 80, w: 500, h: 100 },
  separators: [250],
  header: true,
};
test("PDF table export preserves literal values and blank cells, with independent XLSX/ODS readback and complete provenance", async () => {
  const bytes = await fixture();
  for (const format of ["xlsx", "ods"] as const) {
    const output = await exportPdfTable(bytes, "Planilha local", engine, settings, format),
      imported = format === "xlsx" ? importXlsx(output.bytes) : importOds(output.bytes);
    assert.deepEqual(imported.sheets[0]?.rows, [
      ["Produto", "Valor"],
      ["Arroz integral", "12,50"],
      ["=1+2", ""],
    ]);
    assert.equal(imported.sheets.length, 3);
    assert.equal(output.table.source.page, 2);
    assert.equal(output.table.source.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(output.table.rows[1]?.[0]?.address, "R2C1");
    assert.ok(output.table.rows[1]?.[0]?.box);
    assert.equal(output.table.rows[2]?.[1]?.box, null);
    assert.deepEqual(imported.sheets[1]?.rows[1]?.slice(0, 3), [1, 1, 2]);
    assert.deepEqual(output.pdf, bytes);
  }
});
test("CSV protects formula-looking strings and JSON retains the original text, areas and source revision", async () => {
  const bytes = await fixture(),
    csv = await exportPdfTable(bytes, "Local", engine, settings, "csv"),
    json = await exportPdfTable(bytes, "Local", engine, settings, "json");
  assert.match(new TextDecoder().decode(csv.bytes), /"'=1\+2"/);
  assert.match(new TextDecoder().decode(csv.bytes), /"12,50"/);
  const evidence = tableEvidenceSchema.parse(JSON.parse(new TextDecoder().decode(json.bytes)));
  assert.equal(evidence.rows[2]?.[0]?.value, "=1+2");
  assert.deepEqual(evidence.source.area, settings.area);
  assert.equal(evidence.source.width, 600);
  assert.equal(evidence.source.height, 800);
  assert.ok(!evidence.rows.flat().some((cell) => cell.value.includes("OUTSIDE_SELECTED_PAGE")));
  const broken = structuredClone(evidence);
  if (broken.rows[0]?.[0]) broken.rows[0][0].address = "R2C1";
  assert.equal(tableEvidenceSchema.safeParse(broken).success, false);
});
test("table export rejects invalid regions, separators and vertical text while retaining ambiguous boundaries", async () => {
  const bytes = await fixture();
  await assert.rejects(
    () =>
      exportPdfTable(
        bytes,
        "x",
        engine,
        { ...settings, area: { x: 0, y: 0, w: 601, h: 800 } },
        "csv",
      ),
    /ultrapassa/,
  );
  await assert.rejects(
    () => exportPdfTable(bytes, "x", engine, { ...settings, separators: [300, 200] }, "csv"),
    /divisões/,
  );
  await assert.rejects(
    () =>
      exportPdfTable(
        bytes,
        "x",
        engine,
        { ...settings, area: { x: 10, y: 10, w: 10, h: 10 }, separators: [] },
        "csv",
      ),
    /não contém/,
  );
  const ambiguous = await exportPdfTable(
    bytes,
    "x",
    engine,
    { ...settings, separators: [75] },
    "json",
  );
  assert.ok(ambiguous.table.rows.flat().some((cell) => cell.ambiguous));
  assert.ok(ambiguous.warnings.some((warning) => warning.includes("cruza")));
  const rotated = await fixture(90);
  await assert.rejects(
    () =>
      exportPdfTable(
        rotated,
        "x",
        engine,
        { ...settings, area: { x: 0, y: 0, w: 800, h: 600 }, separators: [] },
        "json",
      ),
    /texto vertical/,
  );
});

test("upright table text on a rotated cropped page keeps visible coordinates and complete words", async () => {
  const document = await PDFDocument.create(),
    font = await document.embedFont(StandardFonts.Helvetica),
    page = document.addPage([620, 840]);
  page.setCropBox(10, 20, 600, 800);
  page.setRotation(degrees(90));
  for (const [text, x, y] of [
    ["Produto", 110, 70],
    ["Valor", 110, 320],
    ["Arroz", 140, 70],
    ["12,50", 140, 320],
  ] as const)
    page.drawText(text, { x, y, rotate: degrees(90), font, size: 12 });
  const output = await exportPdfTable(
    new Uint8Array(await document.save()),
    "Girado",
    engine,
    { ...settings, page: 0 },
    "json",
  );
  assert.deepEqual(
    output.table.rows.map((row) => row.map((cell) => cell.value)),
    [
      ["Produto", "Valor"],
      ["Arroz", "12,50"],
    ],
  );
  assert.equal(output.table.source.width, 800);
  assert.equal(output.table.source.height, 600);
});

test("table extraction includes current visible text annotations and form values without exporting sidebar comments", async () => {
  const document = await PDFDocument.create(),
    font = await document.embedFont(StandardFonts.Helvetica),
    page = document.addPage([600, 800]);
  page.drawText("ORIGINAL", { x: 50, y: 700, font, size: 12 });
  const crop = { x: 0, y: 0, w: 600, h: 800 };
  await writeEditableAnnotation(
    document,
    page,
    0,
    crop,
    {
      id: "current",
      page: "p",
      kind: "text",
      x: 50,
      y: 140,
      text: "ADDED_CURRENT_123",
      font: "helvetica",
      size: 12,
      color: "#111111",
    },
    { x: 50, y: 136, w: 200, h: 20 },
    async (target) => {
      target.drawText("ADDED_CURRENT_123", { x: 50, y: 650, font, size: 12 });
    },
  );
  const form = document.getForm(),
    field = form.createTextField("current-field");
  field.setText("FIELD_CURRENT_456");
  field.addToPage(page, { x: 300, y: 650, width: 180, height: 20 });
  form.updateFieldAppearances(font);
  await writeEditableAnnotation(
    document,
    page,
    0,
    crop,
    { id: "note", page: "p", kind: "note", x: 50, y: 100, text: "COMMENT_ONLY", color: "#ffaa00" },
    { x: 50, y: 100, w: 20, h: 20 },
    async () => undefined,
  );
  const output = await exportPdfTable(
      new Uint8Array(await document.save()),
      "Atual",
      engine,
      { ...settings, page: 0 },
      "json",
    ),
    text = output.table.rows
      .flat()
      .map((cell) => cell.value)
      .join(" ");
  assert.match(text, /ADDED_CURRENT_123/);
  assert.match(text, /FIELD_CURRENT_456/);
  assert.doesNotMatch(text, /COMMENT_ONLY/);
});
