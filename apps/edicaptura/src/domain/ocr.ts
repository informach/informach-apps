import { createOcrResultSchema, OCR_TILED_LIMITS, ocrLanguageSchema } from "@informach/edi-ocr";
import { z } from "zod";
import type { CaptureDocument } from "./document.ts";

/**
 * Text recognized in a capture, kept beside the project as `<id>.ocr` (JSON). It belongs to the
 * original raster of that moment: `source` is the SHA-256 and size of `<id>.png` when it was
 * recognized, and a sidecar whose source no longer matches is stale and never shown. Words use
 * the original raster's pixels, the same space as the annotations. Corrections are per line and
 * never rewrite what the engine read.
 */
const resultSchema = createOcrResultSchema(OCR_TILED_LIMITS);
export const OCR_SIDECAR_EXTENSION = "ocr";
export const ocrSidecarSchema = z.strictObject({
  version: z.literal(1),
  source: z.strictObject({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    width: z.number().int().positive().max(OCR_TILED_LIMITS.maxSide),
    height: z.number().int().positive().max(OCR_TILED_LIMITS.maxSide),
  }),
  languages: z.array(ocrLanguageSchema).min(1).max(3),
  recognizedAt: z.iso.datetime(),
  status: z.enum(["text", "empty"]),
  result: resultSchema,
  /** Corrected text of a line, by OCR line id. An empty string removes the line from the text. */
  edits: z.record(z.string().regex(/^\d{1,6}$/), z.string().max(4000)).default({}),
});
export type OcrSidecar = z.infer<typeof ocrSidecarSchema>;
/** What the renderer sends after recognizing: the main adds the source identity itself. */
export const ocrSaveSchema = z.strictObject({
  id: z.string().uuid(),
  languages: ocrSidecarSchema.shape.languages,
  result: resultSchema,
});
export const ocrEditSchema = z.strictObject({
  id: z.string().uuid(),
  edits: ocrSidecarSchema.shape.edits,
});

export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface OcrLine {
  line: number;
  /** As read by the engine. */
  read: string;
  /** Corrected text when there is one, otherwise what was read. */
  text: string;
  edited: boolean;
  box: OcrBox;
  /** Word indices in `result.words`. */
  words: number[];
}

/** Lines in reading order (top to bottom, then left to right), with their corrections. */
export function ocrLines(sidecar: Pick<OcrSidecar, "result" | "edits">): OcrLine[] {
  const lines = new Map<number, OcrLine>();
  sidecar.result.words.forEach((word, index) => {
    if (!word.text.trim()) return;
    const known = lines.get(word.line);
    if (!known) {
      lines.set(word.line, {
        line: word.line,
        read: word.text,
        text: word.text,
        edited: false,
        box: { x0: word.x0, y0: word.y0, x1: word.x1, y1: word.y1 },
        words: [index],
      });
      return;
    }
    known.read += ` ${word.text}`;
    known.words.push(index);
    known.box = {
      x0: Math.min(known.box.x0, word.x0),
      y0: Math.min(known.box.y0, word.y0),
      x1: Math.max(known.box.x1, word.x1),
      y1: Math.max(known.box.y1, word.y1),
    };
  });
  const ordered = [...lines.values()].sort(
    (a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0 || a.line - b.line,
  );
  for (const line of ordered) {
    const edit = sidecar.edits[String(line.line)];
    line.text = edit ?? line.read;
    line.edited = edit !== undefined && edit !== line.read;
  }
  return ordered;
}

type Hiding = Pick<CaptureDocument, "annotations" | "crop">;
const intersects = (a: OcrBox, b: OcrBox) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** Boxes the final image does not show: opaque masks, pixelation and everything outside the crop. */
export function hiddenAreas(doc: Hiding): { masks: OcrBox[]; crop: OcrBox | null } {
  const masks = doc.annotations
    .filter((a) => a.kind === "redact" || a.kind === "blur")
    .map((a) => {
      const end = a as { x2: number; y2: number };
      return {
        x0: Math.min(a.x, end.x2),
        y0: Math.min(a.y, end.y2),
        x1: Math.max(a.x, end.x2),
        y1: Math.max(a.y, end.y2),
      };
    });
  const crop = doc.crop
    ? {
        x0: doc.crop.x,
        y0: doc.crop.y,
        x1: doc.crop.x + doc.crop.width,
        y1: doc.crop.y + doc.crop.height,
      }
    : null;
  return { masks, crop };
}
/**
 * Whether a line can be read in the final image. A line touched by a mask or pixelation, or not
 * wholly inside the crop, is hidden: its text must not leave with the image (copy, sharing,
 * assistants), since it may be exactly what the person covered.
 */
export function lineVisible(line: Pick<OcrLine, "box">, hidden: ReturnType<typeof hiddenAreas>) {
  if (hidden.masks.some((mask) => intersects(mask, line.box))) return false;
  const { crop } = hidden;
  return (
    !crop ||
    (line.box.x0 >= crop.x0 &&
      line.box.y0 >= crop.y0 &&
      line.box.x1 <= crop.x1 &&
      line.box.y1 <= crop.y1)
  );
}
/** Text of the visible lines, one per line, without lines emptied by a correction. */
export function visibleText(lines: readonly OcrLine[], doc: Hiding) {
  const hidden = hiddenAreas(doc);
  const shown = lines.filter((line) => line.text.trim() && lineVisible(line, hidden));
  return { text: shown.map((line) => line.text).join("\n"), hidden: lines.length - shown.length };
}
/** All the searchable text of a capture (corrections applied), for the optional library search. */
export function searchableText(sidecar: Pick<OcrSidecar, "result" | "edits">) {
  return ocrLines(sidecar)
    .map((line) => line.text)
    .filter((text) => text.trim())
    .join("\n");
}
