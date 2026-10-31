/**
 * Reference images of the assistant panel. The main process checks them again
 * (@informach/edi-desktop/ai-clients checkTurnImages); here they are only read, shrunk to what the
 * engines look at and shown.
 */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
/** Images per message, and bytes per image, as the main process accepts them. */
export const IMAGE_LIMIT = 4;
export const IMAGE_BYTES = 3_750_000;
/** The engines scale larger images down to this side anyway: sending more only costs. */
export const IMAGE_SIDE = 1568;

export interface Attachment {
  mediaType: ImageType;
  data: Uint8Array;
  /** Object URL of the thumbnail; revoked with revokeAttachments. */
  url: string;
  name: string;
}

const isImageType = (type: string): type is ImageType =>
  (IMAGE_TYPES as readonly string[]).includes(type);

/** The size an image is sent at: its own, or scaled so its longer side is IMAGE_SIDE. */
export function fittedSize(width: number, height: number) {
  const scale = Math.min(1, IMAGE_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: scale < 1,
  };
}

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** A dropped, pasted or chosen file as an attachment; throws a message for the person. */
export async function readAttachment(file: File): Promise<Attachment> {
  if (!isImageType(file.type)) throw new Error("Use imagens PNG, JPEG, GIF ou WebP.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não foi possível ler a imagem.");
  }
  const size = fittedSize(bitmap.width, bitmap.height);
  let blob: Blob = file,
    mediaType: ImageType = file.type;
  if (size.scaled || file.size > IMAGE_BYTES) {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível ler a imagem.");
    const encode = async (type: "image/png" | "image/jpeg") => {
      context.clearRect(0, 0, size.width, size.height);
      // JPEG has no transparency: a white page instead of black.
      if (type === "image/jpeg") {
        context.fillStyle = "#fff";
        context.fillRect(0, 0, size.width, size.height);
      }
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      return canvasBlob(canvas, type, type === "image/jpeg" ? 0.88 : undefined);
    };
    mediaType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    let encoded = await encode(mediaType);
    if (!encoded || encoded.size > IMAGE_BYTES) {
      mediaType = "image/jpeg";
      encoded = await encode(mediaType);
    }
    if (!encoded) throw new Error("Não foi possível ler a imagem.");
    blob = encoded;
  }
  bitmap.close();
  if (blob.size > IMAGE_BYTES) throw new Error("Imagem grande demais: use até 3,5 MB.");
  return {
    mediaType,
    data: new Uint8Array(await blob.arrayBuffer()),
    url: URL.createObjectURL(blob),
    name: file.name || "imagem",
  };
}

/** The image files of a paste or a drop. */
export function imageFiles(list: DataTransfer | null) {
  return [...(list?.files ?? [])].filter((file) => file.type.startsWith("image/"));
}

/**
 * The images that go with a turn: the most recent ones of the conversation sent, so that "make it
 * look more like the reference" still has it. At most IMAGE_LIMIT, in the order they were sent.
 */
export function referenceImages(history: readonly { images?: readonly Attachment[] }[]) {
  return history
    .flatMap((message) => message.images ?? [])
    .slice(-IMAGE_LIMIT)
    .map(({ mediaType, data }) => ({ mediaType, data }));
}

export function revokeAttachments(images: readonly Attachment[]) {
  for (const image of images) URL.revokeObjectURL(image.url);
}
