import type { Animation, DrawOrder, Motion } from "@informach/edi-motion";
import { flattenScene } from "./scene.js";
import type { Scene } from "./sceneTypes";

/** A draw order stacks direct siblings: every listed object has the scope as parent (the
 * artboard root for `null`), all in one artboard. */
export function validateDrawOrders(
  animations: readonly Pick<Animation, "drawOrders">[],
  boards: readonly { id: string; scene: Scene }[],
) {
  const owners = new Map<string, { boardId: string; parentId: string | null }>();
  for (const board of boards)
    for (const { node, parentId } of flattenScene(board.scene))
      owners.set(node.id, { boardId: board.id, parentId });
  for (const animation of animations) {
    const scopes = new Set<string>();
    for (const drawOrder of animation.drawOrders ?? []) {
      let boardId = drawOrder.scopeId === null ? undefined : owners.get(drawOrder.scopeId)?.boardId;
      for (const key of drawOrder.keys)
        for (const id of key.order) {
          const owner = owners.get(id);
          if (
            !owner ||
            owner.parentId !== drawOrder.scopeId ||
            (boardId !== undefined && owner.boardId !== boardId)
          )
            throw new Error("Ordem de desenho lista um objeto fora do grupo animado.");
          boardId = owner.boardId;
        }
      // One clip may stack the root of several artboards, but each scope only once.
      const scope = JSON.stringify([boardId, drawOrder.scopeId]);
      if (scopes.has(scope)) throw new Error("Há duas ordens de desenho para o mesmo grupo.");
      scopes.add(scope);
    }
  }
}
/** Projects a clip's draw orders onto compiled identities. A draw order belongs to the scope
 * whose objects it lists (validated to be one artboard); others are dropped like their tracks.
 * The artboard root becomes `root` (a component's viewport when flattened). */
export function remapDrawOrders<T extends Pick<Animation, "drawOrders">>(
  clip: T,
  map: (id: string) => string | undefined,
  root: string | null,
): Omit<T, "drawOrders"> & Pick<Animation, "drawOrders"> {
  const { drawOrders, ...rest } = clip;
  const mapped = (drawOrders ?? []).flatMap((drawOrder) => {
    const first = drawOrder.keys[0]?.order[0];
    if (first === undefined || map(first) === undefined) return [];
    const scopeId = drawOrder.scopeId === null ? root : map(drawOrder.scopeId);
    if (scopeId === undefined) throw new Error("Grupo da ordem de desenho fora do escopo.");
    return [
      {
        ...drawOrder,
        scopeId,
        keys: drawOrder.keys.map((key) => ({
          ...key,
          order: key.order.map((id) => {
            const value = map(id);
            if (value === undefined) throw new Error("Ordem de desenho fora do escopo.");
            return value;
          }),
        })),
      },
    ];
  });
  return mapped.length ? { ...rest, drawOrders: mapped } : rest;
}
/** Deleted objects leave every key; a deleted scope drops its draw order; empty keys and
 * draw orders disappear. */
export function pruneDrawOrders(motion: Motion, removed: ReadonlySet<string>) {
  for (const clip of motion.animations) {
    if (!clip.drawOrders) continue;
    const kept = clip.drawOrders
      .filter((drawOrder) => drawOrder.scopeId === null || !removed.has(drawOrder.scopeId))
      .map((drawOrder) => ({
        ...drawOrder,
        keys: drawOrder.keys
          .map((key) => ({ ...key, order: key.order.filter((id) => !removed.has(id)) }))
          .filter((key) => key.order.length),
      }))
      .filter((drawOrder) => drawOrder.keys.length);
    if (kept.length) clip.drawOrders = kept;
    else delete clip.drawOrders;
  }
}
/** Copies follow their sources: a draw order inside the copied objects (its scope copied, or
 * the copied artboard's root when `wholeArtboard`) is cloned onto the copies; in any other
 * draw order each copy is stacked right above its source, as it is placed in the scene. */
export function cloneDrawOrders(
  motion: Motion,
  ids: ReadonlyMap<string, string>,
  wholeArtboard = false,
) {
  const map = (id: string) => {
    const value = ids.get(id);
    if (!value) throw new Error("Identidade de duplicação ausente.");
    return value;
  };
  for (const clip of motion.animations) {
    if (!clip.drawOrders) continue;
    const next: DrawOrder[] = [];
    for (const drawOrder of clip.drawOrders) {
      const first = drawOrder.keys[0]?.order[0],
        inside =
          drawOrder.scopeId === null
            ? wholeArtboard && first !== undefined && ids.has(first)
            : ids.has(drawOrder.scopeId);
      if (!inside) {
        next.push({
          ...drawOrder,
          keys: drawOrder.keys.map((key) => ({
            ...key,
            order: key.order.flatMap((id) => {
              const copy = ids.get(id);
              return copy ? [id, copy] : [id];
            }),
          })),
        });
        continue;
      }
      next.push(drawOrder, {
        id: `order-${crypto.randomUUID()}`,
        scopeId: drawOrder.scopeId === null ? null : map(drawOrder.scopeId),
        keys: drawOrder.keys.map((key) => ({
          id: `key-${crypto.randomUUID()}`,
          frame: key.frame,
          order: key.order.map(map),
        })),
      });
    }
    clip.drawOrders = next;
  }
}
/** Expanded key cost of the draw orders a clip holds for one artboard's objects. */
export function drawOrderKeys(
  clip: Pick<Animation, "drawOrders">,
  objects: { has(id: string): boolean },
) {
  let keys = 0;
  for (const drawOrder of clip.drawOrders ?? []) {
    const first = drawOrder.keys[0]?.order[0];
    if (first !== undefined && objects.has(first))
      for (const key of drawOrder.keys) keys += 1 + key.order.length;
  }
  return keys;
}
/** Listed in, or the scope of, any draw order: moving it across parents would change what
 * that animated stacking means. */
export function drawOrderReferences(motion: Motion) {
  return new Set(
    motion.animations.flatMap((clip) =>
      (clip.drawOrders ?? []).flatMap((drawOrder) => [
        ...(drawOrder.scopeId === null ? [] : [drawOrder.scopeId]),
        ...drawOrder.keys.flatMap((key) => key.order),
      ]),
    ),
  );
}
