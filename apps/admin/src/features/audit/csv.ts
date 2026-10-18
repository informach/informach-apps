/**
 * CSV da exportação da auditoria. Abre direto no Excel e no Google Planilhas
 * (BOM UTF-8, vírgula, CRLF) e não deixa célula virar fórmula: um valor que
 * começa com = + - @, tab ou retorno ganha um apóstrofo na frente.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
