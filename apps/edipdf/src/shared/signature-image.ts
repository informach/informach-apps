export interface SignatureImageCrop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export const EMPTY_SIGNATURE_CROP: SignatureImageCrop = { left: 0, top: 0, right: 0, bottom: 0 };

/** Unmix a white matte, trim only transparent pixels, then apply the reviewed manual crop. */
export function prepareSignaturePixels(
  image: { width: number; height: number; pixels: Uint8Array | Uint8ClampedArray },
  options: {
    removeWhite: boolean;
    whiteLevel?: number;
    crop?: SignatureImageCrop;
    padding?: number;
  },
): { width: number; height: number; pixels: Uint8ClampedArray; left: number; top: number } {
  const { width, height } = image;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 16000000 ||
    image.pixels.length !== width * height * 4
  )
    throw new Error("A assinatura deve ter até 16 megapixels e 8192 pixels por lado.");
  const whiteLevel = options.whiteLevel ?? 245,
    padding = options.padding ?? 6,
    crop = options.crop ?? EMPTY_SIGNATURE_CROP;
  if (
    !Number.isInteger(whiteLevel) ||
    whiteLevel < 150 ||
    whiteLevel > 255 ||
    !Number.isInteger(padding) ||
    padding < 0 ||
    padding > 100
  )
    throw new Error("Ajustes inválidos para a limpeza da assinatura.");
  if (
    ![crop.left, crop.right, crop.top, crop.bottom].every(
      (value) => Number.isFinite(value) && value >= 0 && value < 1,
    ) ||
    crop.left + crop.right >= 1 ||
    crop.top + crop.bottom >= 1
  )
    throw new Error("O recorte precisa conservar uma área da assinatura.");
  const pixels = new Uint8ClampedArray(image.pixels);
  let left = width,
    right = -1,
    top = height,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4,
        alpha = pixels[offset + 3];
      const minimum = Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
      if (!alpha || (options.removeWhite && minimum >= whiteLevel))
        pixels.fill(0, offset, offset + 4);
      else if (options.removeWhite) {
        const opacity = 1 - minimum / 255;
        for (let channel = 0; channel < 3; channel++)
          pixels[offset + channel] = Math.round((pixels[offset + channel] - minimum) / opacity);
        pixels[offset + 3] = Math.round(alpha * opacity);
      }
      if (pixels[offset + 3]) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  if (right < 0)
    throw new Error(
      "A limpeza removeu toda a assinatura. Preserve o fundo ou ajuste o limite de branco.",
    );
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);
  const autoWidth = right - left + 1,
    autoHeight = bottom - top + 1;
  left += Math.round(autoWidth * crop.left);
  right -= Math.round(autoWidth * crop.right);
  top += Math.round(autoHeight * crop.top);
  bottom -= Math.round(autoHeight * crop.bottom);
  const outputWidth = right - left + 1,
    outputHeight = bottom - top + 1;
  if (outputWidth < 1 || outputHeight < 1)
    throw new Error("O recorte não deixa pixels para a assinatura.");
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  let visible = false;
  for (let y = 0; y < outputHeight; y++) {
    const row = pixels.subarray(
      ((top + y) * width + left) * 4,
      ((top + y) * width + right + 1) * 4,
    );
    output.set(row, y * outputWidth * 4);
    for (let offset = 3; offset < row.length; offset += 4) if (row[offset]) visible = true;
  }
  if (!visible) throw new Error("O recorte removeu todos os traços. Ajuste as bordas.");
  return { width: outputWidth, height: outputHeight, pixels: output, left, top };
}
