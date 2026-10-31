import {
  animationSchema,
  keyframeSchema,
  keyRetimingSchema,
  retimeKeyframes,
  type Track,
} from "@informach/edi-motion";
import { type RigDocument, rigCost } from "@informach/edi-motion/rig";
import { z } from "zod";
import { animationKeyReferenceSchema, animationKeySelectionId } from "./animationKeyReference";
import type { Artboard, Project } from "./project";
import { applyRig } from "./rig";
import { flattenScene } from "./scene.js";
import type { VertexClip, VertexKey } from "./vertexKeys";

const fields = {
  animationId: animationSchema.shape.id,
  references: z.array(animationKeyReferenceSchema).min(1).max(100000),
};
export const animationKeysCommandSchema = z.strictObject({
  type: z.literal("animation-keys"),
  command: z.discriminatedUnion("operation", [
    z.strictObject({ operation: z.literal("delete"), ...fields }),
    z.strictObject({ operation: z.literal("move"), ...fields, ...keyRetimingSchema.shape }),
    z.strictObject({ operation: z.literal("copy"), ...fields, ...keyRetimingSchema.shape }),
    z.strictObject({
      operation: z.literal("update"),
      animationId: animationSchema.shape.id,
      reference: animationKeyReferenceSchema,
      frame: keyframeSchema.shape.frame,
      value: keyframeSchema.shape.value,
      easing: keyframeSchema.shape.easing,
    }),
  ]),
});
export type AnimationKeysCommand = z.infer<typeof animationKeysCommandSchema>;
type NumericTrack = { id: string; targetId: string; keys: Track["keys"] };
interface Selection<T extends NumericTrack> {
  track: T;
  ids: Set<string>;
}
type RigTrack = NonNullable<RigDocument["parameterClips"]>[number]["tracks"][number];

/** Transaction-owned draft only. Resolve every complete reference before any
 * edits; namespaces/boards may legitimately reuse track/key IDs. */
export function applyAnimationKeys(project: Project, command: AnimationKeysCommand["command"]) {
  const animation = project.motion.animations.find(
    (animation) => animation.id === command.animationId,
  );
  if (!animation) throw new Error("Animação não encontrada para editar chaves.");
  const frames = animation.frames;
  const references = command.operation === "update" ? [command.reference] : command.references,
    identities = new Set<string>(),
    motionTracks = new Map(animation.tracks.map((track) => [track.id, track])),
    boards = new Map(project.artboards.map((board) => [board.id, board])),
    rigTracks = new Map<Artboard, Map<string, RigTrack>>(),
    keys = new WeakMap<NumericTrack, ReadonlySet<string>>(),
    motion = new Map<string, Selection<Track>>(),
    rigs = new Map<Artboard, { source: RigDocument; tracks: Map<string, Selection<RigTrack>> }>(),
    vertex = new Map<VertexClip, { board: Artboard; ids: Set<string> }>();
  // Index only referenced channels, once. A dense multi-key selection must not
  // scan the same channel's full key array for every selected key.
  function contains(track: NumericTrack | undefined, id: string) {
    if (!track) return false;
    let retained = keys.get(track);
    if (!retained) {
      retained = new Set(track.keys.map((key) => key.id));
      keys.set(track, retained);
    }
    return retained.has(id);
  }
  for (const reference of references) {
    const identity = animationKeySelectionId(reference);
    if (identities.has(identity)) throw new Error("Seleção contém referências de chave repetidas.");
    identities.add(identity);
    if (reference.kind === "vertex") {
      const board = boards.get(reference.artboardId),
        clip = board?.vertexClips?.find(
          (clip) => clip.id === reference.trackId && clip.animationId === animation.id,
        );
      if (!board || !clip?.keys.some((key) => key.id === reference.keyId))
        throw new Error("Referência de chave de vértices inexistente.");
      let selection = vertex.get(clip);
      if (!selection) {
        selection = { board, ids: new Set() };
        vertex.set(clip, selection);
      }
      selection.ids.add(reference.keyId);
    } else if (reference.kind === "motion") {
      const track = motionTracks.get(reference.trackId);
      if (!track || !contains(track, reference.keyId))
        throw new Error("Referência de chave motion inexistente.");
      let selection = motion.get(track.id);
      if (!selection) {
        selection = { track, ids: new Set() };
        motion.set(track.id, selection);
      }
      selection.ids.add(reference.keyId);
    } else {
      const board = boards.get(reference.artboardId),
        source = board?.rig;
      let tracks = board ? rigTracks.get(board) : undefined;
      if (board && source && !tracks) {
        tracks = new Map(
          source.parameterClips
            ?.find((clip) => clip.animationId === animation.id)
            ?.tracks.map((track) => [track.id, track]),
        );
        rigTracks.set(board, tracks);
      }
      const track = tracks?.get(reference.trackId);
      if (!board || !source || !track || !contains(track, reference.keyId))
        throw new Error("Referência de chave rig/prancheta inexistente.");
      let rig = rigs.get(board);
      if (!rig) {
        rig = { source, tracks: new Map() };
        rigs.set(board, rig);
      }
      let selection = rig.tracks.get(track.id);
      if (!selection) {
        selection = { track, ids: new Set() };
        rig.tracks.set(track.id, selection);
      }
      selection.ids.add(reference.keyId);
    }
  }
  const touched = new Set([
    ...[...motion.values()].map(({ track }) => track.targetId),
    ...[...vertex.keys()].map((clip) => clip.targetId),
  ]);
  if (
    project.artboards.some((board) =>
      flattenScene(board.scene).some(({ node, locked }) => locked && touched.has(node.id)),
    )
  )
    throw new Error("Desbloqueie o objeto e seus grupos antes de animar.");
  if (command.operation === "copy") {
    const existing = project.motion.animations.reduce(
        (sum, clip) => sum + clip.tracks.reduce((sum, track) => sum + track.keys.length, 0),
        0,
      ),
      added = [...motion.values()].reduce((sum, selection) => sum + selection.ids.size, 0);
    if (existing + added > 100000) throw new Error("Orçamento de chaves motion excedido.");
    for (const { source, tracks } of rigs.values())
      if (
        rigCost(source).keys +
          [...tracks.values()].reduce((sum, selection) => sum + selection.ids.size, 0) >
        100000
      )
        throw new Error("Orçamento de chaves de rig excedido.");
  }
  function edit(keys: Track["keys"], ids: ReadonlySet<string>): Track["keys"] {
    if (command.operation === "delete") return keys.filter((key) => !ids.has(key.id));
    if (command.operation === "update")
      return keys
        .map((key) =>
          ids.has(key.id)
            ? {
                ...key,
                frame: command.frame,
                value: command.value,
                easing: structuredClone(command.easing),
              }
            : key,
        )
        .sort((a, b) => a.frame - b.frame);
    return retimeKeyframes(
      keys,
      ids,
      frames,
      {
        deltaFrames: command.deltaFrames,
        scale: command.scale,
        anchorFrame: command.anchorFrame,
      },
      command.operation === "copy",
    );
  }
  for (const { track, ids } of motion.values()) track.keys = edit(track.keys, ids);
  // Vertex keys move, copy and change easing like the others; a whole path
  // stands in for the value, which they never take.
  for (const [clip, { board, ids }] of vertex) {
    const edited = edit(
      clip.keys.map((key) => ({ ...key, value: 0 })),
      ids,
    ) as (VertexKey & { value: number })[];
    clip.keys = edited.map(({ value: _value, ...key }) => key);
    if (!clip.keys.length) {
      board.vertexClips = board.vertexClips?.filter((value) => value !== clip);
      if (!board.vertexClips?.length) delete board.vertexClips;
    }
  }
  animation.tracks = animation.tracks.filter((track) => track.keys.length > 0);
  for (const [board, plan] of rigs) {
    const next = structuredClone(plan.source),
      clip = next.parameterClips?.find((clip) => clip.animationId === animation.id);
    if (!clip) throw new Error("Clip de rig ausente no plano de edição.");
    for (const track of clip.tracks) {
      const selection = plan.tracks.get(track.id);
      if (selection) track.keys = edit(track.keys, selection.ids);
    }
    clip.tracks = clip.tracks.filter((track) => track.keys.length > 0);
    if (!clip.tracks.length)
      next.parameterClips = next.parameterClips?.filter((value) => value !== clip);
    applyRig(project, board, { type: "rig", operation: "replace", value: next });
  }
}
