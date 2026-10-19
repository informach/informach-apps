import { prepareSignaturePixels, type SignatureImageCrop } from "@shared/signature-image";

/** Prepare the exact PNG shown for review and later embedded; original imported bytes stay untouched. */
export async function prepareSignatureRaster(
  source: string,
  options: { removeWhite: boolean; whiteLevel: number; crop: SignatureImageCrop },
  signal: AbortSignal,
): Promise<{ src: string; width: number; height: number }> {
  signal.throwIfAborted();
  const image = new Image();
  image.src = source;
  await image.decode();
  signal.throwIfAborted();
  const width = image.naturalWidth,
    height = image.naturalHeight;
  if (width > 8192 || height > 8192 || width * height > 16_000_000)
    throw new Error("A assinatura deve ter até 16 megapixels e 8192 pixels por lado.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("O dispositivo não disponibilizou a preparação da assinatura.");
  context.drawImage(image, 0, 0);
  const prepared = prepareSignaturePixels(
    { width, height, pixels: context.getImageData(0, 0, width, height).data },
    options,
  );
  signal.throwIfAborted();
  canvas.width = prepared.width;
  canvas.height = prepared.height;
  const output = context.createImageData(prepared.width, prepared.height);
  output.data.set(prepared.pixels);
  context.putImageData(output, 0, 0);
  return { src: canvas.toDataURL("image/png"), width: prepared.width, height: prepared.height };
}
