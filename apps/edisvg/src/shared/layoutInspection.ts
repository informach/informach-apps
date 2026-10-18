import type { LayoutDocument } from "@informach/edi-motion/layout";
import { z } from "zod";
import { inspectJsonChunk } from "./jsonInspection";
export const layoutReadSchema = z.strictObject({
  collection: z.enum(["root", "containers", "items"]),
  offset: z.number().int().min(0).max(2000).default(0),
  limit: z.number().int().min(1).max(20).default(20),
});
export const layoutValueSchema = layoutReadSchema.omit({ offset: true, limit: true }).extend({
  id: z.string().min(1).max(120),
  offset: z.number().int().min(0).max(8000000).default(0),
});
function collection(
  layout: LayoutDocument | undefined,
  kind: z.infer<typeof layoutReadSchema>["collection"],
) {
  if (!layout) return [];
  return kind === "root"
    ? [{ id: "layout-root", value: layout.root }]
    : layout[kind].map((value) => ({ id: value.targetId, value }));
}
export function inspectLayout(layout: LayoutDocument | undefined, raw: unknown) {
  const request = layoutReadSchema.parse(raw),
    items = collection(layout, request.collection);
  return {
    enabled: !!layout,
    collection: request.collection,
    total: items.length,
    offset: request.offset,
    nextOffset:
      request.offset + request.limit < items.length ? request.offset + request.limit : null,
    items: items.slice(request.offset, request.offset + request.limit),
  };
}
export function inspectLayoutValue(layout: LayoutDocument | undefined, raw: unknown) {
  const request = layoutValueSchema.parse(raw),
    item = collection(layout, request.collection).find((value) => value.id === request.id);
  if (!item) throw new Error("Configuração de layout ausente.");
  return inspectJsonChunk(item.id, item.value, request.offset);
}
