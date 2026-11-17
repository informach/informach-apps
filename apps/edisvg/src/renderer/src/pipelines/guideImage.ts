import { IMAGE_BYTES, IMAGE_SIDE } from "@informach/edi-desktop/ai-attachments";

/**
 * The style guide picture as the assistant gets it. A guide is usually a tall page (3200 × 6800)
 * with small print: sent whole, the engines would shrink it until nothing is readable. So it goes
 * in horizontal parts, top to bottom, each within what the engines look at without shrinking
 * (IMAGE_SIDE on the longer side and about 1.15 megapixels), and a little over the next one so a
 * line cut at the seam is whole in one of them.
 */

/** Pixels of one part the engines read without shrinking it (Claude: ~1.15 MP, 1568 px). */
export const PART_PIXELS = 1_150_000;
/** Share of a part that repeats at the top of the next. */
const OVERLAP = 0.04;

export interface GuideCut {
  /** How much the picture is shrunk (never enlarged). */
  scale: number;
  /** The parts, in pixels of the picture as it is: full width, from `y`, `height` tall. */
  parts: { y: number; height: number }[];
}

/**
 * How to cut a `width` × `height` guide into at most `most` parts, as sharp as they can be: of 1
 * to `most` parts, the fewest that reach the largest scale.
 */
export function cutGuide(width: number, height: number, most: number): GuideCut {
  if (!(width > 0 && height > 0)) throw new Error("A imagem do guia está vazia.");
  let best = { scale: 0, count: 1 };
  for (let count = 1; count <= Math.max(1, most); count++) {
    const tall = (height / count) * (1 + (count > 1 ? OVERLAP : 0));
    const scale = Math.min(
      1,
      IMAGE_SIDE / width,
      IMAGE_SIDE / tall,
      Math.sqrt(PART_PIXELS / (width * tall)),
    );
    if (scale > best.scale * 1.001) best = { scale, count };
  }
  const strip = height / best.count;
  const over = best.count > 1 ? Math.round(strip * OVERLAP) : 0;
  const parts = Array.from({ length: best.count }, (_, i) => {
    const y = Math.max(0, Math.round(i * strip) - (i ? over : 0));
    const end = Math.min(height, Math.round((i + 1) * strip));
    return { y, height: end - y };
  });
  return { scale: best.scale, parts };
}

const base64 = (bytes: Uint8Array): string => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

export interface GuidePart {
  mediaType: "image/png" | "image/jpeg";
  /** Base64, as the frames of a video go to the assistant. */
  data: string;
  name: string;
}

/** The guide picture in at most `most` parts, ready to attach to the assistant's request. */
export async function guideParts(
  picture: { mediaType: string; bytes: Uint8Array },
  most: number,
): Promise<GuidePart[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(
      new Blob([picture.bytes.slice().buffer], { type: picture.mediaType }),
    );
  } catch {
    throw new Error("Não foi possível ler a imagem do guia de estilo.");
  }
  try {
    const cut = cutGuide(bitmap.width, bitmap.height, most);
    const width = Math.max(1, Math.round(bitmap.width * cut.scale));
    const out: GuidePart[] = [];
    for (const [index, part] of cut.parts.entries()) {
      const height = Math.max(1, Math.round(part.height * cut.scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar o guia de estilo.");
      // A transparent guide reads as on white (JPEG has no transparency either).
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, part.y, bitmap.width, part.height, 0, 0, width, height);
      // PNG keeps the small print sharp; a part too heavy for it goes as a good JPEG.
      let blob = await canvas.convertToBlob({ type: "image/png" });
      if (blob.size > IMAGE_BYTES)
        blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
      if (blob.size > IMAGE_BYTES)
        throw new Error("Uma parte do guia de estilo ficou grande demais para o assistente.");
      out.push({
        mediaType: blob.type === "image/jpeg" ? "image/jpeg" : "image/png",
        data: base64(new Uint8Array(await blob.arrayBuffer())),
        name:
          cut.parts.length > 1
            ? `Guia de estilo, parte ${index + 1} de ${cut.parts.length}`
            : "Guia de estilo",
      });
    }
    return out;
  } finally {
    bitmap.close();
  }
}
