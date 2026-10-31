/**
 * Reference images a person attaches to a chat message. They reach the engine the way each client
 * takes them: Claude Code as image blocks of the message on standard input (stream-json), Codex as
 * files given with `--image`. They are never put in a command line as data, and the bytes must be
 * the image their type says.
 */

export const TURN_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export type TurnImageType = (typeof TURN_IMAGE_TYPES)[number];

export interface TurnImage {
  mediaType: TurnImageType;
  data: Uint8Array;
}

/** At most this many images per message. */
export const TURN_IMAGE_LIMIT = 4;
/** Bytes of one image: its base64 stays within the 5 MB the engines accept. */
export const TURN_IMAGE_BYTES = 3_750_000;

const startsWith = (data: Uint8Array, bytes: readonly number[], at = 0): boolean =>
  bytes.every((byte, index) => data[at + index] === byte);

/** The type the bytes really have, or undefined when they are none of the accepted images. */
export function sniffImageType(data: Uint8Array): TurnImageType | undefined {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(data, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(data, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8))
    return "image/webp";
  return undefined;
}

/** The images of a message, checked; throws a message for the person otherwise. */
export function checkTurnImages(images: readonly TurnImage[] | undefined): readonly TurnImage[] {
  if (!images?.length) return [];
  if (images.length > TURN_IMAGE_LIMIT)
    throw new Error(`Anexe no máximo ${TURN_IMAGE_LIMIT} imagens por mensagem.`);
  for (const image of images) {
    if (!(image.data instanceof Uint8Array) || !image.data.length)
      throw new Error("Imagem vazia ou inválida.");
    if (image.data.length > TURN_IMAGE_BYTES)
      throw new Error("Imagem grande demais: use até 3,5 MB por imagem.");
    if (sniffImageType(image.data) !== image.mediaType)
      throw new Error("A imagem não é PNG, JPEG, GIF ou WebP válido.");
  }
  return images;
}

/** File extension of an image given to Codex. */
export const imageExtension = (type: TurnImageType): string =>
  ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" })[type];

/** One user message for Claude Code's stream-json input: the images first, then the text. */
export function claudeImageMessage(text: string, images: readonly TurnImage[]): string {
  return `${JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [
        ...images.map((image) => ({
          type: "image",
          source: {
            type: "base64",
            media_type: image.mediaType,
            data: Buffer.from(image.data).toString("base64"),
          },
        })),
        { type: "text", text },
      ],
    },
  })}\n`;
}
