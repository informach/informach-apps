import {
  type OfficeDocument,
  type OfficeParagraph,
  officeDocumentSchema,
} from "./office-format.ts";
import { validateRasterImage } from "./raster-image.ts";

function escaped(text: string): string {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if ((code < 32 && ![9, 10, 13].includes(code)) || (code >= 0xd800 && code <= 0xdfff))
      throw new Error("O texto contém um controle ou sequência Unicode inválida para RTF.");
  }
  let result = "";
  const normalized = text.replace(/\r\n?/g, "\n");
  for (let index = 0; index < normalized.length; index++) {
    const value = normalized.charCodeAt(index),
      char = normalized.charAt(index);
    result +=
      value === 9
        ? "\\tab "
        : value === 10
          ? "\\line "
          : char === "\\" || char === "{" || char === "}"
            ? `\\${char}`
            : value >= 128
              ? `\\u${value > 32767 ? value - 65536 : value}?`
              : char;
  }
  return result;
}
/** Editable Unicode RTF without embedded objects, macros, fields or executable destinations. */
export function exportRtf(input: OfficeDocument): { bytes: Uint8Array; warnings: string[] } {
  const document = officeDocumentSchema.parse(input),
    parts: string[] = [],
    colors = new Map<string, number>();
  for (const page of document.pages)
    for (const block of page.blocks)
      if (block.kind === "paragraph")
        for (const run of block.runs)
          if (run.color && !colors.has(run.color.toLowerCase()))
            colors.set(run.color.toLowerCase(), colors.size + 1);
  if (colors.size > 4095) throw new Error("RTF acima do limite de cores locais.");
  let length = 0;
  const write = (part: string) => {
    length += part.length;
    if (length > 64 * 1024 * 1024)
      throw new Error("RTF gerado acima de 64 MB. Nenhum arquivo parcial foi salvo.");
    parts.push(part);
  };
  write(
    "{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fnil\\fcharset0 Noto Sans;}}\n{\\colortbl ;",
  );
  for (const color of colors.keys())
    write(
      `\\red${Number.parseInt(color.slice(1, 3), 16)}\\green${Number.parseInt(color.slice(3, 5), 16)}\\blue${Number.parseInt(color.slice(5, 7), 16)};`,
    );
  write("}\n");
  const paragraph = (block: OfficeParagraph) => {
    write(
      `\\pard\\plain\\f0\\${block.align === "center" ? "qc" : block.align === "right" ? "qr" : block.align === "justify" ? "qj" : "ql"}${block.heading ? `\\outlinelevel${block.heading - 1}` : ""} `,
    );
    if (block.bullet) write("\\bullet\\tab ");
    for (const run of block.runs)
      write(
        `{\\b${run.bold ? 1 : 0}\\i${run.italic ? 1 : 0}\\fs${Math.round((run.size ?? 11) * 2)}\\cf${run.color ? (colors.get(run.color.toLowerCase()) ?? 0) : 0} ${escaped(run.text)}}`,
      );
    write("\\par\n");
  };
  for (const [index, page] of document.pages.entries()) {
    const margin = page.margins ?? { left: 36, right: 36, top: 36, bottom: 36 },
      twips = (value: number) => Math.round(value * 20);
    if (index) write("\\sect\n");
    write(
      `\\sectd\\sbkpage\\pgwsxn${twips(page.width)}\\pghsxn${twips(page.height)}\\marglsxn${twips(margin.left)}\\margrsxn${twips(margin.right)}\\margtsxn${twips(margin.top)}\\margbsxn${twips(margin.bottom)}\n`,
    );
    for (const block of page.blocks) {
      if (block.kind === "paragraph") paragraph(block);
      else if (block.kind === "image") {
        validateRasterImage(block.bytes, block.format);
        write(
          `\\pard{\\pict\\${block.format === "png" ? "pngblip" : "jpegblip"}\\picwgoal${twips(block.width)}\\pichgoal${twips(block.height)}\n`,
        );
        for (let at = 0; at < block.bytes.length; at += 32768)
          write(
            Array.from(block.bytes.subarray(at, at + 32768), (value) =>
              value.toString(16).padStart(2, "0"),
            ).join(""),
          );
        write("}\\par\n");
      } else {
        const columns = Math.max(1, ...block.rows.map((row) => row.length)),
          width = twips(page.width - margin.left - margin.right);
        for (const [rowIndex, row] of block.rows.entries()) {
          write(`\\trowd\\trgaph108\\trleft0${block.header && rowIndex === 0 ? "\\trhdr" : ""}`);
          for (let column = 1; column <= columns; column++)
            write(`\\cellx${Math.round((width * column) / columns)}`);
          write("\n");
          for (let column = 0; column < columns; column++)
            write(
              `\\pard\\intbl\\plain\\f0\\fs22${block.header && rowIndex === 0 ? "\\b" : ""} ${escaped(String(row[column] ?? ""))}\\cell `,
            );
          write("\\row\n");
        }
        write("\\pard\n");
      }
    }
  }
  write("}");
  return {
    bytes: new TextEncoder().encode(parts.join("")),
    warnings: [
      ...document.warnings,
      "RTF editável por fluxo. Noto Sans é indicada no arquivo, sem incorporar a fonte; o editor de destino pode usar outra fonte e alterar a paginação.",
    ],
  };
}
