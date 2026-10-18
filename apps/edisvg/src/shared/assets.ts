import { identityTransform } from "@informach/edi-motion";
import {
  assetIdSchema,
  fontFallbackIdsSchema,
  fontStackIds,
  parseAsset,
  resolveFontStack,
} from "@informach/edi-motion/assets";
import { z } from "zod";
import type { Project } from "./project";
import { flattenScene } from "./scene.js";
import type { Scene } from "./sceneTypes";

export const assetCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    type: z.literal("asset"),
    operation: z.literal("set-font"),
    assetId: assetIdSchema.nullable(),
    fontFallbackIds: fontFallbackIdsSchema.optional(),
    targetId: z.string().regex(/^node-[\w-]{1,100}$/),
  }),
  z.strictObject({ type: z.literal("asset"), operation: z.literal("put"), value: z.unknown() }),
  z.strictObject({
    type: z.literal("asset"),
    operation: z.literal("remove"),
    assetId: assetIdSchema,
  }),
  z.strictObject({
    type: z.literal("asset"),
    operation: z.literal("rename"),
    assetId: assetIdSchema,
    name: z.string().trim().min(1).max(120),
  }),
  z.strictObject({
    type: z.literal("asset"),
    operation: z.literal("insert-image"),
    assetId: assetIdSchema,
  }),
]);
export function applyAsset(
  project: Project,
  scene: Scene | null,
  command: z.infer<typeof assetCommandSchema>,
): string | undefined {
  if (command.operation === "put") {
    const asset = parseAsset(command.value),
      existing = project.assets.find((value) => value.id === asset.id);
    if (!existing) project.assets.push(asset);
    return;
  }
  if (command.operation === "set-font") {
    const entry = flattenScene(scene).find(({ node }) => node.id === command.targetId);
    if (entry?.node.tag !== "text") throw new Error("Selecione um texto local.");
    if (entry.locked)
      throw new Error("Desbloqueie o texto e seus grupos antes de alterar a fonte.");
    if (command.assetId === null) {
      if (command.fontFallbackIds?.length) throw new Error("Fallback requer fonte principal.");
      delete entry.node.fontAssetId;
      delete entry.node.fontFallbackIds;
    } else {
      const fallback =
          command.fontFallbackIds ??
          (entry.node.fontAssetId === command.assetId ? entry.node.fontFallbackIds : undefined),
        fonts = resolveFontStack(new Map(project.assets.map((asset) => [asset.id, asset])), {
          fontAssetId: command.assetId,
          ...(fallback?.length ? { fontFallbackIds: fallback } : {}),
        }),
        font = fonts[0];
      if (!font) throw new Error("Recurso de fonte ausente/incompatível.");
      if (entry.node.fontAssetId !== font.id) {
        entry.node.attrs["font-weight"] = String(font.weight);
        entry.node.attrs["font-style"] = font.italic ? "italic" : "normal";
      }
      entry.node.fontAssetId = font.id;
      if (fallback?.length) entry.node.fontFallbackIds = [...fallback];
      else delete entry.node.fontFallbackIds;
    }
    return entry.node.id;
  }
  const asset = project.assets.find((value) => value.id === command.assetId);
  if (!asset) throw new Error("Recurso não encontrado. Inspecione novamente o catálogo.");
  if (command.operation === "rename") {
    asset.name = command.name;
    return;
  }
  if (command.operation === "remove") {
    if (
      project.artboards.some(
        (board) =>
          board.audio?.bindings.some((binding) => binding.assetId === asset.id) ||
          flattenScene(board.scene).some(
            ({ node }) => node.assetId === asset.id || fontStackIds(node).includes(asset.id),
          ),
      )
    )
      throw new Error(
        "Remova as imagens, referências de texto ou vínculos de áudio que usam este recurso antes de excluí-lo do catálogo.",
      );
    project.assets.splice(project.assets.indexOf(asset), 1);
    return;
  }
  if (!scene || asset.kind !== "image")
    throw new Error("Selecione uma prancheta e um recurso de imagem.");
  const id = `node-${crypto.randomUUID()}`,
    [x, y, w, h] = scene.viewBox,
    scale = Math.min(1, w / asset.width, h / asset.height),
    width = asset.width * scale,
    height = asset.height * scale;
  scene.nodes.push({
    id,
    name: asset.name,
    tag: "image",
    assetId: asset.id,
    attrs: {
      x: String(x + (w - width) / 2),
      y: String(y + (h - height) / 2),
      width: String(width),
      height: String(height),
    },
    text: "",
    children: [],
    transform: identityTransform(),
    visible: true,
    locked: false,
  });
  return id;
}
