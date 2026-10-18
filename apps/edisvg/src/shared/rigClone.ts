import { constraintOwners, type RigDocument, rigCost } from "@informach/edi-motion/rig";
import type { Artboard } from "./project";

export type RigRelationships = Pick<Artboard, "rig" | "behavior">;

/** References sharing one cloned subtree receive the same world translation,
 * even beneath animated/reflected/skewed parents. This is not a rest-pose
 * recapture: existing inverse-bind products remain unchanged. */
export function assertRigCloneClosure(
  relationships: RigRelationships | undefined,
  rootByObject: ReadonlyMap<string, string>,
) {
  const rig = relationships?.rig;
  if (!rig) return;
  function closed(ids: readonly string[]) {
    const first = ids[0],
      root = first ? rootByObject.get(first) : undefined;
    if (!root || ids.some((id) => rootByObject.get(id) !== root))
      throw new Error(
        "A cópia parcial não conserva as referências de skin/restrição. Duplique um grupo que contenha todo o subrig, ou a prancheta.",
      );
  }
  for (const constraint of rig.constraints)
    if (constraintOwners(constraint).some((id) => rootByObject.has(id)))
      closed([...constraintOwners(constraint), constraint.targetId]);
  for (const skin of rig.skins ?? [])
    if (rootByObject.has(skin.targetId))
      closed([skin.targetId, ...skin.bones.map((bone) => bone.targetId)]);
  for (const solo of rig.solos ?? []) {
    if (rootByObject.has(solo.targetId)) closed([solo.targetId, ...solo.children]);
    else if (solo.children.some((id) => rootByObject.has(id)))
      throw new Error(
        "Duplicar só um filho altera os índices do solo e seus canais. Duplique o grupo solo completo ou a prancheta.",
      );
  }
}

/** Called only on the transaction draft, after subtree IDs are allocated.
 * Control IDs and numeric channels are local to the artboard's existing clock;
 * inputs/data remain shared in that artboard, not fabricated independent state. */
export function cloneRigRelationships(
  relationships: RigRelationships | undefined,
  mapping: ReadonlyMap<string, string>,
) {
  if (!relationships) return;
  const rig = relationships.rig,
    controlIds = new Map<string, string>();
  function object(id: string) {
    const copy = mapping.get(id);
    if (!copy) throw new Error("Referência de rig não mapeada na cópia.");
    return copy;
  }
  function control(
    id: string,
    prefix: "constraint" | "skin" | "morph" | "solo" | "trim" | "joystick",
  ) {
    const copy = `${prefix}-${crypto.randomUUID()}`;
    controlIds.set(id, copy);
    return copy;
  }
  if (rig) {
    const selected: RigDocument = {
        version: rig.version,
        bones: rig.bones.filter((bone) => mapping.has(bone.targetId)),
        targets: rig.targets.filter((id) => mapping.has(id)),
        constraints: rig.constraints.filter((constraint) =>
          constraintOwners(constraint).some((id) => mapping.has(id)),
        ),
        skins: (rig.skins ?? []).filter((skin) => mapping.has(skin.targetId)),
        morphs: (rig.morphs ?? []).filter((morph) => mapping.has(morph.targetId)),
        solos: (rig.solos ?? []).filter((solo) => mapping.has(solo.targetId)),
        trims: (rig.trims ?? []).filter((trim) => mapping.has(trim.targetId)),
        joysticks: (rig.joysticks ?? []).filter((joystick) => mapping.has(joystick.targetId)),
      },
      existing = rigCost(rig),
      extra = rigCost(selected);
    if (
      existing.deformers + extra.deformers > 256 ||
      existing.vertices + extra.vertices > 100000 ||
      existing.controls + extra.controls > 100000 ||
      rig.bones.length + selected.bones.length > 256 ||
      rig.constraints.length + selected.constraints.length > 256 ||
      rig.targets.length + selected.targets.length > 256 ||
      (rig.joysticks?.length ?? 0) + (selected.joysticks?.length ?? 0) > 256
    )
      throw new Error("A cópia excede orçamento agregado do rig.");
    for (const constraint of selected.constraints) {
      const copy = structuredClone(constraint);
      copy.id = control(copy.id, "constraint");
      copy.targetId = object(copy.targetId);
      if (copy.kind === "ik") copy.chain = copy.chain.map(object);
      else copy.ownerId = object(copy.ownerId);
      rig.constraints.push(copy);
    }
    rig.bones.push(...selected.bones.map((bone) => ({ ...bone, targetId: object(bone.targetId) })));
    rig.targets.push(...selected.targets.map(object));
    for (const skin of selected.skins ?? []) {
      const copy = structuredClone(skin);
      copy.id = control(copy.id, "skin");
      copy.targetId = object(copy.targetId);
      for (const bone of copy.bones) bone.targetId = object(bone.targetId);
      for (const weights of copy.weights)
        for (const influence of weights) influence.boneId = object(influence.boneId);
      rig.skins ??= [];
      rig.skins.push(copy);
    }
    for (const morph of selected.morphs ?? []) {
      rig.morphs ??= [];
      rig.morphs.push({
        ...structuredClone(morph),
        id: control(morph.id, "morph"),
        targetId: object(morph.targetId),
      });
    }
    for (const solo of selected.solos ?? []) {
      rig.solos ??= [];
      rig.solos.push({
        ...structuredClone(solo),
        id: control(solo.id, "solo"),
        targetId: object(solo.targetId),
        children: solo.children.map(object),
      });
    }
    for (const trim of selected.trims ?? []) {
      rig.trims ??= [];
      rig.trims.push({
        ...trim,
        id: control(trim.id, "trim"),
        targetId: object(trim.targetId),
      });
    }
    for (const joystick of selected.joysticks ?? []) {
      rig.joysticks ??= [];
      rig.joysticks.push({
        ...joystick,
        id: control(joystick.id, "joystick"),
        targetId: object(joystick.targetId),
      });
    }
    const addedTracks = (rig.parameterClips ?? []).flatMap((clip) =>
      clip.tracks.filter((track) => controlIds.has(track.targetId)),
    );
    if (
      existing.tracks + addedTracks.length > 12000 ||
      existing.keys + addedTracks.reduce((sum, track) => sum + track.keys.length, 0) > 100000
    )
      throw new Error("A cópia excede orçamento de canais/chaves de rig.");
    for (const clip of rig.parameterClips ?? []) {
      const copies = clip.tracks
        .filter((track) => controlIds.has(track.targetId))
        .map((track) => {
          const targetId = controlIds.get(track.targetId);
          if (!targetId) throw new Error("Destino de canal não mapeado na cópia.");
          return {
            ...structuredClone(track),
            id: `track-${crypto.randomUUID()}`,
            targetId,
            keys: track.keys.map((key) => ({
              ...structuredClone(key),
              id: `key-${crypto.randomUUID()}`,
            })),
          };
        });
      clip.tracks.push(...copies);
    }
  }
  const behavior = relationships.behavior;
  if (behavior) {
    const bindingPlan = behavior.bindings.flatMap((binding) => {
      const targetId =
        binding.kind === "parameter"
          ? controlIds.get(binding.targetId)
          : mapping.get(binding.targetId);
      return targetId ? [{ source: binding, targetId }] : [];
    });
    const listenerPlan = behavior.listeners.flatMap((listener) => {
      const targetId = listener.targetId !== null ? mapping.get(listener.targetId) : undefined;
      return targetId ? [{ source: listener, targetId }] : [];
    });
    if (
      behavior.bindings.length + bindingPlan.length > 1000 ||
      behavior.listeners.length + listenerPlan.length > 1000
    )
      throw new Error("A cópia excede orçamento de bindings/listeners.");
    behavior.bindings.push(
      ...bindingPlan.map(({ source, targetId }) => ({
        ...structuredClone(source),
        id: `binding-${crypto.randomUUID()}`,
        targetId,
      })),
    );
    behavior.listeners.push(
      ...listenerPlan.map(({ source, targetId }) => ({
        ...structuredClone(source),
        id: `listener-${crypto.randomUUID()}`,
        targetId,
      })),
    );
    for (const machine of behavior.machines)
      for (const layer of machine.layers)
        layer.targetIds.push(
          ...layer.targetIds.flatMap((id) => {
            const target = mapping.get(id);
            return target ? [target] : [];
          }),
        );
  }
}
