import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { validateRasterImage } from "./raster-image.ts";

const binary = z.custom<Uint8Array>((value) => value instanceof Uint8Array);
export const rasterPrintRequestSchema = z
  .strictObject({
    pages: z
      .array(
        z.strictObject({
          bytes: binary.refine((bytes) => bytes.length > 0 && bytes.length <= 32 * 1024 * 1024),
          width: z.number().finite().positive().max(14400),
          height: z.number().finite().positive().max(14400),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (request) =>
      request.pages.reduce((sum, page) => sum + page.bytes.length, 0) <= 64 * 1024 * 1024,
    "A impressão como imagens excede 64 MB. Selecione menos páginas.",
  );
export type RasterPrintRequest = z.infer<typeof rasterPrintRequestSchema>;
export const rasterPrintReplySchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    bytes: binary.refine((bytes) => bytes.length > 0 && bytes.length <= 64 * 1024 * 1024),
    pages: z.number().int().min(1).max(100),
  }),
  z.strictObject({ ok: z.literal(false), error: z.string().min(1).max(2000) }),
]);

/** Printed appearance only: no source metadata, hidden objects, fields or searchable text. */
export async function buildRasterPrint(
  raw: unknown,
): Promise<{ bytes: Uint8Array; pages: number }> {
  const request = rasterPrintRequestSchema.parse(raw),
    pdf = await PDFDocument.create();
  let pixels = 0;
  for (const input of request.pages) {
    const size = validateRasterImage(input.bytes, "jpg");
    pixels += size.width * size.height;
    if (
      size.width > 8192 ||
      size.height > 8192 ||
      size.width * size.height > 24_000_000 ||
      pixels > 512_000_000
    )
      throw new Error("A impressão como imagens excede os limites locais de resolução.");
    if (
      Math.abs(size.width - (input.width / 72) * 200) > 2 ||
      Math.abs(size.height - (input.height / 72) * 200) > 2
    )
      throw new Error("A imagem não corresponde à página a 200 dpi.");
    const image = await pdf.embedJpg(input.bytes),
      page = pdf.addPage([input.width, input.height]);
    page.drawImage(image, { x: 0, y: 0, width: input.width, height: input.height });
  }
  pdf.setProducer("EdiPDF — impressão local como imagens");
  const bytes = await pdf.save();
  if (bytes.length > 64 * 1024 * 1024) throw new Error("A cópia de impressão excede 64 MB.");
  return { bytes, pages: request.pages.length };
}
