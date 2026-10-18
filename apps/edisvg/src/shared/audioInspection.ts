import type { AudioDocument } from "@informach/edi-motion/audio";
import { z } from "zod";
import { inspectJsonChunk } from "./jsonInspection";

export const audioReadSchema = z.strictObject({
  offset: z.number().int().min(0).max(256).default(0),
  limit: z.number().int().min(1).max(20).default(20),
});
export const audioValueSchema = z.strictObject({
  id: z.string().min(1).max(120),
  offset: z.number().int().min(0).max(4000).default(0),
});
export function inspectAudio(audio: AudioDocument | undefined, raw: unknown) {
  const { offset, limit } = audioReadSchema.parse(raw),
    items = audio?.bindings ?? [];
  return {
    enabled: !!audio,
    total: items.length,
    offset,
    nextOffset: offset + limit < items.length ? offset + limit : null,
    items: items.slice(offset, offset + limit).map(({ id, eventId, assetId, caption }) => ({
      id,
      eventId,
      assetId,
      captionLength: caption.length,
    })),
  };
}
export function inspectAudioValue(audio: AudioDocument | undefined, raw: unknown) {
  const { id, offset } = audioValueSchema.parse(raw),
    item = audio?.bindings.find((binding) => binding.id === id);
  if (!item) throw new Error("Vínculo de áudio ausente.");
  return inspectJsonChunk(id, item, offset);
}
