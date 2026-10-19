import type { Asset } from "@informach/edi-motion/assets";
import { assetIdSchema } from "@informach/edi-motion/assets";
import { z } from "zod";
import { inspectJsonChunk } from "./jsonInspection";
export const assetReadSchema = z.strictObject({
  offset: z.number().int().min(0).max(256).default(0),
  limit: z.number().int().min(1).max(20).default(20),
});
export const assetNoticeSchema = z.strictObject({
  id: assetIdSchema,
  field: z.enum(["notice", "licenseNotice"]),
  offset: z.number().int().min(0).max(32000).default(0),
});
export function inspectAssetNotice(assets: Asset[], raw: unknown) {
  const request = assetNoticeSchema.parse(raw),
    font = assets.find((asset) => asset.id === request.id);
  if (font?.kind !== "font") throw new Error("Fonte não encontrada.");
  return {
    ...inspectJsonChunk(font.id, font[request.field], request.offset),
    field: request.field,
  };
}
export function inspectAssets(assets: Asset[], raw: unknown) {
  const { offset, limit } = assetReadSchema.parse(raw);
  return {
    total: assets.length,
    offset,
    nextOffset: offset + limit < assets.length ? offset + limit : null,
    items: assets.slice(offset, offset + limit).map((asset) => {
      const { data: _data, ...metadata } = asset;
      if (metadata.kind !== "font") return metadata;
      const { notice, licenseNotice, ...summary } = metadata;
      return { ...summary, noticeLength: notice.length, licenseNoticeLength: licenseNotice.length };
    }),
  };
}
