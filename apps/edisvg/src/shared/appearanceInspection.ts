import { z } from "zod";
import { inspectJsonChunk } from "./jsonInspection";
import type { Scene } from "./sceneTypes";
export const appearanceReadSchema = z.strictObject({
  collection: z.enum(["palette", "styles"]),
  offset: z.number().int().min(0).max(100).default(0),
  limit: z.number().int().min(1).max(20).default(20),
});
export const appearanceValueSchema = appearanceReadSchema
  .omit({ offset: true, limit: true })
  .extend({
    id: z.string().min(1).max(120),
    offset: z.number().int().min(0).max(20000).default(0),
  });
export function inspectAppearance(scene: Scene, raw: unknown) {
  const request = appearanceReadSchema.parse(raw),
    items =
      request.collection === "palette"
        ? (scene.palette ?? []).map((color) => ({ id: color }))
        : (scene.styles ?? []).map((style) => ({
            id: style.id,
            name: style.name,
            attributes: Object.keys(style.attrs),
            gradients: Object.keys(style.gradients ?? {}),
          }));
  return {
    collection: request.collection,
    total: items.length,
    offset: request.offset,
    nextOffset:
      request.offset + request.limit < items.length ? request.offset + request.limit : null,
    items: items.slice(request.offset, request.offset + request.limit),
  };
}
export function inspectAppearanceValue(scene: Scene, raw: unknown) {
  const request = appearanceValueSchema.parse(raw),
    value =
      request.collection === "palette"
        ? scene.palette?.find((color) => color === request.id)
        : scene.styles?.find((style) => style.id === request.id);
  if (!value) throw new Error("Cor/estilo ausente na prancheta.");
  return { collection: request.collection, ...inspectJsonChunk(request.id, value, request.offset) };
}
