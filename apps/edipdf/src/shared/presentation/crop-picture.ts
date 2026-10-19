import { PDFDocument } from "pdf-lib";
import type { ImagePixels } from "../engine-contracts.ts";
import type { LocalPdfEngine } from "../local-engine.ts";
import { validateRasterImage } from "../raster-image.ts";

/** Crop the decoded native picture, not an EXIF-rotated DOM image, and discard hidden pixel bytes. */
export async function cropPresentationPicture(
  bytes: Uint8Array,
  format: "png" | "jpg",
  crop: { left: number; top: number; right: number; bottom: number },
  engine: LocalPdfEngine,
  encode: (pixels: ImagePixels) => Promise<Uint8Array<ArrayBuffer>>,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; format: "png" }> {
  const dimensions = validateRasterImage(bytes, format);
  if (
    Object.values(crop).some((value) => !Number.isFinite(value) || value < 0 || value >= 1) ||
    crop.left + crop.right >= 1 ||
    crop.top + crop.bottom >= 1
  )
    throw new Error("Recorte de imagem de apresentação inválido.");
  const x = Math.ceil(crop.left * dimensions.width),
    top = Math.ceil(crop.top * dimensions.height),
    endX = Math.floor((1 - crop.right) * dimensions.width),
    bottom = Math.floor((1 - crop.bottom) * dimensions.height);
  if (endX <= x || bottom <= top) throw new Error("O recorte não conserva nenhum pixel completo.");
  const document = await PDFDocument.create(),
    page = document.addPage([dimensions.width, dimensions.height]),
    image = format === "png" ? await document.embedPng(bytes) : await document.embedJpg(bytes);
  page.drawImage(image, { x: 0, y: 0, width: dimensions.width, height: dimensions.height });
  page.setCropBox(x, dimensions.height - bottom, endX - x, bottom - top);
  const result = engine.visibleImage(new Uint8Array(await document.save()), 0, 0, 1);
  if (!result) throw new Error("A imagem não tem área visível depois do recorte.");
  const output = await encode(result);
  validateRasterImage(output, "png");
  return { bytes: output, format: "png" };
}
