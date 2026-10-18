import { type GradientPaints, gradientTags } from "@informach/edi-motion/graphics";
import { z } from "zod";
import { appearanceKeys, appearanceStyleSchema, paletteSchema } from "./appearanceContracts";
import { applySceneAttributes, mergeGradientPaints } from "./paintAttributes";
import { flattenScene } from "./scene.js";
import type { Scene, SceneNode } from "./sceneTypes";
export const appearanceCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    type: z.literal("appearance"),
    operation: z.literal("save-style"),
    style: appearanceStyleSchema,
  }),
  z.strictObject({
    type: z.literal("appearance"),
    operation: z.literal("delete-style"),
    styleId: appearanceStyleSchema.shape.id,
  }),
  z.strictObject({
    type: z.literal("appearance"),
    operation: z.literal("apply-style"),
    styleId: appearanceStyleSchema.shape.id,
    targetIds: z.array(z.string()).min(1).max(2000),
  }),
  z.strictObject({
    type: z.literal("appearance"),
    operation: z.literal("palette"),
    colors: paletteSchema,
  }),
]);
export function applyAppearance(scene: Scene, command: z.infer<typeof appearanceCommandSchema>) {
  if (command.operation === "palette") {
    scene.palette = command.colors;
    return;
  }
  const styles = scene.styles ?? [];
  if (command.operation === "save-style") {
    const index = styles.findIndex((style) => style.id === command.style.id);
    if (index < 0) {
      if (styles.length >= 100) throw new Error("Limite de 100 estilos por prancheta.");
      styles.push(command.style);
    } else styles[index] = command.style;
    scene.styles = styles;
    return;
  }
  const style = styles.find((style) => style.id === command.styleId);
  if (!style) throw new Error("Estilo não encontrado.");
  if (command.operation === "delete-style") {
    scene.styles = styles.filter((item) => item !== style);
    return;
  }
  const entries = new Map(flattenScene(scene).map((entry) => [entry.node.id, entry]));
  if (new Set(command.targetIds).size !== command.targetIds.length)
    throw new Error("Seleção duplicada.");
  const nodes = command.targetIds.map((id) => {
    const entry = entries.get(id);
    if (!entry || entry.locked) throw new Error("Objeto ausente ou bloqueado.");
    if (entry.node.tag === "image")
      throw new Error("Imagem não aceita estilo vetorial de pintura.");
    if (style.gradients && !gradientTags.has(entry.node.tag))
      throw new Error("Estilo com gradiente requer forma, grupo ou texto.");
    return entry.node;
  });
  for (const node of nodes) {
    applySceneAttributes(node, style.attrs);
    const gradients = { ...node.gradients };
    Object.assign(gradients, structuredClone(style.gradients ?? {}));
    if (gradients.fill || gradients.stroke) node.gradients = gradients;
    else delete node.gradients;
  }
}
/** Presentation inheritance only, never computed CSS from editor chrome. */
export function inheritedAppearance(scene: Scene, target: SceneNode) {
  return createAppearanceResolver(scene)(target);
}
/** One index/cache for bulk readers, scoped to an immutable scene snapshot. */
export function createAppearanceResolver(scene: Scene) {
  return createPaintResolver(scene).appearance;
}
export function createPaintResolver(scene: Scene) {
  const entries = new Map(flattenScene(scene).map((entry) => [entry.node.id, entry])),
    memo = new Map<string, Readonly<Record<string, string>>>(),
    gradients = new Map<string, GradientPaints>();
  function resolve(id: string, depth = 0): Readonly<Record<string, string>> {
    if (depth > 32) throw new Error("Herança de aparência cíclica/profunda.");
    const cached = memo.get(id);
    if (cached) return cached;
    const entry = entries.get(id);
    if (!entry) throw new Error("Objeto de aparência ausente da cena.");
    const values: Record<string, string> = {
      ...(entry.parentId
        ? resolve(entry.parentId, depth + 1)
        : { fill: "#000000", stroke: "none", "stroke-width": "1" }),
    };
    for (const key of appearanceKeys)
      if (entry.node.attrs[key] !== undefined && entry.node.attrs[key] !== "inherit")
        values[key] = entry.node.attrs[key];
    const value = Object.freeze(values);
    memo.set(id, value);
    return value;
  }
  function resolveGradients(id: string, depth = 0): GradientPaints {
    if (depth > 32) throw new Error("Herança de gradientes cíclica/profunda.");
    const retained = gradients.get(id);
    if (retained) return retained;
    const entry = entries.get(id);
    if (!entry) throw new Error("Objeto de gradiente ausente da cena.");
    const value = mergeGradientPaints(
      entry.parentId ? resolveGradients(entry.parentId, depth + 1) : {},
      entry.node,
    );
    gradients.set(id, value);
    return value;
  }
  return {
    appearance: (target: SceneNode) => ({ ...resolve(target.id) }),
    gradients: (target: SceneNode) => ({ ...resolveGradients(target.id) }),
  };
}
export function inheritedGradients(scene: Scene, target: SceneNode) {
  return createPaintResolver(scene).gradients(target);
}
