import { identityMatrix, type Motion, multiply } from "@informach/edi-motion";
import { remapVectorEffects } from "@informach/edi-motion/graphics";
import type { SceneNode } from "./sceneTypes";
/** The offset is a coordinate-space translation outside animated TRS. Curves,
 * clamping and every key therefore retain the original motion exactly. */
export function cloneSubtree(source: SceneNode) {
  const copy = structuredClone(source),
    ids = new Map<string, string>();
  function renew(node: SceneNode) {
    const next = `node-${crypto.randomUUID()}`;
    ids.set(node.id, next);
    node.id = next;
    node.children.forEach(renew);
  }
  renew(copy);
  function remap(node: SceneNode) {
    if (node.effects) node.effects = remapVectorEffects(node.effects, (id) => ids.get(id) ?? id);
    node.children.forEach(remap);
  }
  remap(copy);
  copy.name = `${source.name} (cópia)`.slice(0, 120);
  copy.basis = multiply(source.basis ?? identityMatrix(), [1, 0, 0, 1, 20, 20]);
  return { copy, ids };
}
export function cloneMotionTargets(motion: Motion, ids: ReadonlyMap<string, string>) {
  let keys = 0,
    tracks = 0,
    addedKeys = 0,
    addedTracks = 0;
  for (const clip of motion.animations)
    for (const track of clip.tracks) {
      keys += track.keys.length;
      tracks++;
      if (ids.has(track.targetId)) {
        addedKeys += track.keys.length;
        addedTracks++;
      }
    }
  if (keys + addedKeys > 100000 || tracks + addedTracks > 12000)
    throw new Error("A duplicação excede o orçamento de trilhas/chaves.");
  for (const animation of motion.animations) {
    const clones = animation.tracks
      .filter((track) => ids.has(track.targetId))
      .map((track) => {
        const targetId = ids.get(track.targetId);
        if (!targetId) throw new Error("Identidade de duplicação ausente.");
        return {
          ...track,
          id: `track-${crypto.randomUUID()}`,
          targetId,
          keys: track.keys.map((key) => ({
            ...structuredClone(key),
            id: `key-${crypto.randomUUID()}`,
          })),
        };
      });
    animation.tracks.push(...clones);
  }
}
