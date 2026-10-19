import {
  concatTransformationMatrix,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from "pdf-lib";
import { validateRasterImage } from "../raster-image.ts";
import { embedUnicodeFont, type UnicodeFonts } from "../unicode-fonts.ts";
import { type Presentation, type PresentationElement, presentationSchema } from "./format.ts";
import { type PresentationLine, presentationTextLayout } from "./layout.ts";

export function color(hex: string) {
  return rgb(
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  );
}
export interface PreparedPresentation {
  document: Presentation;
  pdf: Uint8Array;
  slides: { elements: { element: PresentationElement; lines?: PresentationLine[] }[] }[];
  warnings: string[];
}
/** PDF preview and PPTX/ODP use the same measured lines and positions. No text is silently clipped. */
export async function preparePresentation(
  input: Presentation,
  fonts: UnicodeFonts,
): Promise<PreparedPresentation> {
  const document = presentationSchema.parse(input),
    pdf = await PDFDocument.create(),
    warnings = new Set(document.warnings),
    slides: PreparedPresentation["slides"] = [];
  pdf.setTitle(document.title);
  pdf.setCreator("EdiPDF — apresentação local");
  const text = document.slides
    .flatMap((slide) =>
      slide.elements.flatMap((element) =>
        element.kind === "text"
          ? element.paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.text))
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
  for (const slide of document.slides) {
    const page = pdf.addPage([document.width, document.height]),
      prepared: PreparedPresentation["slides"][number] = { elements: [] };
    page.drawRectangle({
      x: 0,
      y: 0,
      width: document.width,
      height: document.height,
      color: color(slide.background),
    });
    for (const element of slide.elements) {
      const box = element.box,
        angle = (-element.rotation * Math.PI) / 180,
        sx = element.flipX ? -1 : 1,
        sy = element.flipY ? -1 : 1;
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(
          Math.cos(angle) * sx,
          Math.sin(angle) * sx,
          -Math.sin(angle) * sy,
          Math.cos(angle) * sy,
          box.x + box.w / 2,
          document.height - box.y - box.h / 2,
        ),
      );
      if (element.kind === "text") {
        const layout = presentationTextLayout(element, embedded);
        if (layout.shrunk)
          warnings.add(
            "Há caixas com fonte reduzida para preservar todo o texto dentro da área disponível.",
          );
        if (element.paragraphs.some((paragraph) => paragraph.align === "justify"))
          warnings.add("Texto justificado é alinhado à esquerda neste perfil de apresentação.");
        for (const line of layout.lines) {
          let x = -box.w / 2 + line.left;
          for (const fragment of line.fragments) {
            page.drawText(fragment.text, {
              x,
              y: box.h / 2 - line.top - line.ascent,
              font: fragment.font,
              size: fragment.size,
              color: color(fragment.color),
            });
            x += fragment.width;
          }
        }
        prepared.elements.push({ element, lines: layout.lines });
      } else if (element.kind === "image") {
        validateRasterImage(element.bytes, element.format);
        const image =
          element.format === "png"
            ? await pdf.embedPng(element.bytes)
            : await pdf.embedJpg(element.bytes);
        page.drawImage(image, { x: -box.w / 2, y: -box.h / 2, width: box.w, height: box.h });
        prepared.elements.push({ element });
      } else {
        if (element.shape === "line") {
          if (element.stroke && element.width)
            page.drawLine({
              start: { x: -box.w / 2, y: box.h / 2 },
              end: { x: box.w / 2, y: -box.h / 2 },
              thickness: element.width,
              color: color(element.stroke),
              opacity: element.opacity,
            });
        } else if (element.fill || element.stroke) {
          const style = {
            color: element.fill ? color(element.fill) : undefined,
            borderColor: element.stroke ? color(element.stroke) : undefined,
            borderWidth: element.stroke ? element.width : 0,
            opacity: element.opacity,
            borderOpacity: element.opacity,
          };
          if (element.shape === "rect")
            page.drawRectangle({
              x: -box.w / 2,
              y: -box.h / 2,
              width: box.w,
              height: box.h,
              ...style,
            });
          else page.drawEllipse({ x: 0, y: 0, xScale: box.w / 2, yScale: box.h / 2, ...style });
        }
        prepared.elements.push({ element });
      }
      page.pushOperators(popGraphicsState());
    }
    slides.push(prepared);
  }
  const bytes = new Uint8Array(await pdf.save());
  if (bytes.length > 64 * 1024 * 1024) throw new Error("Prévia de apresentação excede 64 MB.");
  return { document, pdf: bytes, slides, warnings: [...warnings] };
}
