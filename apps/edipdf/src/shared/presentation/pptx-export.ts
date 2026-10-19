import PptxGenJS from "pptxgenjs";
import { readOfficePackage } from "../office-package.ts";
import { presentationLineBox } from "./layout.ts";
import type { PreparedPresentation } from "./render.ts";

function imageData(bytes: Uint8Array, format: "png" | "jpg"): string {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 16384)
    value += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return `data:image/${format === "png" ? "png" : "jpeg"};base64,${btoa(value)}`;
}
/** Data-only local writing: no paths, links, network media, macros or executable content. */
export async function exportPptx(
  prepared: PreparedPresentation,
): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const document = prepared.document,
    presentation = new PptxGenJS();
  presentation.defineLayout({
    name: "EdiPDF",
    width: document.width / 72,
    height: document.height / 72,
  });
  presentation.layout = "EdiPDF";
  presentation.title = document.title;
  presentation.author = "EdiPDF";
  presentation.company = "Informach";
  presentation.theme = { headFontFace: "Noto Sans", bodyFontFace: "Noto Sans" };
  for (const [index, preparedSlide] of prepared.slides.entries()) {
    const source = document.slides[index];
    if (!source) throw new Error("Layout e slides da apresentação não correspondem.");
    const slide = presentation.addSlide();
    slide.background = { color: source.background.slice(1) };
    for (const { element, lines } of preparedSlide.elements) {
      const box = element.box,
        position = {
          x: box.x / 72,
          y: box.y / 72,
          w: box.w / 72,
          h: box.h / 72,
          rotate: ((element.rotation % 360) + 360) % 360,
          flipH: element.flipX,
          flipV: element.flipY,
          objectName: element.id,
        };
      if (element.kind === "text") {
        if (!lines) throw new Error("Texto sem layout medido na apresentação.");
        for (const [lineIndex, line] of lines.entries()) {
          if (!line.fragments.length) continue;
          const lineBox = presentationLineBox(element, line);
          slide.addText(
            line.fragments.map((part) => ({
              text: part.text,
              options: {
                fontFace: "Noto Sans",
                fontSize: part.size,
                bold: part.bold,
                italic: part.italic,
                color: part.color.slice(1),
                breakLine: false,
              },
            })),
            {
              ...position,
              x: lineBox.x / 72,
              y: lineBox.y / 72,
              w: lineBox.w / 72,
              h: lineBox.h / 72,
              objectName: `${element.id}-line-${lineIndex + 1}`,
              margin: 0,
              valign: "top",
              align: "left",
              wrap: false,
              fit: "none",
              paraSpaceAfter: 0,
              paraSpaceBefore: 0,
              lang: "pt-BR",
            },
          );
        }
      } else if (element.kind === "image")
        slide.addImage({
          ...position,
          data: imageData(element.bytes, element.format),
          altText: element.alt,
        });
      else
        slide.addShape(
          element.shape === "rect"
            ? presentation.ShapeType.rect
            : element.shape === "ellipse"
              ? presentation.ShapeType.ellipse
              : presentation.ShapeType.line,
          {
            ...position,
            fill: {
              color: element.fill?.slice(1) ?? "FFFFFF",
              transparency: element.fill ? Math.round((1 - element.opacity) * 100) : 100,
            },
            line: {
              color: element.stroke?.slice(1) ?? "FFFFFF",
              transparency: element.stroke ? Math.round((1 - element.opacity) * 100) : 100,
              width: element.width,
            },
          },
        );
    }
  }
  const output = await presentation.write({ outputType: "arraybuffer", compression: true });
  if (!(output instanceof ArrayBuffer))
    throw new Error("O escritor PPTX não devolveu um buffer local válido.");
  const bytes = new Uint8Array(output);
  if (bytes.length > 64 * 1024 * 1024) throw new Error("Apresentação PPTX excede 64 MB.");
  readOfficePackage(bytes);
  return {
    bytes,
    warnings: [
      ...new Set([
        ...prepared.warnings,
        "PPTX tem texto e objetos editáveis. Noto Sans é indicada, sem incorporar fontes neste perfil; o editor de destino pode substituir fontes e alterar métricas.",
      ]),
    ],
  };
}
