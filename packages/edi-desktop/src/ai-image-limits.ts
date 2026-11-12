/**
 * What a chat message's reference images may be, shared by the main process (ai-images.ts, which
 * checks them) and the panels (ai-attachments.ts, which read them). No Node here: panels import it.
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
