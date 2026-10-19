import { identityTransform, objectIdSchema } from "@informach/edi-motion";
import {
  captureSkin,
  constraintOwners,
  parseRig,
  rigParameterEntries,
  upgradeRigVersion,
} from "@informach/edi-motion/rig";
import { z } from "zod";
import { bindObjectToBone } from "./composition";
import type { Artboard, Project } from "./project";
import { rigObjects } from "./rigObjects";
import { flattenScene } from "./scene.js";
import type { SceneNode } from "./sceneTypes";

const coordinate = z.number().min(-10000).max(10000),
  length = z.number().positive().max(10000);
export const rigCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    type: z.literal("rig"),
    operation: z.literal("bind-skin"),
    id: z.string().regex(/^skin-[\w-]{1,100}$/),
    targetId: objectIdSchema,
    boneIds: z.array(objectIdSchema).min(1).max(256),
    confirmRestPose: z.literal(true),
  }),
  z.strictObject({ type: z.literal("rig"), operation: z.literal("replace"), value: z.unknown() }),
  z.strictObject({
    type: z.literal("rig"),
    operation: z.literal("create-bone"),
    id: objectIdSchema,
    name: z.string().trim().min(1).max(120),
    parentId: objectIdSchema.nullable(),
    x: coordinate,
    y: coordinate,
    rotation: coordinate,
    length,
  }),
  z.strictObject({
    type: z.literal("rig"),
    operation: z.literal("create-target"),
    id: objectIdSchema,
    name: z.string().trim().min(1).max(120),
    x: coordinate,
    y: coordinate,
  }),
  z.strictObject({
    type: z.literal("rig"),
    operation: z.literal("update-bone"),
    targetId: objectIdSchema,
    length,
    minRotation: coordinate,
    maxRotation: coordinate,
  }),
  z.strictObject({
    type: z.literal("rig"),
    operation: z.literal("unregister-bone"),
    targetId: objectIdSchema,
  }),
  z.strictObject({
    type: z.literal("rig"),
    operation: z.literal("bind"),
    boneId: objectIdSchema,
    targetIds: z.array(objectIdSchema).min(1).max(2000),
    confirmRestPose: z.literal(true),
  }),
]);
export type RigCommand = z.infer<typeof rigCommandSchema>;
export function applyRig(
  project: Project,
  board: Artboard,
  command: RigCommand,
): string | undefined {
  const entries = flattenScene(board.scene),
    byId = new Map(entries.map((entry) => [entry.node.id, entry])),
    previous = board.rig ?? { version: 1, bones: [], constraints: [], targets: [] };
  const editable = (id: string) => {
    const entry = byId.get(id);
    if (!entry || entry.locked) throw new Error("Objeto do rig ausente ou bloqueado.");
    return entry;
  };
  if (command.operation === "bind-skin") {
    editable(command.targetId);
    if (
      previous.skins?.some((skin) => skin.id === command.id || skin.targetId === command.targetId)
    )
      throw new Error("Malha já existe; remova ou edite explicitamente a referência.");
    board.rig = {
      ...previous,
      version: upgradeRigVersion(previous.version, 2),
      skins: [
        ...(previous.skins ?? []),
        captureSkin(
          previous,
          rigObjects(board.scene),
          command.targetId,
          command.boneIds,
          command.id,
        ),
      ],
    };
    return command.targetId;
  }
  if (command.operation === "replace") {
    const next = parseRig(command.value, rigObjects(board.scene)),
      changed = new Set<string>();
    for (const bone of [...previous.bones, ...next.bones]) {
      if (
        JSON.stringify(previous.bones.find((value) => value.targetId === bone.targetId)) !==
        JSON.stringify(next.bones.find((value) => value.targetId === bone.targetId))
      )
        changed.add(bone.targetId);
    }
    for (const constraint of [...previous.constraints, ...next.constraints]) {
      if (
        JSON.stringify(previous.constraints.find((value) => value.id === constraint.id)) !==
          JSON.stringify(next.constraints.find((value) => value.id === constraint.id)) ||
        previous.constraints.findIndex((value) => value.id === constraint.id) !==
          next.constraints.findIndex((value) => value.id === constraint.id)
      )
        for (const id of constraintOwners(constraint)) changed.add(id);
    }
    for (const id of [...previous.targets, ...next.targets])
      if (previous.targets.includes(id) !== next.targets.includes(id)) changed.add(id);
    for (const morph of [...(previous.morphs ?? []), ...(next.morphs ?? [])])
      if (
        JSON.stringify(previous.morphs?.find((value) => value.id === morph.id)) !==
        JSON.stringify(next.morphs?.find((value) => value.id === morph.id))
      )
        changed.add(morph.targetId);
    for (const trim of [...(previous.trims ?? []), ...(next.trims ?? [])])
      if (
        JSON.stringify(previous.trims?.find((value) => value.id === trim.id)) !==
        JSON.stringify(next.trims?.find((value) => value.id === trim.id))
      )
        changed.add(trim.targetId);
    for (const joystick of [...(previous.joysticks ?? []), ...(next.joysticks ?? [])])
      if (
        JSON.stringify(previous.joysticks?.find((value) => value.id === joystick.id)) !==
        JSON.stringify(next.joysticks?.find((value) => value.id === joystick.id))
      )
        changed.add(joystick.targetId);
    for (const solo of [...(previous.solos ?? []), ...(next.solos ?? [])])
      if (
        JSON.stringify(previous.solos?.find((value) => value.id === solo.id)) !==
        JSON.stringify(next.solos?.find((value) => value.id === solo.id))
      )
        for (const id of [solo.targetId, ...solo.children]) changed.add(id);
    for (const skin of [...(previous.skins ?? []), ...(next.skins ?? [])])
      if (
        JSON.stringify(previous.skins?.find((value) => value.id === skin.id)) !==
        JSON.stringify(next.skins?.find((value) => value.id === skin.id))
      )
        changed.add(skin.targetId);
    for (const clip of [...(previous.parameterClips ?? []), ...(next.parameterClips ?? [])]) {
      const old = previous.parameterClips?.find((value) => value.animationId === clip.animationId),
        current = next.parameterClips?.find((value) => value.animationId === clip.animationId);
      for (const track of [...(old?.tracks ?? []), ...(current?.tracks ?? [])])
        if (
          JSON.stringify(old?.tracks.find((value) => value.id === track.id)) !==
          JSON.stringify(current?.tracks.find((value) => value.id === track.id))
        ) {
          for (const entry of [...rigParameterEntries(previous), ...rigParameterEntries(next)])
            if (entry.targetId === track.targetId && entry.property === track.property)
              for (const id of entry.definition.ownerIds) changed.add(id);
        }
    }
    for (const id of changed) editable(id);
    board.rig = next;
    return;
  }
  if (command.operation === "create-bone" || command.operation === "create-target") {
    if (byId.has(command.id)) throw new Error("ID de objeto do rig já existe.");
    const node: SceneNode = {
      id: command.id,
      name: command.name,
      tag: "g",
      attrs: {},
      text: "",
      transform: {
        ...identityTransform(),
        x: command.x,
        y: command.y,
        rotation: command.operation === "create-bone" ? command.rotation : 0,
      },
      children: [],
      visible: true,
      locked: false,
    };
    const parent =
      command.operation === "create-bone" && command.parentId !== null
        ? editable(command.parentId).node
        : undefined;
    if (parent && (parent.tag !== "g" || parent.instance))
      throw new Error("Pai do osso deve ser grupo local.");
    (parent?.children ?? board.scene.nodes).push(node);
    board.rig = {
      ...previous,
      bones:
        command.operation === "create-bone"
          ? [
              ...previous.bones,
              { targetId: node.id, length: command.length, minRotation: -180, maxRotation: 180 },
            ]
          : previous.bones,
      targets:
        command.operation === "create-target" ? [...previous.targets, node.id] : previous.targets,
    };
    return node.id;
  }
  if (command.operation === "bind") {
    editable(command.boneId);
    if (!previous.bones.some((bone) => bone.targetId === command.boneId))
      throw new Error("Selecione um osso para vincular.");
    const ids = new Set(command.targetIds);
    if (ids.size !== command.targetIds.length) throw new Error("Seleção de vínculo duplicada.");
    for (const id of ids) {
      editable(id);
      if (id === command.boneId || previous.bones.some((bone) => bone.targetId === id))
        throw new Error("Vincule arte, não outro osso. Edite a hierarquia do rig explicitamente.");
    }
    for (const id of ids) {
      let parent = byId.get(id)?.parentId;
      let selectedAncestor = false;
      while (parent) {
        if (ids.has(parent)) {
          selectedAncestor = true;
          break;
        }
        parent = byId.get(parent)?.parentId;
      }
      if (!selectedAncestor) bindObjectToBone(board.scene, project.motion, id, command.boneId);
    }
    return command.targetIds[0];
  }
  editable(command.targetId);
  const bone = previous.bones.find((bone) => bone.targetId === command.targetId);
  if (!bone) throw new Error("Osso não encontrado.");
  if (command.operation === "unregister-bone") {
    board.rig = {
      ...previous,
      bones: previous.bones.filter((bone) => bone.targetId !== command.targetId),
    };
    return command.targetId;
  }
  if (command.minRotation > command.maxRotation) throw new Error("Limites de rotação invertidos.");
  if (bone.length !== command.length)
    for (const child of previous.bones) {
      const entry = byId.get(child.targetId);
      if (
        entry?.parentId !== bone.targetId ||
        entry.node.transform.x !== bone.length ||
        entry.node.transform.y !== 0
      )
        continue;
      editable(child.targetId);
      if (
        project.motion.animations.some((clip) =>
          clip.tracks.some(
            (track) =>
              track.targetId === child.targetId &&
              (track.property === "x" || track.property === "y"),
          ),
        )
      )
        throw new Error(
          "Filho tem posição animada; ajuste as trilhas antes de alterar o comprimento do pai.",
        );
      entry.node.transform.x = command.length;
    }
  board.rig = {
    ...previous,
    bones: previous.bones.map((value) =>
      value.targetId === command.targetId
        ? {
            ...value,
            length: command.length,
            minRotation: command.minRotation,
            maxRotation: command.maxRotation,
          }
        : value,
    ),
  };
  return command.targetId;
}
