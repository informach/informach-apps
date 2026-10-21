import { type Motion, objectIdSchema, objectTransformPatchSchema } from "@informach/edi-motion";
import { remapVectorEffects } from "@informach/edi-motion/graphics";
import { z } from "zod";
import { cloneDrawOrders, pruneDrawOrders } from "./drawOrders";
import { assertRigCloneClosure, cloneRigRelationships, type RigRelationships } from "./rigClone";
import { flattenScene } from "./scene.js";
import { cloneMotionTargets, cloneSubtree } from "./sceneClone";
import type { Scene, SceneNode } from "./sceneTypes";
export const sceneBatchSchema = z.strictObject({
  type: z.literal("scene-batch"),
  operation: z.enum(["delete", "duplicate", "front", "back"]),
  targetIds: z.array(objectIdSchema).min(1).max(2000),
});
export type SceneBatchCommand = z.infer<typeof sceneBatchSchema>;
export const sceneTransformsSchema = z.strictObject({
  type: z.literal("scene-transforms"),
  updates: z
    .array(z.strictObject({ targetId: objectIdSchema, transform: objectTransformPatchSchema }))
    .min(1)
    .max(2000),
});
export function applySceneTransforms(scene: Scene, command: z.infer<typeof sceneTransformsSchema>) {
  const entries = new Map(flattenScene(scene).map((entry) => [entry.node.id, entry])),
    ids = new Set<string>();
  for (const update of command.updates) {
    const entry = entries.get(update.targetId);
    if (!entry || ids.has(update.targetId))
      throw new Error("Transformação contém IDs repetidos ou inexistentes.");
    if (entry.locked) throw new Error("Desbloqueie os objetos e seus grupos antes de editar.");
    ids.add(update.targetId);
    Object.assign(entry.node.transform, update.transform);
  }
}
export function selectionRoots(scene: Scene, ids: readonly string[]) {
  const selected = new Set(ids),
    entries = flattenScene(scene),
    byId = new Map(entries.map((entry) => [entry.node.id, entry]));
  return entries.filter((entry) => {
    if (!selected.has(entry.node.id)) return false;
    let parent = entry.parentId;
    while (parent !== null) {
      if (selected.has(parent)) return false;
      parent = byId.get(parent)?.parentId ?? null;
    }
    return true;
  });
}
/** Only touches a transaction-owned draft; all validation runs before publish. */
export function applySceneBatch(
  scene: Scene,
  motion: Motion,
  command: SceneBatchCommand,
  relationships?: RigRelationships,
): string[] {
  const entries = flattenScene(scene),
    selected = new Set(command.targetIds),
    byId = new Map(entries.map((entry) => [entry.node.id, entry]));
  if (selected.size !== command.targetIds.length) throw new Error("Seleção contém IDs repetidos.");
  for (const id of selected) {
    const entry = byId.get(id);
    if (!entry) throw new Error("Seleção contém objetos inexistentes.");
    if (entry.locked) throw new Error("Desbloqueie os objetos e seus grupos antes de editar.");
  }
  const roots = selectionRoots(scene, command.targetIds),
    rootIds = new Set(roots.map(({ node }) => node.id));
  if (command.operation === "duplicate")
    assertRigCloneClosure(
      relationships,
      new Map(
        roots.flatMap(({ node: root }) =>
          flattenScene({ nodes: [root] }).map(({ node }) => [node.id, root.id] as const),
        ),
      ),
    );
  const lists = new Map<string | null, SceneNode[]>([[null, scene.nodes]]);
  for (const { node } of entries) if (node.tag === "g") lists.set(node.id, node.children);
  const changedLists = new Set(
    roots.map((entry) => {
      const list = lists.get(entry.parentId);
      if (!list) throw new Error("Grupo de origem ausente.");
      return list;
    }),
  );
  if (command.operation === "delete") {
    const removed = new Set(
      roots.flatMap(({ node }) => flattenScene({ nodes: [node] }).map(({ node }) => node.id)),
    );
    for (const list of changedLists) {
      const remaining = list.filter((node) => !rootIds.has(node.id));
      list.splice(0, list.length, ...remaining);
    }
    for (const clip of motion.animations)
      clip.tracks = clip.tracks.filter((track) => !removed.has(track.targetId));
    pruneDrawOrders(motion, removed);
    return [];
  }
  if (command.operation === "duplicate") {
    const mapping = new Map<string, string>(),
      copiedNodes: SceneNode[] = [],
      copies: string[] = [];
    for (const list of changedLists) {
      const next: SceneNode[] = [];
      for (const node of list) {
        next.push(node);
        if (rootIds.has(node.id)) {
          const { copy, ids } = cloneSubtree(node);
          next.push(copy);
          copiedNodes.push(copy);
          copies.push(copy.id);
          for (const [source, target] of ids) mapping.set(source, target);
        }
      }
      list.splice(0, list.length, ...next);
    }
    for (const { node } of flattenScene({ nodes: copiedNodes }))
      if (node.effects)
        node.effects = remapVectorEffects(node.effects, (id) => mapping.get(id) ?? id);
    cloneMotionTargets(motion, mapping);
    cloneDrawOrders(motion, mapping);
    cloneRigRelationships(relationships, mapping);
    return copies;
  }
  for (const list of changedLists) {
    const rest = list.filter((node) => !rootIds.has(node.id)),
      block = list.filter((node) => rootIds.has(node.id));
    list.splice(
      0,
      list.length,
      ...(command.operation === "front" ? [...rest, ...block] : [...block, ...rest]),
    );
  }
  return roots.map(({ node }) => node.id);
}
