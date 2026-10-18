import { type Animation, propertyBounds, type Track } from "@informach/edi-motion";
import { rigParameterEntries } from "@informach/edi-motion/rig";
import {
  type AnimationKeyReference,
  type AnimationTrackReference,
  animationKeySelectionId,
  animationTrackSelectionId,
} from "./animationKeyReference";
import type { Artboard } from "./project";
import { flattenScene } from "./scene.js";

type Definition = ReturnType<typeof rigParameterEntries>[number]["definition"];
export interface TimelineTrack {
  id: string;
  source: AnimationTrackReference;
  targetId: string;
  property: string;
  label: string;
  definition: Definition;
  keys: readonly Track["keys"][number][];
}
export interface TimelineKey {
  reference: AnimationKeyReference;
  track: TimelineTrack;
  key: Track["keys"][number];
}
export interface TimelineClip extends Omit<Animation, "tracks"> {
  tracks: readonly TimelineTrack[];
  keyIndex: ReadonlyMap<string, TimelineKey>;
}
const cache = new WeakMap<Artboard, WeakMap<Animation, TimelineClip>>();

/** Immutable document snapshots only. Source keys stay readonly; identity maps
 * are built once per board/clip, not once per frame or visible-row render. */
export function timelineClip(board: Artboard, animation: Animation): TimelineClip {
  let clips = cache.get(board);
  if (!clips) {
    clips = new WeakMap();
    cache.set(board, clips);
  }
  const retained = clips.get(animation);
  if (retained) return retained;
  const objects = new Map(flattenScene(board.scene).map(({ node }) => [node.id, node])),
    tracks: TimelineTrack[] = [],
    keyIndex = new Map<string, TimelineKey>();
  function add(track: TimelineTrack) {
    tracks.push(track);
    for (const key of track.keys) {
      const reference: AnimationKeyReference = { ...track.source, keyId: key.id },
        id = animationKeySelectionId(reference);
      if (keyIndex.has(id)) throw new Error("Identidade de chave duplicada na projeção temporal.");
      keyIndex.set(id, { reference, track, key });
    }
  }
  for (const track of animation.tracks) {
    const object = objects.get(track.targetId);
    if (!object) continue;
    add({
      id: track.id,
      source: { kind: "motion", trackId: track.id },
      targetId: track.targetId,
      property: track.property,
      label: object.name,
      definition: {
        initial: object.transform[track.property] ?? 0,
        bounds: propertyBounds[track.property],
        discrete: false,
        ownerIds: [track.targetId],
      },
      keys: track.keys,
    });
  }
  const rig = board.rig;
  if (rig) {
    const definitions = new Map(
      rigParameterEntries(rig).map((entry) => [
        JSON.stringify([entry.targetId, entry.property]),
        entry.definition,
      ]),
    );
    const labels = new Map<string, string>();
    for (const [index, constraint] of rig.constraints.entries())
      labels.set(constraint.id, `Restrição ${index + 1} · ${constraint.kind}`);
    for (const [index, morph] of (rig.morphs ?? []).entries())
      labels.set(morph.id, `Morph ${index + 1} · ${morph.name}`);
    for (const [index, solo] of (rig.solos ?? []).entries())
      labels.set(solo.id, `Solo ${index + 1}`);
    for (const [index, trim] of (rig.trims ?? []).entries())
      labels.set(trim.id, `Recorte ${index + 1}`);
    for (const [index, joystick] of (rig.joysticks ?? []).entries())
      labels.set(joystick.id, `Joystick ${index + 1} · ${joystick.name}`);
    for (const track of rig.parameterClips?.find((clip) => clip.animationId === animation.id)
      ?.tracks ?? []) {
      const definition = definitions.get(JSON.stringify([track.targetId, track.property]));
      if (!definition) throw new Error("Canal de rig órfão na projeção temporal.");
      const source: AnimationTrackReference = {
          kind: "rig",
          artboardId: board.id,
          trackId: track.id,
        },
        owner = objects.get(definition.ownerIds[0] ?? ""),
        control = labels.get(track.targetId);
      if (!owner || !control) throw new Error("Owner/controlador ausente na projeção temporal.");
      add({
        id: animationTrackSelectionId(source),
        source,
        targetId: track.targetId,
        property: track.property,
        label: `${owner.name} · ${control}`,
        definition,
        keys: track.keys,
      });
    }
  }
  const result: TimelineClip = { ...animation, tracks, keyIndex };
  clips.set(animation, result);
  return result;
}
