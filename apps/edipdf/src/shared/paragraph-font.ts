import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";
import { inspectEditableFont } from "./font-file.ts";
import type { ParagraphAnnot } from "./model.ts";
import type { ParagraphLayout } from "./paragraph-layout.ts";
import { assertGlyphs, type UnicodeFonts } from "./unicode-fonts.ts";

export function paragraphRequiredText(a: ParagraphAnnot): string {
  return (
    a.text.normalize("NFC").replace(/\t/g, "    ") +
    (a.list === "bullet" ? "• " : a.list === "numbered" ? "0123456789. " : "")
  );
}

export function encodeParagraphFont(bytes: Uint8Array): string {
  if (bytes.length > 8 * 1024 * 1024) throw new Error("A fonte da caixa ultrapassa 8 MB.");
  const chunks: string[] = [];
  for (let at = 0; at < bytes.length; at += 16384)
    chunks.push(String.fromCharCode(...bytes.subarray(at, at + 16384)));
  return btoa(chunks.join(""));
}

export function paragraphFontBytes(a: ParagraphAnnot, fonts: UnicodeFonts): Uint8Array {
  if (!a.fontData)
    return fonts[a.bold ? (a.italic ? "boldItalic" : "bold") : a.italic ? "italic" : "regular"];
  const decoded = atob(a.fontData.data);
  if (decoded.length > 8 * 1024 * 1024) throw new Error("A fonte da caixa ultrapassa 8 MB.");
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}
export async function embedParagraphFont(
  pdf: PDFDocument,
  bytes: Uint8Array,
  text: string,
  options: { full?: boolean } = {},
): Promise<PDFFont> {
  const info = inspectEditableFont(bytes);
  assertGlyphs(bytes, text.normalize("NFC"));
  pdf.registerFontkit(fontkit);
  return pdf.embedFont(bytes, { subset: info.subset && !options.full });
}

/** The initial profile requires horizontal shaping that PDF text and the DOM can reproduce alike. */
export function validateParagraphInk(
  a: ParagraphAnnot,
  layout: ParagraphLayout,
  bytes: Uint8Array,
): void {
  const font = fontkit.create(bytes),
    scale = a.size / font.unitsPerEm;
  for (const run of layout.runs) {
    const shaped = font.layout(run.text);
    if (shaped.direction === "rtl")
      throw new Error("Esta caixa ainda exige composição horizontal da esquerda para a direita.");
    let pen = 0;
    for (const [index, glyph] of shaped.glyphs.entries()) {
      const position = shaped.positions[index];
      if (
        !position ||
        Math.abs(position.xOffset) > 0.01 ||
        Math.abs(position.yOffset) > 0.01 ||
        Math.abs(position.yAdvance) > 0.01
      )
        throw new Error(
          "Este texto exige posicionamento complexo de glifos, ainda fora do perfil da caixa.",
        );
      const bounds = glyph.bbox;
      const empty =
        bounds.minX === Infinity &&
        bounds.minY === Infinity &&
        bounds.maxX === -Infinity &&
        bounds.maxY === -Infinity &&
        glyph.path.toSVG() === "";
      if (empty && Number.isFinite(glyph.advanceWidth)) {
        pen += glyph.advanceWidth;
        continue;
      }
      if (
        ![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, glyph.advanceWidth].every(
          Number.isFinite,
        )
      )
        throw new Error("Contorno de fonte com métricas inválidas.");
      if (bounds.maxX > bounds.minX && bounds.maxY > bounds.minY) {
        const left = run.x + (pen + bounds.minX) * scale,
          right = run.x + (pen + bounds.maxX) * scale;
        const top = run.baseline - bounds.maxY * scale,
          bottom = run.baseline - bounds.minY * scale;
        if (left < -0.01 || right > a.w + 0.01 || top < -0.01 || bottom > a.h + 0.01)
          throw new Error(
            "Um contorno de letra ultrapassa a caixa. Aumente a caixa ou seu espaço interno; nenhum glifo foi recortado.",
          );
      }
      pen += glyph.advanceWidth;
    }
  }
}
