import { PDFDocument, type PDFFont, rgb } from "pdf-lib";
import {
  type OfficeDocument,
  type OfficeParagraph,
  officeDocumentSchema,
} from "./office-format.ts";
import { validateRasterImage } from "./raster-image.ts";
import { embedUnicodeFont, type UnicodeFonts } from "./unicode-fonts.ts";

interface Fragment {
  text: string;
  font: PDFFont;
  size: number;
  color: string;
  width: number;
}
interface FlowLine {
  fragments: Fragment[];
  width: number;
  height: number;
}
export interface OfficePdfResult {
  bytes: Uint8Array;
  warnings: string[];
  pages: number;
}
/** Reflow is explicit: editable source values become real PDF text, with overflow on new pages. */
export async function renderOfficePdf(
  input: OfficeDocument,
  fonts: UnicodeFonts,
): Promise<OfficePdfResult> {
  const document = officeDocumentSchema.parse(input),
    pdf = await PDFDocument.create();
  pdf.setTitle(document.title);
  pdf.setCreator("EdiPDF — conversão local");
  const warnings = new Set(document.warnings);
  const text = document.pages
    .flatMap((page) =>
      page.blocks.flatMap((block) =>
        block.kind === "paragraph"
          ? block.runs.map((run) => run.text)
          : block.kind === "table"
            ? block.rows.flat().map((cell) => String(cell ?? ""))
            : [],
      ),
    )
    .join("\n");
  const embedded = {
    regular: await embedUnicodeFont(pdf, fonts.regular, `${text}•`),
    bold: await embedUnicodeFont(pdf, fonts.bold, text),
    italic: await embedUnicodeFont(pdf, fonts.italic, text),
    boldItalic: await embedUnicodeFont(pdf, fonts.boldItalic, text),
  };
  function lines(paragraph: OfficeParagraph, width: number): FlowLine[] {
    const result: FlowLine[] = [];
    let current: FlowLine = { fragments: [], width: 0, height: 14 };
    const flush = () => {
      result.push(current);
      current = { fragments: [], width: 0, height: 14 };
    };
    const add = (fragment: Fragment) => {
      const previous = current.fragments.at(-1);
      if (
        previous &&
        previous.font === fragment.font &&
        previous.size === fragment.size &&
        previous.color === fragment.color
      ) {
        previous.text += fragment.text;
        previous.width += fragment.width;
      } else current.fragments.push({ ...fragment });
      current.width += fragment.width;
      current.height = Math.max(current.height, fragment.size * 1.35);
    };
    for (const run of paragraph.runs) {
      const font = run.bold
        ? run.italic
          ? embedded.boldItalic
          : embedded.bold
        : run.italic
          ? embedded.italic
          : embedded.regular;
      const size = run.size ?? (paragraph.heading ? 22 - paragraph.heading * 2 : 11),
        color = run.color ?? "#202020";
      if (size * 1.35 > 1000) throw new Error("Linha de texto excede os limites de paginação.");
      for (const token of run.text
        .replace(/\r\n?|\n/g, "\n")
        .replace(/\t/g, "    ")
        .split(/(\n|[^\S\n]+|[^\s]+)/u)
        .filter(Boolean)) {
        if (token === "\n") {
          flush();
          continue;
        }
        const tokenWidth = font.widthOfTextAtSize(token, size);
        if (current.width + tokenWidth > width && current.fragments.length && token.trim()) flush();
        if (tokenWidth <= width) {
          add({ text: token, width: tokenWidth, font, size, color });
          continue;
        }
        for (const char of token) {
          const charWidth = font.widthOfTextAtSize(char, size);
          if (charWidth > width)
            throw new Error(
              "Um caractere não cabe na área útil da página. Reduza as margens ou o tamanho da fonte.",
            );
          if (current.width + charWidth > width && current.fragments.length) flush();
          add({ text: char, width: charWidth, font, size, color });
        }
      }
    }
    if (current.fragments.length || !result.length) flush();
    return result;
  }
  const color = (hex: string) =>
    rgb(
      Number.parseInt(hex.slice(1, 3), 16) / 255,
      Number.parseInt(hex.slice(3, 5), 16) / 255,
      Number.parseInt(hex.slice(5, 7), 16) / 255,
    );
  for (const sourcePage of document.pages) {
    const margin = sourcePage.margins ?? { left: 36, right: 36, top: 36, bottom: 36 },
      width = sourcePage.width - margin.left - margin.right,
      available = sourcePage.height - margin.top - margin.bottom;
    let page = pdf.addPage([sourcePage.width, sourcePage.height]),
      y = sourcePage.height - margin.top;
    const nextPage = () => {
      if (pdf.getPageCount() >= 1000)
        throw new Error("Conversão excede mil páginas. Divida o documento de origem.");
      page = pdf.addPage([sourcePage.width, sourcePage.height]);
      y = sourcePage.height - margin.top;
    };
    const ensure = (height: number) => {
      if (height > available) throw new Error("Conteúdo maior que a área útil da página.");
      if (y - height < margin.bottom) nextPage();
    };
    const drawLine = (line: FlowLine, x: number, top: number) => {
      for (const fragment of line.fragments) {
        page.drawText(fragment.text, {
          x,
          y: top - line.height + (line.height - fragment.size) * 0.4,
          font: fragment.font,
          size: fragment.size,
          color: color(fragment.color),
        });
        x += fragment.width;
      }
    };
    for (const block of sourcePage.blocks) {
      if (block.kind === "paragraph") {
        const inset = block.bullet ? 16 : 0,
          wrapped = lines(block, width - inset);
        wrapped.forEach((line, index) => {
          ensure(line.height);
          if (block.bullet && index === 0)
            page.drawText("•", {
              x: margin.left,
              y: y - line.height + 2,
              font: embedded.regular,
              size: 11,
            });
          const extra =
            block.align === "center"
              ? (width - inset - line.width) / 2
              : block.align === "right"
                ? width - inset - line.width
                : 0;
          drawLine(line, margin.left + inset + Math.max(0, extra), y);
          y -= line.height;
        });
        if (block.align === "justify")
          warnings.add(
            "Parágrafos justificados usam alinhamento à esquerda neste perfil de fluxo.",
          );
        y = Math.max(margin.bottom, y - 5);
      } else if (block.kind === "image") {
        validateRasterImage(block.bytes, block.format);
        const image =
          block.format === "png"
            ? await pdf.embedPng(block.bytes)
            : await pdf.embedJpg(block.bytes);
        if (image.width * image.height > 32_000_000 || image.width > 16000 || image.height > 16000)
          throw new Error("Imagem excede os limites locais de resolução.");
        const scale = Math.min(1, width / block.width, available / block.height),
          w = block.width * scale,
          h = block.height * scale;
        ensure(h);
        page.drawImage(image, { x: margin.left, y: y - h, width: w, height: h });
        y = Math.max(margin.bottom, y - h - 5);
      } else {
        const columns = block.rows.reduce((maximum, row) => Math.max(maximum, row.length), 1),
          perPage = Math.max(1, Math.min(columns, Math.floor(width / 40)));
        if (columns > perPage)
          warnings.add(
            "Tabelas largas são divididas em grupos de colunas, preservando todas as células.",
          );
        for (let start = 0; start < columns; start += perPage) {
          if (start) nextPage();
          const count = Math.min(perPage, columns - start),
            cellWidth = width / count;
          for (let r = 0; r < block.rows.length; r++) {
            const row = block.rows[r];
            if (!row) throw new Error("Linha da tabela indisponível.");
            const cells = Array.from({ length: count }, (_, column) =>
              lines(
                {
                  kind: "paragraph",
                  align: "left",
                  runs: [
                    {
                      text: String(row[start + column] ?? ""),
                      size: 10,
                      bold: block.header && r === 0,
                    },
                  ],
                },
                cellWidth - 8,
              ),
            );
            const lineCount = cells.reduce((maximum, cell) => Math.max(maximum, cell.length), 1);
            for (let offset = 0; offset < lineCount; ) {
              ensure(22);
              const capacity = Math.floor((y - margin.bottom - 8) / 14),
                take = Math.min(lineCount - offset, Math.max(1, capacity)),
                h = take * 14 + 8;
              ensure(h);
              for (let c = 0; c < count; c++) {
                const x = margin.left + c * cellWidth;
                page.drawRectangle({
                  x,
                  y: y - h,
                  width: cellWidth,
                  height: h,
                  borderWidth: 0.4,
                  borderColor: rgb(0.65, 0.65, 0.65),
                  ...(block.header && r === 0 ? { color: rgb(0.93, 0.93, 0.93) } : {}),
                });
                const cell = cells[c];
                if (!cell) throw new Error("Célula da tabela indisponível.");
                for (let l = 0; l < take; l++) {
                  const line = cell[offset + l];
                  if (line) drawLine(line, x + 4, y - 4 - l * 14);
                }
              }
              y -= h;
              offset += take;
              if (offset < lineCount) nextPage();
            }
          }
          y = Math.max(margin.bottom, y - 6);
        }
      }
    }
  }
  return { bytes: await pdf.save(), warnings: [...warnings], pages: pdf.getPageCount() };
}
