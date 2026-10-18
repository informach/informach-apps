import type { Reencode } from "@shared/compress";

/** Bounded browser/worker codec. Unsupported huge images remain untouched. Codec failures propagate. */
export const canvasReencode: Reencode = async (img, maxSide, quality) => {
  if (img.width * img.height > 32_000_000 || Math.max(img.width, img.height) > 16384) return null;
  let bitmap: ImageBitmap;
  if (img.kind === "jpeg")
    bitmap = await createImageBitmap(
      new Blob([new Uint8Array(img.bytes)], { type: "image/jpeg" }),
      { colorSpaceConversion: "none", premultiplyAlpha: "none" },
    );
  else {
    const { data, width, height, channels } = img;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < width * height; i++, j += channels) {
      const o = i * 4;
      rgba[o] = data[j];
      rgba[o + 1] = data[j + (channels === 3 ? 1 : 0)];
      rgba[o + 2] = data[j + (channels === 3 ? 2 : 0)];
      rgba[o + 3] = 255;
    }
    bitmap = await createImageBitmap(new ImageData(rgba, width, height));
  }
  try {
    const factor = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * factor)),
      height = Math.max(1, Math.round(bitmap.height * factor));
    const canvas = new OffscreenCanvas(width, height),
      context = canvas.getContext("2d");
    if (!context) throw new Error("O codec local de imagens está indisponível.");
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    bitmap.close();
  }
};
