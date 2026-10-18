import { PDFDocument } from "pdf-lib";
import {
  type OfficeDocument,
  type OfficeParagraph,
  officeDocumentSchema,
} from "../office-format.ts";
import { embedUnicodeFont, type UnicodeFonts } from "../unicode-fonts.ts";
import { type Presentation, type PresentationElement, presentationSchema } from "./format.ts";
import { presentationParagraphLines } from "./layout.ts";

/** Explicit editable flow export, rather than claiming the original PDF's fixed layout. */
export async function officeFlowPresentation(
  input: OfficeDocument,
  fonts: UnicodeFonts,
): Promise<Presentation> {
  const source = officeDocumentSchema.parse(input);
  if (source.pages.length > 200)
    throw new Error("Apresentação por fluxo limitada a duzentas páginas/slides.");
  const width = Math.max(...source.pages.map((page) => page.width)),
    height = Math.max(...source.pages.map((page) => page.height));
  if (width > 4032 || height > 4032)
    throw new Error("O tamanho da página ultrapassa o perfil de apresentação de 56 polegadas.");
  const text = source.pages
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
  if (text.length > 2_000_000)
    throw new Error("Apresentação por fluxo limitada a dois milhões de caracteres.");
  const metrics = await PDFDocument.create(),
    embedded = {
      regular: await embedUnicodeFont(metrics, fonts.regular, `${text}•`),
      bold: await embedUnicodeFont(metrics, fonts.bold, text),
      italic: await embedUnicodeFont(metrics, fonts.italic, text),
      boldItalic: await embedUnicodeFont(metrics, fonts.boldItalic, text),
    },
    slides: Presentation["slides"] = [],
    warnings = new Set([
      ...source.warnings,
      "Apresentação editável por fluxo: texto/imagens são recompostos, e posições, colunas e paginação do PDF original podem mudar. Confira todos os slides.",
    ]);
  let objects = 0,
    images = 0;
  for (const [pageIndex, page] of source.pages.entries()) {
    const margins = page.margins ?? { left: 36, right: 36, top: 36, bottom: 36 },
      offsetX = (width - page.width) / 2,
      offsetY = (height - page.height) / 2,
      left = offsetX + margins.left,
      top = offsetY + margins.top,
      bottom = offsetY + page.height - margins.bottom,
      availableWidth = page.width - margins.left - margins.right;
    let current: Presentation["slides"][number] = {
        name: `Página ${pageIndex + 1}`,
        background: "#ffffff",
        elements: [],
      },
      cursor = top;
    const flush = () => {
      if (slides.length >= 200) throw new Error("O fluxo da apresentação excede duzentos slides.");
      slides.push(current);
      current = {
        name: `Página ${pageIndex + 1} — continuação ${slides.length + 1}`,
        background: "#ffffff",
        elements: [],
      };
      cursor = top;
    };
    const add = (element: PresentationElement) => {
      if (++objects > 50000 || current.elements.length >= 10000)
        throw new Error("O fluxo da apresentação excede o limite de objetos.");
      current.elements.push(element);
    };
    const paragraph = (paragraph: OfficeParagraph) => {
      for (const line of presentationParagraphLines(paragraph, embedded, availableWidth, 1)) {
        if (line.height > bottom - top)
          throw new Error(
            "Uma linha não cabe na altura útil do slide. Reduza a fonte antes de converter.",
          );
        if (cursor + line.height > bottom && current.elements.length) flush();
        add({
          kind: "text",
          id: `object${objects + 1}`,
          box: { x: left, y: cursor, w: availableWidth, h: line.height },
          rotation: 0,
          flipX: false,
          flipY: false,
          vertical: "top",
          margins: { left: 0, right: 0, top: 0, bottom: 0 },
          paragraphs: [
            {
              kind: "paragraph",
              align: paragraph.align,
              runs: line.fragments.length
                ? line.fragments.map((fragment) => ({
                    text: fragment.text,
                    size: fragment.size,
                    color: fragment.color,
                    bold: fragment.bold,
                    italic: fragment.italic,
                  }))
                : [{ text: "", size: line.height / 1.25 }],
            },
          ],
        });
        cursor += line.height;
      }
      cursor += 3;
    };
    for (const block of page.blocks) {
      if (block.kind === "paragraph") paragraph(block);
      else if (block.kind === "image") {
        images += block.bytes.length;
        if (images > 64 * 1024 * 1024)
          throw new Error("Apresentação por fluxo excede 64 MB de imagens.");
        const scale = Math.min(1, availableWidth / block.width, (bottom - top) / block.height),
          w = block.width * scale,
          h = block.height * scale;
        if (cursor + h > bottom && current.elements.length) flush();
        add({
          kind: "image",
          id: `object${objects + 1}`,
          box: { x: left, y: cursor, w, h },
          rotation: 0,
          flipX: false,
          flipY: false,
          bytes: block.bytes,
          format: block.format,
          alt: block.alt,
        });
        cursor += h + 6;
      } else {
        warnings.add(
          "Tabelas deste fluxo são recompostas como linhas de texto; use XLSX/ODS para dados tabulares com origem.",
        );
        for (const row of block.rows)
          paragraph({
            kind: "paragraph",
            align: "left",
            runs: [{ text: row.map((cell) => String(cell ?? "")).join("\t"), size: 11 }],
          });
      }
    }
    flush();
  }
  return presentationSchema.parse({
    title: source.title,
    width,
    height,
    slides,
    warnings: [...warnings],
  });
}
