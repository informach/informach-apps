import { Element } from "@xmldom/xmldom";
import { strToU8 } from "fflate";
import { children } from "../office-dom.ts";
import { type OfficeCell, type OfficeSpreadsheet, spreadsheetSchema } from "../office-format.ts";
import { XML_HEADER, xml } from "../office-xml.ts";
import { attr, child, integer, is } from "./dom.ts";
import { openCell } from "./export.ts";
import { namespaces, readOpenPackage, writeOpenPackage } from "./package.ts";

function textValue(node: Element): string {
  let result = "";
  for (const current of node.childNodes) {
    if (!(current instanceof Element)) {
      if (current.nodeType === 3 || current.nodeType === 4)
        result += (current.nodeValue ?? "").replace(/[\t\r\n ]+/g, " ");
    } else if (is(current, "text", "s"))
      result += " ".repeat(integer(attr(current, "text", "c"), 1, 32767));
    else if (is(current, "text", "tab")) result += "\t";
    else if (is(current, "text", "line-break")) result += "\n";
    else if (is(current, "text", "span") || is(current, "text", "a")) result += textValue(current);
    else throw new Error(`Texto de célula ODS ainda não suportado: ${current.tagName}.`);
    if (result.length > 32767) throw new Error("Texto de célula ODS excede 32767 caracteres.");
  }
  return result;
}
function cellValue(node: Element, warnings: Set<string>): { value: OfficeCell; used: boolean } {
  const type = attr(node, "office", "value-type"),
    formula = attr(node, "table", "formula"),
    paragraphs = children(node).filter((item) => is(item, "text", "p") || is(item, "text", "h"));
  for (const element of children(node))
    if (!is(element, "text", "p") && !is(element, "text", "h"))
      throw new Error("Célula ODS com objeto/comentário fora do perfil tabular.");
  const text = paragraphs.map(textValue).join("\n");
  if (text.length > 32767) throw new Error("Texto de célula ODS excede 32767 caracteres.");
  if (formula) {
    warnings.add(
      "Fórmulas ODS usam apenas o resultado salvo no arquivo; nada é executado ou atualizado.",
    );
    if (!type || type === "void")
      throw new Error(
        "Fórmula ODS não tem resultado salvo. Recalcule e salve a planilha antes da conversão.",
      );
  }
  if (attr(node, "table", "number-columns-spanned") || attr(node, "table", "number-rows-spanned"))
    warnings.add(
      "Mesclagens ODS mantêm o valor de origem e as posições, sem reproduzir a mesclagem.",
    );
  if (attr(node, "table", "style-name"))
    warnings.add("ODS preserva valores; estilos, formatos numéricos e dimensões são recompostos.");
  if (type === "float" || type === "percentage" || type === "currency") {
    const raw = attr(node, "office", "value");
    if (
      !raw ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) ||
      !Number.isFinite(Number(raw))
    )
      throw new Error("Valor numérico ODS inválido/sem resultado salvo.");
    if (type !== "float")
      warnings.add("Moeda e porcentagem ODS são preservadas como números brutos.");
    return { value: Number(raw), used: true };
  }
  if (type === "boolean") {
    const value = attr(node, "office", "boolean-value");
    if (!["true", "false", "1", "0"].includes(value ?? ""))
      throw new Error("Booleano ODS inválido/sem resultado salvo.");
    return { value: value === "true" || value === "1", used: true };
  }
  if (type === "date" || type === "time") {
    const value = attr(node, "office", type === "date" ? "date-value" : "time-value");
    if (
      !value ||
      value.length > 100 ||
      !(
        type === "date"
          ? /^-?\d{4,}-\d{2}-\d{2}(?:T[^\s]+)?$/
          : /^-?P(?:\d+D)?T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?$/
      ).test(value)
    )
      throw new Error("Data/duração ODS inválida/sem resultado salvo.");
    warnings.add(
      "Datas e durações ODS são preservadas como texto ISO, sem inferir formato regional.",
    );
    return { value, used: true };
  }
  if (type === "string") return { value: attr(node, "office", "string-value") ?? text, used: true };
  if (type && type !== "void") throw new Error(`Tipo de célula ODS não suportado: ${type}.`);
  return { value: text || null, used: text.length > 0 };
}
/** Resolve the used extent before expanding repeats. Empty million-row tails stay metadata only. */
export function importOds(bytes: Uint8Array): { sheets: OfficeSpreadsheet; warnings: string[] } {
  const input = readOpenPackage(bytes, "spreadsheet"),
    body = child(
      child(input.content.documentElement ?? undefined, "office", "body"),
      "office",
      "spreadsheet",
    ),
    warnings = new Set<string>(),
    sheets: OfficeSpreadsheet = [];
  if (!body) throw new Error("ODS sem corpo de planilha.");
  let totalCells = 0,
    totalText = 0;
  for (const table of children(body)) {
    if (is(table, "table", "named-expressions") || is(table, "table", "calculation-settings")) {
      warnings.add("Expressões e configurações de cálculo ODS não são executadas.");
      continue;
    }
    if (!is(table, "table", "table"))
      throw new Error(`Estrutura de pasta ODS ainda não suportada: ${table.tagName}.`);
    if (sheets.length >= 100) throw new Error("ODS excede cem planilhas.");
    const plans: { at: number; repeat: number; values: OfficeCell[]; used: boolean }[] = [];
    let rowPosition = 0,
      usedRows = 0;
    const rowsIn = (parent: Element) => {
      for (const row of children(parent)) {
        if (
          is(row, "table", "table-header-rows") ||
          is(row, "table", "table-rows") ||
          is(row, "table", "table-row-group")
        ) {
          rowsIn(row);
          continue;
        }
        if (
          is(row, "table", "table-column") ||
          is(row, "table", "table-columns") ||
          is(row, "table", "table-column-group")
        )
          continue;
        if (!is(row, "table", "table-row"))
          throw new Error(`Estrutura de planilha ODS ainda não suportada: ${row.tagName}.`);
        const repeat = integer(attr(row, "table", "number-rows-repeated"), 1, 1048576),
          groups: { at: number; repeat: number; value: OfficeCell; used: boolean }[] = [];
        let position = 0,
          usedColumns = 0;
        for (const cell of children(row)) {
          if (!is(cell, "table", "table-cell") && !is(cell, "table", "covered-table-cell"))
            throw new Error("Célula ODS inválida.");
          const count = integer(attr(cell, "table", "number-columns-repeated"), 1, 16384),
            value = cellValue(cell, warnings);
          if (position + count > 16384) throw new Error("ODS excede 16384 colunas declaradas.");
          groups.push({ at: position, repeat: count, ...value });
          position += count;
          if (value.used) usedColumns = position;
        }
        if (rowPosition + repeat > 1048576)
          throw new Error("ODS excede 1048576 linhas declaradas.");
        totalCells += repeat * usedColumns;
        totalText += groups.reduce(
          (sum, group) =>
            sum + (group.used ? String(group.value ?? "").length * group.repeat * repeat : 0),
          0,
        );
        if (totalCells > 200000 || totalText > 5_000_000)
          throw new Error("ODS excede o limite local de células/texto efetivamente usados.");
        const values: OfficeCell[] = Array.from({ length: usedColumns }, () => null);
        for (const group of groups)
          if (group.used) for (let i = 0; i < group.repeat; i++) values[group.at + i] = group.value;
        plans.push({ at: rowPosition, repeat, values, used: usedColumns > 0 });
        rowPosition += repeat;
        if (usedColumns) usedRows = rowPosition;
      }
    };
    rowsIn(table);
    if (usedRows > 100000) throw new Error("ODS excede cem mil linhas até a última célula usada.");
    const rows: OfficeCell[][] = Array.from({ length: usedRows }, () => []);
    for (const plan of plans)
      for (let i = 0; i < plan.repeat && plan.at + i < usedRows; i++)
        rows[plan.at + i] = plan.values.slice();
    if (rowPosition > usedRows)
      warnings.add(
        "Linhas/colunas vazias ao final da planilha são ignoradas sem expandir repetições.",
      );
    sheets.push({
      name: attr(table, "table", "name") ?? "",
      rows,
      header: !!child(table, "table", "table-header-rows"),
    });
  }
  return { sheets: spreadsheetSchema.parse(sheets), warnings: [...warnings] };
}
export function exportOds(input: OfficeSpreadsheet): Uint8Array {
  const sheets = spreadsheetSchema.parse(input),
    tables = sheets
      .map(
        (sheet) =>
          `<table:table table:name="${xml(sheet.name)}"><table:table-column table:number-columns-repeated="${sheet.rows.reduce((max, row) => Math.max(max, row.length), 1)}"/>${(sheet.rows.length ? sheet.rows : [[]]).map((row, index) => `${sheet.header && index === 0 ? "<table:table-header-rows>" : ""}<table:table-row>${row.length ? row.map(openCell).join("") : "<table:table-cell/>"}</table:table-row>${sheet.header && index === 0 ? "</table:table-header-rows>" : ""}`).join("")}</table:table>`,
      )
      .join("");
  return writeOpenPackage("spreadsheet", {
    "content.xml": strToU8(
      `${XML_HEADER}<office:document-content ${namespaces} office:version="1.3"><office:body><office:spreadsheet>${tables}</office:spreadsheet></office:body></office:document-content>`,
    ),
  });
}
