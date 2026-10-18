import { z } from "zod";
import { type Asset, assetFontFamily, assetIdSchema, type FontAsset } from "./model";

export const fontFallbackIdsSchema = z
  .array(assetIdSchema)
  .max(7)
  .refine((ids) => new Set(ids).size === ids.length, "Fontes de fallback não podem se repetir.");
export interface FontReference {
  fontAssetId?: string;
  fontFallbackIds?: readonly string[];
}
export function fontStackIds(reference: FontReference): string[] {
  const primary = reference.fontAssetId;
  if (primary === undefined) {
    if (reference.fontFallbackIds !== undefined)
      throw new Error("Fallback incorporado requer uma fonte principal incorporada.");
    return [];
  }
  assetIdSchema.parse(primary);
  const fallback = fontFallbackIdsSchema.parse(reference.fontFallbackIds ?? []);
  if (fallback.includes(primary)) throw new Error("Fonte principal não pode repetir no fallback.");
  return [primary, ...fallback];
}
export function resolveFontStack(
  assets: ReadonlyMap<string, Asset>,
  reference: FontReference,
): FontAsset[] {
  return fontStackIds(reference).map((id) => {
    const font = assets.get(id);
    if (font?.kind !== "font")
      throw new Error("Cadeia de fontes referencia recurso ausente/incompatível.");
    return font;
  });
}
export function fontStackFamily(fonts: readonly Pick<FontAsset, "id">[]): string | undefined {
  return fonts.length ? fonts.map(assetFontFamily).join(", ") : undefined;
}
