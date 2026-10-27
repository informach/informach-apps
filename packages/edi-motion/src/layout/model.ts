import { z } from "zod";
import { objectIdSchema } from "../model";

const length = z.number().min(0).max(100000),
  inset = z.number().min(-100000).max(100000);
export const layoutSizeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("fixed"), value: length }),
  z.strictObject({ kind: z.literal("hug") }),
  z.strictObject({ kind: z.literal("fill"), weight: z.number().min(0.001).max(1000) }),
  z.strictObject({ kind: z.literal("percent"), value: z.number().min(0).max(1) }),
]);
export type LayoutSize = z.infer<typeof layoutSizeSchema>;
export const scrollSettingsSchema = z.strictObject({
  axis: z.enum(["x", "y", "both"]),
  friction: z.number().min(1).max(30),
  spring: z.number().min(1).max(1000),
  damping: z.number().min(1).max(100),
  bounce: z.boolean(),
});
export const layoutContainerSchema = z.strictObject({
  flow: z.enum(["row", "column", "grid"]),
  direction: z.enum(["ltr", "rtl"]),
  wrap: z.boolean(),
  padding: z.tuple([length, length, length, length]),
  gap: z.tuple([length, length]),
  justify: z.enum(["start", "center", "end", "space-between", "space-around", "space-evenly"]),
  align: z.enum(["start", "center", "end", "stretch"]),
  columns: z
    .union([
      z.strictObject({ kind: z.literal("fixed"), count: z.number().int().min(1).max(24) }),
      z.strictObject({ kind: z.literal("auto-fit"), minWidth: z.number().min(0.1).max(100000) }),
    ])
    .optional(),
  clip: z.boolean(),
  scroll: scrollSettingsSchema.nullable(),
});
export type LayoutContainer = z.infer<typeof layoutContainerSchema>;
export const layoutItemSchema = z.strictObject({
  targetId: objectIdSchema,
  width: layoutSizeSchema,
  height: layoutSizeSchema,
  minWidth: length,
  maxWidth: length,
  minHeight: length,
  maxHeight: length,
  margin: z.tuple([length, length, length, length]),
  alignSelf: z.enum(["auto", "start", "center", "end", "stretch"]),
  aspectRatio: z.number().min(0.0001).max(10000).nullable(),
  position: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("flow") }),
    z.strictObject({
      kind: z.literal("absolute"),
      left: inset.nullable(),
      right: inset.nullable(),
      top: inset.nullable(),
      bottom: inset.nullable(),
    }),
  ]),
});
export type LayoutItem = z.infer<typeof layoutItemSchema>;
const rootSizeModeSchema = z.enum(["fixed", "hug", "fill"]);
/** How the artboard itself is sized per axis: its design size (fixed), its
 * laid-out children (hug) or the host viewport (fill). Absent means fill on
 * both axes, the behavior of every layout before the field existed. */
export const layoutRootSizeSchema = z.strictObject({
  width: rootSizeModeSchema,
  height: rootSizeModeSchema,
});
export type LayoutRootSize = z.infer<typeof layoutRootSizeSchema>;
export const layoutSchema = z.strictObject({
  version: z.literal(1),
  root: layoutContainerSchema,
  rootSize: layoutRootSizeSchema.optional(),
  containers: z
    .array(z.strictObject({ targetId: objectIdSchema, config: layoutContainerSchema }))
    .max(2000),
  items: z.array(layoutItemSchema).max(2000),
});
export type LayoutDocument = z.infer<typeof layoutSchema>;
export interface LayoutObject {
  tag: string;
  parentId: string | null;
  isComponent?: boolean;
}
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function defaultLayoutContainer(): LayoutContainer {
  return {
    flow: "row",
    direction: "ltr",
    wrap: false,
    padding: [0, 0, 0, 0],
    gap: [12, 12],
    justify: "start",
    align: "start",
    clip: false,
    scroll: null,
  };
}
export function defaultLayoutItem(targetId: string): LayoutItem {
  return {
    targetId,
    width: { kind: "hug" },
    height: { kind: "hug" },
    minWidth: 0,
    maxWidth: 100000,
    minHeight: 0,
    maxHeight: 100000,
    margin: [0, 0, 0, 0],
    alignSelf: "auto",
    aspectRatio: null,
    position: { kind: "flow" },
  };
}
export function parseLayout(
  input: unknown,
  objects: ReadonlyMap<string, LayoutObject>,
): LayoutDocument {
  if (typeof input === "object" && input !== null) {
    if ("items" in input && Array.isArray(input.items) && input.items.length > 2000)
      throw new Error("Orçamento de layout excedido.");
    if ("containers" in input && Array.isArray(input.containers) && input.containers.length > 2000)
      throw new Error("Orçamento de layout excedido.");
  }
  if (objects.size > 2000) throw new Error("Layout excede o orçamento de objetos.");
  const layout = layoutSchema.parse(input, { jitless: true }),
    containers = new Map(
      layout.containers.map((container) => [container.targetId, container.config]),
    ),
    items = new Map(layout.items.map((item) => [item.targetId, item]));
  if (containers.size !== layout.containers.length || items.size !== layout.items.length)
    throw new Error("Layout possui referências duplicadas.");
  for (const [id, object] of objects) {
    const chain = new Set<string>([id]);
    let parent = object.parentId;
    while (parent !== null) {
      if (chain.has(parent) || chain.size > 32)
        throw new Error("Hierarquia cíclica/profunda no layout.");
      chain.add(parent);
      const ancestor = objects.get(parent);
      if (!ancestor) throw new Error("Pai de layout órfão.");
      parent = ancestor.parentId;
    }
  }
  for (const container of layout.containers) {
    const object = objects.get(container.targetId);
    if (object?.tag !== "g" || object.isComponent)
      throw new Error("Contêiner de layout requer grupo editável, não instância de componente.");
    if (object.parentId !== null && !containers.has(object.parentId))
      throw new Error("Ative layout nos grupos ancestrais antes deste contêiner.");
  }
  for (const config of [layout.root, ...containers.values()]) {
    if ((config.flow === "grid") !== (config.columns !== undefined))
      throw new Error("Grade uniforme requer colunas; outros fluxos não usam colunas.");
  }
  for (const item of layout.items) {
    const object = objects.get(item.targetId);
    if (!object || (object.parentId !== null && !containers.has(object.parentId)))
      throw new Error("Item não pertence a um contêiner de layout ativo.");
    if (item.minWidth > item.maxWidth || item.minHeight > item.maxHeight)
      throw new Error("Limites de layout invertidos.");
    if (
      item.position.kind === "absolute" &&
      ((item.position.left !== null &&
        item.position.right !== null &&
        item.width.kind !== "fill") ||
        (item.position.top !== null &&
          item.position.bottom !== null &&
          item.height.kind !== "fill"))
    )
      throw new Error(
        "Duas âncoras opostas exigem preencher o eixo, sem largura/altura contraditória.",
      );
    const own = containers.get(item.targetId);
    if (own?.flow === "grid" && own.columns?.kind === "auto-fit" && item.width.kind === "hug")
      throw new Error("Grade auto-fit precisa de largura definida pelo pai, não hug circular.");
  }
  // Yoga's flex rules are deterministic, but this profile refuses a semantic
  // dependency on a parent that is itself being measured from that child.
  const rootSize = layout.rootSize;
  if (rootSize?.width === "hug" && layout.root.columns?.kind === "auto-fit")
    throw new Error("Grade auto-fit com largura hug é circular.");
  if (rootSize?.width === "hug" || rootSize?.height === "hug")
    for (const [childId, object] of objects) {
      if (object.parentId !== null) continue;
      const child = items.get(childId) ?? defaultLayoutItem(childId);
      if (
        (rootSize.width === "hug" && ["fill", "percent"].includes(child.width.kind)) ||
        (rootSize.height === "hug" && ["fill", "percent"].includes(child.height.kind))
      )
        throw new Error(
          "Hug/fill ou percent cria dependência circular; defina o tamanho da prancheta.",
        );
    }
  for (const [id, container] of containers) {
    const parentStyle = items.get(id) ?? defaultLayoutItem(id);
    if (
      container.flow === "grid" &&
      container.columns?.kind === "auto-fit" &&
      parentStyle.width.kind === "hug"
    )
      throw new Error("Grade auto-fit com largura hug é circular.");
    for (const [childId, object] of objects) {
      if (object.parentId !== id) continue;
      const child = items.get(childId) ?? defaultLayoutItem(childId);
      if (
        (parentStyle.width.kind === "hug" && ["fill", "percent"].includes(child.width.kind)) ||
        (parentStyle.height.kind === "hug" && ["fill", "percent"].includes(child.height.kind))
      )
        throw new Error(
          "Hug/fill ou percent cria dependência circular; defina o tamanho do contêiner.",
        );
    }
  }
  return layout;
}
