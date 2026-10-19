import { z } from "zod";
import { assertCommandBudget } from "./commandBudget";
import { keyRetimingSchema, retimeKeyframes } from "./keyRetiming";
import {
  animationSchema,
  type Easing,
  easingSchema,
  type Motion,
  objectIdSchema,
  objectTransformPatchSchema,
  type Property,
  parseMotion,
  propertySchema,
} from "./model";

const clipId = z.string().min(1).max(120);
const retimeFields = {
  animationId: clipId,
  keyIds: z.array(clipId).min(1).max(100000),
  ...keyRetimingSchema.shape,
};
export const motionCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("create-animation"), animation: animationSchema }),
  z.strictObject({
    type: z.literal("update-animation"),
    animationId: clipId,
    name: z.string().trim().min(1).max(120),
    frames: z.number().int().min(1).max(360000),
    fps: z.number().int().min(1).max(240),
    mode: z.enum(["loop", "ping-pong", "once"]),
  }),
  z.strictObject({ type: z.literal("delete-animation"), animationId: clipId }),
  z.strictObject({
    type: z.literal("set-poses"),
    animationId: clipId,
    frame: z.number().int().min(0).max(360000),
    createKeys: z.boolean(),
    poses: z
      .array(z.strictObject({ targetId: objectIdSchema, transform: objectTransformPatchSchema }))
      .min(1)
      .max(2000),
  }),
  z.strictObject({
    type: z.literal("delete-keys"),
    animationId: clipId,
    keyIds: z.array(clipId).min(1).max(100000),
  }),
  z.strictObject({ type: z.literal("move-keys"), ...retimeFields }),
  z.strictObject({ type: z.literal("copy-keys"), ...retimeFields }),
  z.strictObject({
    type: z.literal("duplicate-animation"),
    animationId: clipId,
    id: clipId,
    name: z.string().trim().min(1).max(120),
  }),
  z.strictObject({
    type: z.literal("update-key"),
    animationId: clipId,
    trackId: clipId,
    keyId: clipId,
    frame: z.number().min(0).max(360000),
    value: z.number(),
    easing: easingSchema,
  }),
  z.strictObject({
    type: z.literal("set-key"),
    animationId: clipId,
    targetId: objectIdSchema,
    property: propertySchema,
    frame: z.number().min(0).max(360000),
    value: z.number(),
    easing: easingSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("delete-key"),
    animationId: clipId,
    trackId: clipId,
    keyId: clipId,
  }),
]);
export type MotionCommand = z.infer<typeof motionCommandSchema>;

/** All commands in a request either validate together or publish nothing. IDs
 * are allocated at command time, never while evaluating or rendering. */
export function applyMotionCommands(
  input: unknown,
  targets: ReadonlySet<string>,
  rawCommands: unknown,
): Motion {
  const draft = parseMotion(input, targets);
  assertCommandBudget(rawCommands);
  const commands = z
    .array(motionCommandSchema)
    .min(1)
    .max(100)
    .parse(rawCommands, { jitless: true });
  for (const command of commands) {
    if (command.type === "create-animation") {
      if (draft.animations.length >= 100) throw new Error("Orçamento de animações excedido.");
      assertDocumentBudget(
        draft,
        command.animation.tracks.reduce((sum, track) => sum + track.keys.length, 0),
        command.animation.tracks.length,
      );
      draft.animations.push(command.animation);
      continue;
    }
    const index = draft.animations.findIndex((animation) => animation.id === command.animationId);
    const animation = draft.animations[index];
    if (!animation) throw new Error("Animação não encontrada.");
    if (command.type === "delete-animation") {
      draft.animations.splice(index, 1);
      continue;
    }
    if (command.type === "duplicate-animation") {
      if (draft.animations.length >= 100) throw new Error("Orçamento de animações excedido.");
      assertDocumentBudget(
        draft,
        animation.tracks.reduce((sum, track) => sum + track.keys.length, 0),
        animation.tracks.length,
      );
      const copy = structuredClone(animation);
      copy.id = command.id;
      copy.name = command.name;
      for (const track of copy.tracks) {
        track.id = `track-${crypto.randomUUID()}`;
        for (const key of track.keys) key.id = `key-${crypto.randomUUID()}`;
      }
      draft.animations.push(copy);
      continue;
    }
    if (command.type === "update-animation") {
      Object.assign(animation, {
        name: command.name,
        frames: command.frames,
        fps: command.fps,
        mode: command.mode,
      });
    } else if (command.type === "set-key" || command.type === "set-poses") {
      const channels = new Map(
        animation.tracks.map((track) => [`${track.targetId}:${track.property}`, track]),
      );
      const set = (
        targetId: string,
        property: Property,
        frame: number,
        value: number,
        easing: Easing | undefined,
        requireExisting: boolean,
      ) => {
        const channel = `${targetId}:${property}`;
        let track = channels.get(channel);
        const key = track?.keys.find((key) => key.frame === frame);
        if (requireExisting && !key)
          throw new Error(
            "Ative Autochave ou grave uma pose neste quadro antes de editar a chave.",
          );
        if (!track) {
          track = { id: `track-${crypto.randomUUID()}`, targetId, property, keys: [] };
          animation.tracks.push(track);
          channels.set(channel, track);
        }
        if (key) {
          key.value = value;
          if (easing !== undefined) key.easing = easing;
        } else
          track.keys.push({
            id: `key-${crypto.randomUUID()}`,
            frame,
            value,
            easing: easing ?? "linear",
          });
        track.keys.sort((a, b) => a.frame - b.frame);
      };
      if (command.type === "set-key")
        set(
          command.targetId,
          command.property,
          command.frame,
          command.value,
          command.easing,
          false,
        );
      else {
        const ids = new Set(command.poses.map((pose) => pose.targetId));
        if (ids.size !== command.poses.length) throw new Error("Pose contém IDs repetidos.");
        for (const pose of command.poses)
          for (const property of propertySchema.options) {
            const value = pose.transform[property];
            if (value !== undefined)
              set(pose.targetId, property, command.frame, value, undefined, !command.createKeys);
          }
      }
      assertDocumentBudget(draft);
    } else if (
      command.type === "delete-keys" ||
      command.type === "move-keys" ||
      command.type === "copy-keys"
    ) {
      const ids = new Set(command.keyIds);
      if (ids.size !== command.keyIds.length) throw new Error("Seleção contém chaves repetidas.");
      const selected = animation.tracks.flatMap((track) =>
        track.keys.filter((key) => ids.has(key.id)),
      );
      if (selected.length !== ids.size) throw new Error("Seleção contém chaves inexistentes.");
      if (command.type === "copy-keys") assertDocumentBudget(draft, selected.length);
      for (const track of animation.tracks) {
        if (command.type === "delete-keys")
          track.keys = track.keys.filter((key) => !ids.has(key.id));
        else if (track.keys.some((key) => ids.has(key.id)))
          track.keys = retimeKeyframes(
            track.keys,
            ids,
            animation.frames,
            {
              deltaFrames: command.deltaFrames,
              scale: command.scale,
              anchorFrame: command.anchorFrame,
            },
            command.type === "copy-keys",
          );
      }
      animation.tracks = animation.tracks.filter((track) => track.keys.length > 0);
    } else if (command.type === "update-key") {
      const track = animation.tracks.find((item) => item.id === command.trackId);
      const key = track?.keys.find((item) => item.id === command.keyId);
      if (!track || !key) throw new Error("Chave não encontrada.");
      Object.assign(key, { frame: command.frame, value: command.value, easing: command.easing });
      track.keys.sort((a, b) => a.frame - b.frame);
    } else {
      const track = animation.tracks.find((track) => track.id === command.trackId);
      if (!track?.keys.some((key) => key.id === command.keyId))
        throw new Error("Chave não encontrada.");
      track.keys = track.keys.filter((key) => key.id !== command.keyId);
      if (!track.keys.length) animation.tracks = animation.tracks.filter((item) => item !== track);
    }
  }
  return parseMotion(draft, targets);
}
function assertDocumentBudget(motion: Motion, extraKeys = 0, extraTracks = 0) {
  let tracks = extraTracks,
    keys = extraKeys;
  for (const clip of motion.animations)
    for (const track of clip.tracks) {
      tracks++;
      keys += track.keys.length;
    }
  if (tracks > 12000 || keys > 100000) throw new Error("Orçamento agregado de animação excedido.");
}
