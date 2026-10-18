import { objectIdSchema } from "@informach/edi-motion";
import { type Asset, inspectTextCoverage, resolveFontStack } from "@informach/edi-motion/assets";
import { z } from "zod";
import { flattenScene } from "./scene.js";
import type { Scene } from "./sceneTypes";

export const fontCoverageReadSchema = z.strictObject({ id: objectIdSchema });
export function inspectFontCoverage(scene: Scene, assets: readonly Asset[], raw: unknown) {
  const { id } = fontCoverageReadSchema.parse(raw),
    node = flattenScene(scene).find(({ node }) => node.id === id)?.node;
  if (node?.tag !== "text") throw new Error("Selecione um texto local para inspecionar a fonte.");
  const fonts = resolveFontStack(new Map(assets.map((asset) => [asset.id, asset])), node);
  return {
    id,
    source: fonts.length ? "embedded" : "system",
    fontIds: fonts.map((font) => font.id),
    coverage: fonts.length ? inspectTextCoverage(node.text, fonts) : null,
    note: fonts.length
      ? "Cobertura cmap por cluster; não certifica shaping/ligaturas."
      : "Disponibilidade/cobertura da fonte dependem do sistema do consumidor.",
  };
}
