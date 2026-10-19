import type { LocalPdfEngine } from "./local-engine.ts";
import { exportTableCsv, exportXlsx } from "./office-export.ts";
import type { OfficeCell, OfficeSpreadsheet } from "./office-format.ts";
import { exportOds } from "./open-document/spreadsheet.ts";
import { type TableSettings, tableEvidenceSchema, tableSettingsSchema } from "./table-format.ts";
import { extractGlyphTable, visiblePageGlyphs } from "./text-layout.ts";

export async function exportPdfTable(
  bytes: Uint8Array,
  title: string,
  engine: LocalPdfEngine,
  raw: TableSettings,
  format: "xlsx" | "ods" | "csv" | "json",
  progress?: (page: number, total: number) => void,
) {
  const settings = tableSettingsSchema.parse(raw),
    sizes = engine.pageSizes(bytes),
    size = sizes[settings.page];
  if (
    !size ||
    sizes.length > 1000 ||
    settings.area.x + settings.area.w > size.width + 0.01 ||
    settings.area.y + settings.area.h > size.height + 0.01
  )
    throw new Error("A área da tabela ultrapassa a página escolhida.");
  const text = engine.textDocument(bytes, { includeAnnotations: true, layout: true }, progress),
    page = text.pages.find((item) => item.index === settings.page);
  if (!page || page.error) throw new Error("Não foi possível extrair o texto da página escolhida.");
  if (page.missingUnicode)
    throw new Error(
      "A página contém caracteres sem Unicode. Execute OCR e confira o texto antes de extrair a tabela.",
    );
  for (const glyph of page.glyphs) {
    const box = glyph.layoutBox ?? glyph.box;
    if (!box || glyph.angle === undefined || Math.min(glyph.angle, 360 - glyph.angle) <= 0.5)
      continue;
    const x = box.x + box.w / 2,
      y = box.y + box.h / 2;
    if (
      x >= settings.area.x &&
      x <= settings.area.x + settings.area.w &&
      y >= settings.area.y &&
      y <= settings.area.y + settings.area.h
    )
      throw new Error(
        "A região contém texto vertical, inclinado ou invertido. Gire a página para deixá-lo horizontal antes de extrair a tabela.",
      );
  }
  const table = extractGlyphTable(
    visiblePageGlyphs(page.glyphs, size.width, size.height),
    settings.area,
    settings.separators,
  );
  if (!table.rows.length)
    throw new Error(
      "A área escolhida não contém texto pesquisável. Ajuste a região ou execute OCR.",
    );
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const evidence = tableEvidenceSchema.parse({
    version: 1,
    source: {
      title,
      sha256: hash,
      page: settings.page + 1,
      width: size.width,
      height: size.height,
      area: settings.area,
      separators: settings.separators,
    },
    rows: table.rows.map((row, rowIndex) =>
      row.map((cell, column) => ({ ...cell, address: `R${rowIndex + 1}C${column + 1}` })),
    ),
  });
  const rows: OfficeCell[][] = evidence.rows.map((row) => row.map((cell) => cell.value));
  let sheets: OfficeSpreadsheet = [];
  if (format === "xlsx" || format === "ods") {
    if (rows.reduce((sum, row) => sum + row.length, 0) > 19000)
      throw new Error(
        "Exporte até 19 mil células por planilha com origem, ou escolha CSV/JSON para uma região maior.",
      );
    const provenance: OfficeCell[][] = [
      [
        "Linha",
        "Coluna",
        "Página",
        "X",
        "Y",
        "Largura",
        "Altura",
        "Cruza divisão",
        "Texto de origem",
      ],
    ];
    for (const [rowIndex, row] of evidence.rows.entries())
      for (const [column, cell] of row.entries())
        provenance.push([
          rowIndex + 1,
          column + 1,
          evidence.source.page,
          cell.box?.x ?? null,
          cell.box?.y ?? null,
          cell.box?.w ?? null,
          cell.box?.h ?? null,
          cell.ambiguous,
          cell.value,
        ]);
    const metadata: OfficeCell[][] = [
      ["Documento", title],
      ["SHA-256 da revisão PDF", hash],
      ["Página (começa em 1)", evidence.source.page],
      ["Origem das coordenadas", "Canto superior esquerdo da página visível; pontos PDF"],
      ["Área X", settings.area.x],
      ["Área Y", settings.area.y],
      ["Área largura", settings.area.w],
      ["Área altura", settings.area.h],
      ["Divisões X", settings.separators.join("; ")],
    ];
    sheets = [
      { name: "Tabela", rows, header: settings.header },
      { name: "Origem das células", rows: provenance, header: true },
      { name: "Revisão PDF", rows: metadata, header: false },
    ];
  }
  const output =
    format === "xlsx"
      ? exportXlsx(sheets)
      : format === "ods"
        ? exportOds(sheets)
        : format === "csv"
          ? exportTableCsv(rows)
          : new TextEncoder().encode(JSON.stringify(evidence, null, 2));
  return {
    bytes: output,
    pdf: new Uint8Array(bytes),
    pages: sizes.length,
    extension: format,
    table: evidence,
    warnings: [
      ...table.warnings,
      "Linhas são inferidas pela posição dos caracteres. Revise quebras de linha, mesclagens e todas as células; números permanecem texto literal.",
      ...(format === "csv"
        ? [
            "O CSV contém somente os valores; a origem das células permanece nesta revisão local. Exporte o mapa JSON para compartilhá-la.",
          ]
        : []),
      ...(format === "xlsx" || format === "ods"
        ? [
            "As abas Origem das células e Revisão PDF registram página, áreas e SHA-256 da revisão de origem.",
          ]
        : []),
    ],
  };
}
