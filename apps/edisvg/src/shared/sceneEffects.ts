import { parseTransformList } from "@informach/edi-motion";
import {
  createVectorEffectContext,
  type EffectObject,
  evaluateVectorEffects,
  nativeEffectSources,
} from "@informach/edi-motion/graphics";
import { parsePath } from "./pathGeometry.js";
import type { SceneNode } from "./sceneTypes";

export function sceneEffectContext(
  entries: readonly { node: SceneNode; parentId: string | null }[],
) {
  const enabled = entries.some(({ node }) => node.effects !== undefined);
  const objects = new Map<string, EffectObject>();
  const primitives = nativeEffectSources(
    entries.map(({ node }) => node),
    new Map(
      entries.flatMap(({ node }) => (node.effects ? [[node.id, node.effects] as const] : [])),
    ),
  );
  if (enabled)
    for (const { node, parentId } of entries)
      objects.set(node.id, {
        tag: node.tag,
        parentId,
        transform: node.transform,
        ...(node.basis ? { basis: node.basis } : {}),
        attributeMatrix: parseTransformList(node.attrs.transform ?? ""),
        ...(node.effects ? { effects: node.effects } : {}),
        ...(primitives.has(node.id) ? { nativeShape: primitives.get(node.id) } : {}),
        ...(node.tag === "path" && node.attrs.d?.trim()
          ? { geometry: parsePath(node.attrs.d), pathData: node.attrs.d }
          : {}),
      });
  return createVectorEffectContext(objects);
}
export function sceneEffectFrames(
  entries: readonly { node: SceneNode; parentId: string | null }[],
) {
  return evaluateVectorEffects(sceneEffectContext(entries), new Map());
}
