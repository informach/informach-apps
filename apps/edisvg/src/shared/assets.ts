import { identityTransform } from "@informach/edi-motion";
import {
  type Asset,
  assetIdSchema,
  fontFallbackIdsSchema,
  fontStackIds,
  parseAsset,
  resolveFontStack,
} from "@informach/edi-motion/assets";
import { z } from "zod";
import { libraryFontIdSchema } from "./fontLibrary";
import type { Project } from "./project";
import { flattenScene } from "./scene.js";
import type { Scene, SceneNode } from "./sceneTypes";

const pointSchema = z.strictObject({
  x: z.number().finite().min(-1e6).max(1e6),
  y: z.number().finite().min(-1e6).max(1e6),
});

export const assetCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    type: z.literal("asset"),
    operation: z.literal("set-font"),
    assetId: assetIdSchema.nullable().optional(),
    /** A font of EdiSVG's library in place of assetId: the editor adds it to the catalog first. */
    libraryFontId: libraryFontIdSchema.optional(),
    fontFallbackIds: fontFallbackIdsSchema.optional(),
    targetId: z.string().regex(/^node-[\w-]{1,100}$/),
  }),
  z.strictObject({
    type: z.literal("asset"),
    operation: z.literal("add-library-font"),
    fontId: libraryFontIdSchema,
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
    /** Where the image's center goes, in the scene's coordinates (a drop on the artboard). */
    at: pointSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("asset"),
    operation: z.literal("replace"),
    assetId: assetIdSchema,
    /** The new file, of the same kind; everything that used the old one uses it. */
    value: z.unknown(),
  }),
]);
/**
 * How many places use each asset: image nodes, the font stacks of texts, audio bindings and the
 * project's default fonts, over every artboard. An asset absent from the map is unused.
 */
export function assetUsage(project: Pick<Project, "artboards" | "defaults">) {
  const usage = new Map<string, number>(),
    count = (id: string | null | undefined) => {
      if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
    };
  for (const id of Object.values(project.defaults?.fonts ?? {})) count(id);
  for (const board of project.artboards) {
    for (const binding of board.audio?.bindings ?? []) count(binding.assetId);
    for (const { node } of flattenScene(board.scene)) {
      count(node.assetId);
      for (const id of new Set(fontStackIds(node))) count(id);
    }
  }
  return usage;
}
/** The text's weight, style and family follow its main font (as set-font does). */
function followFont(node: SceneNode, font: { weight: number; italic: boolean; family: string }) {
  node.attrs["font-weight"] = String(font.weight);
  node.attrs["font-style"] = font.italic ? "italic" : "normal";
  node.attrs["font-family"] = font.family;
}
/** Points every reference of `from` to `next` (same kind), keeping the old asset's name. */
function replaceAsset(project: Project, from: Asset, value: unknown) {
  const next = parseAsset(value);
  if (next.kind !== from.kind)
    throw new Error(
      `Substitua por um arquivo do mesmo tipo (${from.kind === "image" ? "imagem PNG" : from.kind === "font" ? "fonte" : "áudio WAV"}).`,
    );
  if (next.id === from.id) throw new Error("É o mesmo arquivo: nada a substituir.");
  const kept = project.assets.find((asset) => asset.id === next.id);
  if (!kept) project.assets.push({ ...next, name: from.name });
  const target = kept ?? next;
  if (project.defaults)
    for (const role of ["heading", "body"] as const)
      if (project.defaults.fonts[role] === from.id) project.defaults.fonts[role] = target.id;
  for (const board of project.artboards) {
    for (const binding of board.audio?.bindings ?? [])
      if (binding.assetId === from.id) binding.assetId = target.id;
    for (const { node } of flattenScene(board.scene)) {
      if (node.assetId === from.id && target.kind === "image") {
        node.assetId = target.id;
        // Same center and width; the height follows the new picture's proportion.
        const [x, y, width, height] = ["x", "y", "width", "height"].map((key) =>
          Number(node.attrs[key]),
        ) as [number, number, number, number];
        if ([x, y, width, height].every(Number.isFinite) && width > 0) {
          const next = (width * target.height) / target.width;
          node.attrs.y = String(y + (height - next) / 2);
          node.attrs.height = String(next);
        }
        const slice = node.imageSlice;
        if (
          slice &&
          (slice.left + slice.right >= target.width || slice.top + slice.bottom >= target.height)
        )
          delete node.imageSlice;
      }
      if (node.fontAssetId === from.id && target.kind === "font") {
        node.fontAssetId = target.id;
        followFont(node, target);
      }
      if (node.fontFallbackIds?.includes(from.id)) {
        const stack = node.fontFallbackIds
          .map((id) => (id === from.id ? target.id : id))
          .filter((id, index, all) => id !== node.fontAssetId && all.indexOf(id) === index);
        if (stack.length) node.fontFallbackIds = stack;
        else delete node.fontFallbackIds;
      }
    }
  }
  project.assets.splice(project.assets.indexOf(from), 1);
}
export function applyAsset(
  project: Project,
  scene: Scene | null,
  command: z.infer<typeof assetCommandSchema>,
): string | undefined {
  if (
    command.operation === "add-library-font" ||
    ("libraryFontId" in command && command.libraryFontId)
  )
    throw new Error("Fonte da biblioteca não resolvida: use edit_document pelo editor.");
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
    if (command.assetId === undefined) throw new Error("set-font requer assetId ou libraryFontId.");
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
      // The family the text names, should the embedded font not load.
      if (entry.node.fontAssetId !== font.id) followFont(entry.node, font);
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
  if (command.operation === "replace") {
    replaceAsset(project, asset, command.value);
    return;
  }
  if (command.operation === "remove") {
    if (project.defaults && Object.values(project.defaults.fonts).includes(asset.id))
      throw new Error(
        "Esta fonte é uma das fontes padrão do projeto. Escolha outra em Fontes do projeto antes de excluí-la.",
      );
    if (assetUsage(project).has(asset.id))
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
    height = asset.height * scale,
    center = command.at ?? { x: x + w / 2, y: y + h / 2 };
  scene.nodes.push({
    id,
    name: asset.name,
    tag: "image",
    assetId: asset.id,
    attrs: {
      x: String(center.x - width / 2),
      y: String(center.y - height / 2),
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
