import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { validateRasterImage } from "./raster-image.ts";
import { scannerPageSchema } from "./scanner-format.ts";

export const scanPdfRequestSchema = scannerPageSchema.extend({
  previous: z
    .custom<Uint8Array>((value) => value instanceof Uint8Array)
    .refine((value) => value.length > 0 && value.length <= 64 * 1024 * 1024)
    .optional(),
});
/** Append one complete acquired page; the caller persists this PDF before requesting more paper. */
export async function appendScannedPage(
  raw: unknown,
): Promise<{ bytes: Uint8Array; pages: number }> {
  const request = scanPdfRequestSchema.parse(raw),
    size = validateRasterImage(request.bytes, "png");
  if (size.width > 8192 || size.height > 8192 || size.width * size.height > 24_000_000)
    throw new Error("Página digitalizada acima dos limites de resolução.");
  const pdf = request.previous
    ? await PDFDocument.load(request.previous)
    : await PDFDocument.create();
  if (pdf.getPageCount() >= 100) throw new Error("A digitalização local atingiu cem páginas.");
  const image = await pdf.embedPng(request.bytes),
    page = pdf.addPage([(size.width * 72) / request.dpi, (size.height * 72) / request.dpi]);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  pdf.setProducer("EdiPDF — digitalização local WIA");
  const bytes = await pdf.save();
  if (bytes.length > 64 * 1024 * 1024)
    throw new Error("O PDF digitalizado excedeu 64 MB. As páginas anteriores foram preservadas.");
  return { bytes, pages: pdf.getPageCount() };
}
