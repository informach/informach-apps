import fontkit from "@pdf-lib/fontkit";
import {
  beginText,
  endText,
  PDFArray,
  PDFContentStream,
  PDFDocument,
  PDFName,
  PDFRef,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode,
} from "pdf-lib";
import { viewToPdf } from "./model.ts";
import { embedUnicodeFont } from "./unicode-fonts.ts";

export type { OcrLanguage, OcrResult } from "./ocr-format.ts";
export { ocrLanguageSchema, ocrResultSchema } from "./ocr-format.ts";

import { pruneUnreachable } from "./compress.ts";
import { type OcrResult, ocrResultSchema } from "./ocr-format.ts";

export interface OcrPage {
  page: number;
  result: OcrResult;
  /** Input image rotates the rendered viewport clockwise, then deskews around its centre. */
  turn: 0 | 90 | 180 | 270;
  skew: number;
}

/** Inverse of the exact canvas preprocessing transform, normalized to the original viewport. */
export function ocrPoint(page: OcrPage, x: number, y: number): [number, number] {
  const { width, height } = page.result;
  const a = (-page.skew * Math.PI) / 180;
  const dx = x - width / 2,
    dy = y - height / 2;
  const u = (Math.cos(a) * dx - Math.sin(a) * dy + width / 2) / width;
  const v = (Math.sin(a) * dx + Math.cos(a) * dy + height / 2) / height;
  switch (page.turn) {
    case 90:
      return [v, 1 - u];
    case 180:
      return [1 - u, 1 - v];
    case 270:
      return [1 - v, u];
    default:
      return [u, v];
  }
}

/** A separate owned content stream allows a later OCR pass to replace only our hidden text. */
export async function addOcrLayer(
  bytes: Uint8Array,
  pages: OcrPage[],
  fontBytes: Uint8Array,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (!pages.length || new Set(pages.map((page) => page.page)).size !== pages.length)
    throw new Error("Escolha páginas diferentes para aplicar o OCR.");
  for (const item of pages) {
    ocrResultSchema.parse(item.result);
    if (
      !Number.isInteger(item.page) ||
      item.page < 0 ||
      item.page >= doc.getPageCount() ||
      ![0, 90, 180, 270].includes(item.turn) ||
      !Number.isFinite(item.skew) ||
      Math.abs(item.skew) > 10
    )
      throw new Error("Página ou orientação OCR inválida.");
  }
  const font = await embedUnicodeFont(
    doc,
    fontBytes,
    pages.flatMap((page) => page.result.words.map((word) => word.text)).join(" "),
  );
  const metrics = fontkit.create(fontBytes);
  for (const item of pages) {
    const page = doc.getPage(item.page),
      crop = page.getCropBox();
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270)
      throw new Error("Rotação PDF não suportada pelo OCR.");
    const W = rotation % 180 ? crop.height : crop.width;
    const H = rotation % 180 ? crop.width : crop.height;
    const toPdf = (x: number, y: number): [number, number] => {
      const [u, v] = ocrPoint(item, x, y);
      return viewToPdf(
        rotation,
        { x: crop.x, y: crop.y, w: crop.width, h: crop.height },
        u * W,
        v * H,
      );
    };
    const key = page.node.newFontDictionary(font.name, font.ref);
    const ops = [
      pushGraphicsState(),
      beginText(),
      setFontAndSize(key, 1),
      setTextRenderingMode(TextRenderingMode.Invisible),
    ];
    for (const word of item.result.words) {
      const text = word.text.trim();
      if (!text) continue;
      const measured = font.widthOfTextAtSize(text, 1);
      if (!measured) continue;
      let advance = 0,
        minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const glyph of metrics.layout(text).glyphs) {
        if (glyph.bbox.maxX > glyph.bbox.minX && glyph.bbox.maxY > glyph.bbox.minY) {
          minX = Math.min(minX, advance + glyph.bbox.minX);
          maxX = Math.max(maxX, advance + glyph.bbox.maxX);
          minY = Math.min(minY, glyph.bbox.minY);
          maxY = Math.max(maxY, glyph.bbox.maxY);
        }
        advance += glyph.advanceWidth;
      }
      if (!(maxX > minX) || !(maxY > minY)) continue;
      const leftBearing = minX / metrics.unitsPerEm,
        descent = minY / metrics.unitsPerEm;
      const bl = toPdf(word.x0, word.y1),
        br = toPdf(word.x1, word.y1),
        tl = toPdf(word.x0, word.y0);
      const width = (maxX - minX) / metrics.unitsPerEm,
        height = (maxY - minY) / metrics.unitsPerEm;
      const hx = [(br[0] - bl[0]) / width, (br[1] - bl[1]) / width];
      const hy = [(tl[0] - bl[0]) / height, (tl[1] - bl[1]) / height];
      ops.push(
        setTextMatrix(
          hx[0],
          hx[1],
          hy[0],
          hy[1],
          bl[0] - hx[0] * leftBearing - hy[0] * descent,
          bl[1] - hx[1] * leftBearing - hy[1] * descent,
        ),
        showText(font.encodeText(`${text} `)),
      );
    }
    ops.push(endText(), popGraphicsState());
    const old = page.node.get(PDFName.of("EdiOCRStream"));
    const contents = page.node.Contents();
    if (old instanceof PDFRef) {
      let found = false;
      if (contents instanceof PDFArray) {
        for (let i = contents.size() - 1; i >= 0; i--)
          if (contents.get(i).toString() === old.toString()) {
            contents.remove(i);
            found = true;
          }
      } else if (page.node.get(PDFName.Contents)?.toString() === old.toString()) {
        page.node.delete(PDFName.Contents);
        found = true;
      }
      if (!found)
        throw new Error(
          "A camada OCR anterior foi alterada por outra operação. Ela não pode ser substituída com segurança; preserve esta revisão e revise o texto existente.",
        );
    }
    const stream = doc.context.register(PDFContentStream.of(doc.context.obj({}), ops));
    page.node.addContentStream(stream);
    page.node.set(PDFName.of("EdiOCRStream"), stream);
    page.node.set(PDFName.of("EdiOCRVersion"), doc.context.obj(1));
  }
  await doc.flush();
  pruneUnreachable(doc);
  return doc.save({ updateFieldAppearances: false });
}
