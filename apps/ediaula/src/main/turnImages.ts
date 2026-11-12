import { checkTurnImages, type TurnImage } from "@informach/edi-desktop/ai-clients";

/**
 * The reference images of a chat message, as the panel sends them ({mediaType, data}): checked
 * as the suite's engines take them (at most four, PNG, JPEG, GIF or WebP whose bytes are what
 * their type says, 3.5 MB each). Throws a message for the person otherwise.
 */
export function panelImages(raw: unknown): readonly TurnImage[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error("Imagens inválidas.");
  return checkTurnImages(
    raw.map((image: unknown) => {
      const { mediaType, data } = (image ?? {}) as { mediaType?: unknown; data?: unknown };
      if (typeof mediaType !== "string" || !(data instanceof Uint8Array))
        throw new Error("Imagens inválidas.");
      return { mediaType, data: new Uint8Array(data) } as TurnImage;
    }),
  );
}

/** The images and the text of a message for the Anthropic API: the images first, as the engines do. */
export function apiContent(
  text: string,
  images: readonly TurnImage[],
): string | ({ type: "text"; text: string } | ApiImageBlock)[] {
  if (!images.length) return text;
  return [
    ...images.map(
      (image): ApiImageBlock => ({
        type: "image",
        source: {
          type: "base64",
          media_type: image.mediaType,
          data: Buffer.from(image.data).toString("base64"),
        },
      }),
    ),
    { type: "text", text },
  ];
}

interface ApiImageBlock {
  type: "image";
  source: { type: "base64"; media_type: TurnImage["mediaType"]; data: string };
}
