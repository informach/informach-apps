import { z } from "zod";
import { inverse } from "../affine";
import { affineSchema as matrix } from "../affineSchema";
import { assertSameTopology, geometryCost, geometrySchema } from "../geometry";
import { type Animation, keyframeSchema, objectIdSchema } from "../model";
import {
  type ParameterContext,
  type ParameterDefinition,
  parameterKey as rigParameterKey,
} from "../parameters";

export { parameterKey as rigParameterKey } from "../parameters";

import { rigCost } from "./cost";
import { validateIkChain } from "./ik";
import { applyJoystickControllers, joystickSchema } from "./joystick";
import { createKinematics, type RigObject } from "./kinematics";

const coordinate = z.number().min(-10000).max(10000),
  positive = z.number().min(0).max(100000),
  strength = z.number().min(0).max(1),
  id = z.string().regex(/^constraint-[\w-]{1,100}$/);
/** Paths, and images whose mesh gives them vertex geometry. */
export function deformable(object: { tag?: string; geometry?: unknown } | undefined) {
  return object?.tag === "path" || (object?.tag === "image" && object.geometry !== undefined);
}
export const skinSchema = z.strictObject({
  id: z.string().regex(/^skin-[\w-]{1,100}$/),
  targetId: objectIdSchema,
  bindMatrix: matrix,
  bones: z
    .array(z.strictObject({ targetId: objectIdSchema, inverseBindMatrix: matrix }))
    .min(1)
    .max(256),
  weights: z
    .array(
      z
        .array(z.strictObject({ boneId: objectIdSchema, weight: z.number().positive().max(1) }))
        .min(1)
        .max(4),
    )
    .min(1)
    .max(4000),
});
export type RigSkin = z.infer<typeof skinSchema>;
export const trimSchema = z.strictObject({
  id: z.string().regex(/^trim-[\w-]{1,100}$/),
  targetId: objectIdSchema,
  start: strength,
  end: strength,
  offset: z.number().min(-36000).max(36000),
  tolerance: z.number().min(0.000001).max(100),
  mode: z.enum(["parallel", "sequential"]),
});
export type RigTrim = z.infer<typeof trimSchema>;
export const rigBoneSchema = z.strictObject({
  targetId: objectIdSchema,
  length: z.number().positive().max(10000),
  minRotation: coordinate,
  maxRotation: coordinate,
});
export const rigConstraintSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id,
    kind: z.literal("path"),
    ownerId: objectIdSchema,
    targetId: objectIdSchema,
    contour: z.number().int().min(0).max(3999),
    progress: strength,
    orient: z.boolean(),
    rotationOffset: coordinate,
    offset: coordinate,
    tolerance: z.number().min(0.000001).max(100),
    strength,
  }),
  z.strictObject({
    id,
    kind: z.literal("ik"),
    chain: z.array(objectIdSchema).min(1).max(8),
    targetId: objectIdSchema,
    strength,
    bend: z.enum(["positive", "negative"]),
    tolerance: z.number().min(0.000001).max(100),
    iterations: z.number().int().min(1).max(128),
  }),
  z.strictObject({
    id,
    kind: z.literal("distance"),
    ownerId: objectIdSchema,
    targetId: objectIdSchema,
    min: positive,
    max: positive,
    strength,
  }),
  z.strictObject({
    id,
    kind: z.literal("transform"),
    ownerId: objectIdSchema,
    targetId: objectIdSchema,
    space: z.enum(["local", "world"]),
    channels: z
      .array(z.enum(["x", "y", "rotation", "sx", "sy", "skewX"]))
      .min(1)
      .max(6),
    offset: z.strictObject({
      x: coordinate,
      y: coordinate,
      rotation: coordinate,
      sx: z.number().min(-20).max(20),
      sy: z.number().min(-20).max(20),
    }),
    strength,
  }),
]);
export const rigParameterTrackSchema = z.strictObject({
  id: z.string().regex(/^track-[\w-]{1,100}$/),
  targetId: z.string().regex(/^(?:constraint|morph|solo|trim|joystick)-[\w-]{1,100}$/),
  property: z.enum([
    "strength",
    "progress",
    "weight",
    "activeIndex",
    "start",
    "end",
    "offset",
    "x",
    "y",
  ]),
  keys: z.array(keyframeSchema).min(1).max(10000),
});
export const rigSchema = z.strictObject({
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  bones: z.array(rigBoneSchema).max(256),
  constraints: z.array(rigConstraintSchema).max(256),
  targets: z.array(objectIdSchema).max(256).default([]),
  skins: z.array(skinSchema).max(256).optional(),
  trims: z.array(trimSchema).max(256).optional(),
  joysticks: z.array(joystickSchema).max(256).optional(),
  morphs: z
    .array(
      z.strictObject({
        id: z.string().regex(/^morph-[\w-]{1,100}$/),
        name: z.string().trim().min(1).max(120),
        targetId: objectIdSchema,
        geometry: geometrySchema,
        weight: strength,
      }),
    )
    .max(256)
    .optional(),
  solos: z
    .array(
      z.strictObject({
        id: z.string().regex(/^solo-[\w-]{1,100}$/),
        targetId: objectIdSchema,
        children: z.array(objectIdSchema).min(1).max(2000),
        activeIndex: z.number().int().min(-1).max(1999),
      }),
    )
    .max(256)
    .optional(),
  parameterClips: z
    .array(
      z.strictObject({
        animationId: z.string().regex(/^[a-z]+-[\w-]{1,100}$/),
        tracks: z.array(rigParameterTrackSchema).max(12000),
      }),
    )
    .max(100)
    .optional(),
});
export type RigDocument = z.infer<typeof rigSchema>;
/** Adding an older feature must never downgrade a rig with newer capabilities. */
export function upgradeRigVersion(
  current: RigDocument["version"],
  required: RigDocument["version"],
): RigDocument["version"] {
  return current >= required ? current : required;
}
export type RigConstraint = z.infer<typeof rigConstraintSchema>;
export type RigParameterProperty = z.infer<typeof rigParameterTrackSchema>["property"];
export interface RigParameterEntry {
  targetId: string;
  property: RigParameterProperty;
  definition: ParameterDefinition;
}
export function rigParameterContext(rig: RigDocument | undefined): ParameterContext {
  if (!rig) return { definitions: new Map(), clips: new Map() };
  return {
    definitions: rigParameterDefinitions(rig),
    clips: new Map(
      (rig.parameterClips ?? []).map((clip) => [
        clip.animationId,
        clip.tracks.map((track) => ({
          key: rigParameterKey([], track.targetId, track.property),
          clockId: null,
          keys: track.keys,
        })),
      ]),
    ),
  };
}
export function rigParameterEntries(rig: RigDocument): RigParameterEntry[] {
  const result: RigParameterEntry[] = rig.constraints.map((constraint) => ({
    targetId: constraint.id,
    property: "strength",
    definition: {
      initial: constraint.strength,
      bounds: [0, 1],
      discrete: false,
      ownerIds: constraintOwners(constraint),
    },
  }));
  for (const constraint of rig.constraints)
    if (constraint.kind === "path")
      result.push({
        targetId: constraint.id,
        property: "progress",
        definition: {
          initial: constraint.progress,
          bounds: [0, 1],
          discrete: false,
          ownerIds: [constraint.ownerId],
        },
      });
  for (const morph of rig.morphs ?? [])
    result.push({
      targetId: morph.id,
      property: "weight",
      definition: {
        initial: morph.weight,
        bounds: [0, 1],
        discrete: false,
        ownerIds: [morph.targetId],
      },
    });
  // Explicit type permits the different discrete range; no fake transform channel.
  const entries = result;
  for (const solo of rig.solos ?? [])
    entries.push({
      targetId: solo.id,
      property: "activeIndex",
      definition: {
        initial: solo.activeIndex,
        bounds: [-1, solo.children.length - 1],
        discrete: true,
        ownerIds: [solo.targetId, ...solo.children],
      },
    });
  for (const trim of rig.trims ?? [])
    for (const property of ["start", "end", "offset"] as const)
      entries.push({
        targetId: trim.id,
        property,
        definition: {
          initial: trim[property],
          bounds: property === "offset" ? [-36000, 36000] : [0, 1],
          discrete: false,
          ownerIds: [trim.targetId],
        },
      });
  for (const joystick of rig.joysticks ?? [])
    for (const property of ["x", "y"] as const)
      entries.push({
        targetId: joystick.id,
        property,
        definition: {
          initial: joystick[property],
          bounds: [-1, 1],
          discrete: false,
          ownerIds: [joystick.targetId],
        },
      });
  return entries;
}
export function rigParameterDefinitions(rig: RigDocument): Map<string, ParameterDefinition> {
  return new Map(
    rigParameterEntries(rig).map((entry) => [
      rigParameterKey([], entry.targetId, entry.property),
      entry.definition,
    ]),
  );
}
export function validateRigAnimations(rig: RigDocument, animations: readonly Animation[]) {
  for (const clip of rig.parameterClips ?? []) {
    const animation = animations.find((animation) => animation.id === clip.animationId);
    if (
      !animation ||
      clip.tracks.some((track) => track.keys.some((key) => key.frame > animation.frames))
    )
      throw new Error("Canal de rig requer animação existente e chaves dentro da duração.");
  }
}

export function constraintOwners(constraint: RigConstraint): readonly string[] {
  return constraint.kind === "ik" ? constraint.chain : [constraint.ownerId];
}
export function rigOwners(rig: RigDocument | undefined): Set<string> {
  return new Set(
    rig
      ? [
          ...rig.bones.map((bone) => bone.targetId),
          ...rig.constraints.flatMap((constraint) => [...constraintOwners(constraint)]),
          ...(rig.morphs ?? []).map((morph) => morph.targetId),
          ...(rig.solos ?? []).map((solo) => solo.targetId),
          ...(rig.skins ?? []).map((skin) => skin.targetId),
          ...(rig.trims ?? []).map((trim) => trim.targetId),
          ...(rig.joysticks ?? []).map((joystick) => joystick.targetId),
        ]
      : [],
  );
}
export function remapRig(rig: RigDocument, map: (id: string) => string): RigDocument {
  const copy = structuredClone(rig);
  copy.targets = copy.targets.map(map);
  for (const bone of copy.bones) bone.targetId = map(bone.targetId);
  for (const constraint of copy.constraints) {
    constraint.targetId = map(constraint.targetId);
    if (constraint.kind === "ik") constraint.chain = constraint.chain.map(map);
    else constraint.ownerId = map(constraint.ownerId);
  }
  for (const morph of copy.morphs ?? []) morph.targetId = map(morph.targetId);
  for (const trim of copy.trims ?? []) trim.targetId = map(trim.targetId);
  for (const joystick of copy.joysticks ?? []) joystick.targetId = map(joystick.targetId);
  for (const solo of copy.solos ?? []) {
    solo.targetId = map(solo.targetId);
    solo.children = solo.children.map(map);
  }
  for (const skin of copy.skins ?? []) {
    skin.targetId = map(skin.targetId);
    for (const bone of skin.bones) bone.targetId = map(bone.targetId);
    for (const weights of skin.weights)
      for (const influence of weights) influence.boneId = map(influence.boneId);
  }
  return copy;
}
/** Validates the graph once; evaluates in dependency order with authored order
 * for multiple writers of the same object. No previous frame is a dependency. */
export function parseRig(input: unknown, objects: ReadonlyMap<string, RigObject>): RigDocument {
  if (
    typeof input === "object" &&
    input !== null &&
    "joysticks" in input &&
    Array.isArray(input.joysticks) &&
    input.joysticks.length > 256
  )
    throw new Error("Orçamento de joysticks excedido.");
  let rawKeys = 0,
    rawTracks = 0;
  if (
    typeof input === "object" &&
    input !== null &&
    "skins" in input &&
    Array.isArray(input.skins)
  ) {
    let vertices = 0;
    if (input.skins.length > 256) throw new Error("Orçamento de malhas excedido.");
    for (const skin of input.skins)
      if (typeof skin === "object" && skin !== null && Array.isArray(skin.weights)) {
        vertices += skin.weights.length;
        if (
          skin.weights.length > 4000 ||
          vertices > 100000 ||
          skin.weights.some((value: unknown) => Array.isArray(value) && value.length > 4)
        )
          throw new Error("Malhas excedem orçamento de vértices/influências.");
      }
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "morphs" in input &&
    Array.isArray(input.morphs)
  ) {
    let vertices = 0;
    if (input.morphs.length > 256) throw new Error("Orçamento de morphs excedido.");
    for (const morph of input.morphs)
      if (typeof morph === "object" && morph !== null && "geometry" in morph) {
        vertices += geometryCost(morph.geometry);
        if (vertices > 100000) throw new Error("Morphs excedem orçamento de geometria.");
      }
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "parameterClips" in input &&
    Array.isArray(input.parameterClips)
  ) {
    if (input.parameterClips.length > 100) throw new Error("Orçamento de clips de rig excedido.");
    for (const clip of input.parameterClips) {
      if (typeof clip !== "object" || clip === null || !Array.isArray(clip.tracks)) continue;
      rawTracks += clip.tracks.length;
      if (rawTracks > 12000) throw new Error("Orçamento de canais de rig excedido.");
      for (const track of clip.tracks) {
        if (typeof track !== "object" || track === null || !Array.isArray(track.keys)) continue;
        rawKeys += track.keys.length;
        if (rawKeys > 100000) throw new Error("Orçamento de chaves de rig excedido.");
      }
    }
  }
  const rig = rigSchema.parse(input, { jitless: true }),
    boneIds = new Set<string>(),
    ids = new Set<string>();
  if (objects.size > 2000) throw new Error("Rig excede o orçamento de objetos.");
  const cost = rigCost(rig);
  if (cost.deformers > 256 || cost.vertices > 100000 || cost.controls > 100000)
    throw new Error("Rig excede orçamento agregado de deformação.");
  if (
    rig.version === 1 &&
    (rig.parameterClips !== undefined ||
      rig.morphs !== undefined ||
      rig.solos !== undefined ||
      rig.skins !== undefined ||
      rig.constraints.some((constraint) => constraint.kind === "path"))
  )
    throw new Error("Canais/deformação/caminho/solo exigem formato v2.");
  const entities = new Set<string>(),
    soloOwners = new Set<string>();
  if (rig.version < 3 && rig.trims !== undefined)
    throw new Error("Trim paths exigem formato de rig v3.");
  if (rig.version < 4 && rig.joysticks !== undefined)
    throw new Error("Joysticks exigem formato de rig v4.");
  const trimOwners = new Set<string>();
  for (const trim of rig.trims ?? []) {
    const object = objects.get(trim.targetId);
    if (
      entities.has(trim.id) ||
      trimOwners.has(trim.targetId) ||
      object?.tag !== "path" ||
      object.isComponent ||
      !object.geometry?.length
    )
      throw new Error("Trim requer ID único e um caminho local por controlador.");
    entities.add(trim.id);
    trimOwners.add(trim.targetId);
  }
  for (const morph of rig.morphs ?? []) {
    const object = objects.get(morph.targetId);
    // A meshed image exposes its grid vertices as geometry, like a path's anchors.
    if (entities.has(morph.id) || !deformable(object) || !object?.geometry)
      throw new Error("Morph requer ID único e geometria de caminho ou malha válida.");
    entities.add(morph.id);
    assertSameTopology(object.geometry, morph.geometry);
  }
  for (const solo of rig.solos ?? []) {
    const object = objects.get(solo.targetId),
      children = [...objects]
        .filter(([, object]) => object.parentId === solo.targetId)
        .map(([id]) => id);
    if (
      entities.has(solo.id) ||
      soloOwners.has(solo.targetId) ||
      object?.tag !== "g" ||
      object.isComponent ||
      solo.activeIndex >= solo.children.length ||
      JSON.stringify(children) !== JSON.stringify(solo.children)
    )
      throw new Error("Solo requer grupo local, filhos diretos na ordem original e índice válido.");
    entities.add(solo.id);
    soloOwners.add(solo.targetId);
  }
  const joystickTargets = new Set<string>(),
    constrainedOwners = new Set(
      rig.constraints.flatMap((constraint) => [...constraintOwners(constraint)]),
    ),
    authoredBones = new Set(rig.bones.map((bone) => bone.targetId));
  for (const joystick of rig.joysticks ?? []) {
    const object = objects.get(joystick.targetId);
    if (
      entities.has(joystick.id) ||
      joystickTargets.has(joystick.targetId) ||
      !rig.targets.includes(joystick.targetId) ||
      object?.tag !== "g" ||
      object.parentId !== null ||
      object.isComponent ||
      authoredBones.has(joystick.targetId) ||
      constrainedOwners.has(joystick.targetId)
    )
      throw new Error(
        "Joystick requer ID único e um alvo raiz local exclusivo, sem osso/constraint escrevendo sua posição.",
      );
    entities.add(joystick.id);
    joystickTargets.add(joystick.targetId);
  }
  const definitions = rigParameterDefinitions(rig),
    clipIds = new Set<string>(),
    channelIds = new Set<string>();
  for (const clip of rig.parameterClips ?? []) {
    if (clipIds.has(clip.animationId)) throw new Error("Clip de rig duplicado.");
    clipIds.add(clip.animationId);
    const channels = new Set<string>();
    for (const track of clip.tracks) {
      const key = rigParameterKey([], track.targetId, track.property),
        definition = definitions.get(key);
      if (!definition || channels.has(key) || channelIds.has(track.id))
        throw new Error("Canal de rig duplicado ou órfão.");
      channels.add(key);
      channelIds.add(track.id);
      let previousFrame = -1;
      for (const keyframe of track.keys) {
        if (
          channelIds.has(keyframe.id) ||
          keyframe.frame <= previousFrame ||
          keyframe.value < definition.bounds[0] ||
          keyframe.value > definition.bounds[1] ||
          (definition.discrete && (!Number.isInteger(keyframe.value) || keyframe.easing !== "hold"))
        )
          throw new Error("Chaves de parâmetro duplicadas, desordenadas ou fora dos limites.");
        channelIds.add(keyframe.id);
        previousFrame = keyframe.frame;
      }
    }
  }
  if (
    new Set(rig.targets).size !== rig.targets.length ||
    rig.targets.some((id) => objects.get(id)?.tag !== "g" || objects.get(id)?.isComponent)
  )
    throw new Error("Alvos requerem grupos únicos e válidos.");
  for (const bone of rig.bones) {
    const object = objects.get(bone.targetId);
    if (
      object?.tag !== "g" ||
      object.isComponent ||
      boneIds.has(bone.targetId) ||
      bone.minRotation > bone.maxRotation
    )
      throw new Error("Osso requer grupo único e limites válidos.");
    boneIds.add(bone.targetId);
  }
  const skinOwners = new Set<string>();
  for (const skin of rig.skins ?? []) {
    const object = objects.get(skin.targetId),
      count = object?.geometry?.reduce((sum, contour) => sum + contour.points.length, 0),
      bones = new Set(skin.bones.map((bone) => bone.targetId));
    if (
      entities.has(skin.id) ||
      skinOwners.has(skin.targetId) ||
      !deformable(object) ||
      !count ||
      count !== skin.weights.length ||
      bones.size !== skin.bones.length
    )
      throw new Error("Malha requer caminho único e pesos correspondentes à topologia.");
    entities.add(skin.id);
    skinOwners.add(skin.targetId);
    inverse(skin.bindMatrix);
    for (const bone of skin.bones) {
      if (!boneIds.has(bone.targetId)) throw new Error("Osso da malha ausente.");
      inverse(bone.inverseBindMatrix);
    }
    for (const weights of skin.weights) {
      if (
        new Set(weights.map((value) => value.boneId)).size !== weights.length ||
        weights.some((value) => !bones.has(value.boneId)) ||
        Math.abs(weights.reduce((sum, value) => sum + value.weight, 0) - 1) > 1e-6
      )
        throw new Error("Pesos da malha requerem até quatro ossos únicos e soma 1.");
    }
  }
  const ancestry = (id: string) => {
    const result = new Set<string>();
    let cursor: string | null = id;
    while (cursor !== null) {
      if (result.has(cursor) || result.size >= 32)
        throw new Error("Hierarquia de rig cíclica/profunda.");
      result.add(cursor);
      const object = objects.get(cursor);
      if (!object) throw new Error("Referência de rig órfã.");
      cursor = object.parentId;
    }
    return result;
  };
  for (const id of objects.keys()) ancestry(id);
  const reads = rig.constraints.map((constraint) => {
    if (ids.has(constraint.id)) throw new Error("ID de restrição duplicado.");
    ids.add(constraint.id);
    if (constraint.kind === "distance" && constraint.min > constraint.max)
      throw new Error("Limites de distância invertidos.");
    if (
      constraint.kind === "path" &&
      !objects.get(constraint.targetId)?.geometry?.[constraint.contour]
    )
      throw new Error("Seguir caminho requer geometria e contorno existentes.");
    if (constraint.kind === "path" && skinOwners.has(constraint.targetId))
      throw new Error(
        "Seguir caminho usa geometria estática/morph; malha dependente do pós-rig não é alvo suportado.",
      );
    if (
      constraint.kind === "transform" &&
      new Set(constraint.channels).size !== constraint.channels.length
    )
      throw new Error("Canal de restrição duplicado.");
    const own = constraintOwners(constraint),
      local = constraint.kind === "transform" && constraint.space === "local",
      dependencies = local ? new Set([constraint.targetId]) : ancestry(constraint.targetId);
    for (const [index, id] of own.entries()) {
      const object = objects.get(id);
      if (!object) throw new Error("Destino de restrição órfão.");
      if (dependencies.has(id))
        throw new Error("Restrição não pode depender de seu próprio resultado.");
      if (
        constraint.kind === "ik" &&
        (!boneIds.has(id) || (index > 0 && object.parentId !== own[index - 1]))
      )
        throw new Error("Cadeia IK requer ossos contíguos.");
      if (!local && object.parentId !== null)
        for (const ancestor of ancestry(object.parentId))
          if (!own.includes(ancestor)) dependencies.add(ancestor);
    }
    if (!objects.has(constraint.targetId)) throw new Error("Alvo de restrição órfão.");
    return dependencies;
  });
  const dependencies = rig.constraints.map(() => new Set<number>());
  for (const [index, constraint] of rig.constraints.entries()) {
    const read = reads[index],
      own = constraintOwners(constraint),
      edges = dependencies[index];
    if (!read || !edges) throw new Error("Grafo de restrições incompleto.");
    for (const [other, candidate] of rig.constraints.entries()) {
      if (other === index) continue;
      const writes = constraintOwners(candidate);
      if (
        writes.some((id) => read.has(id)) ||
        (other < index && writes.some((id) => own.includes(id)))
      )
        edges.add(other);
    }
  }
  const ordered: RigConstraint[] = [],
    visited = new Set<number>(),
    visiting = new Set<number>();
  function visit(index: number) {
    if (visited.has(index)) return;
    if (visiting.has(index)) throw new Error("Restrições formam dependência circular.");
    visiting.add(index);
    for (const dependency of dependencies[index] ?? []) visit(dependency);
    const constraint = rig.constraints[index];
    if (!constraint) throw new Error("Restrição ausente.");
    visited.add(index);
    visiting.delete(index);
    ordered.push(constraint);
  }
  for (const index of rig.constraints.keys()) visit(index);
  const validationBudget = { remaining: 2_000_000 },
    frame = createKinematics(objects, new Map(), validationBudget),
    byBone = new Map(rig.bones.map((bone) => [bone.targetId, bone]));
  applyJoystickControllers(frame, rig.joysticks ?? [], validationBudget);
  for (const constraint of ordered)
    if (
      constraint.kind === "ik" &&
      (constraint.strength > 0 ||
        rig.parameterClips?.some((clip) =>
          clip.tracks.some(
            (track) => track.targetId === constraint.id && track.keys.some((key) => key.value > 0),
          ),
        ))
    ) {
      const chain = constraint.chain.map((id) => {
        const bone = byBone.get(id);
        if (!bone) throw new Error("Osso IK ausente.");
        return bone;
      });
      validateIkChain(frame, chain);
      const first = chain[0];
      if (!first) throw new Error("Cadeia IK vazia.");
      inverse(frame.pre(first.targetId));
    }
  return { ...rig, constraints: ordered };
}
