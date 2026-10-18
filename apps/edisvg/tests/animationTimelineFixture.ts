import assert from "node:assert/strict";
import type { Track } from "@informach/edi-motion";
import { animationKeyReferenceSchema } from "../src/shared/animationKeyReference";
import { parseProject } from "../src/shared/project";
import { trimFixture } from "./trimFixture";

export function animationTimelineFixture() {
  const fixture = trimFixture(),
    project = fixture.project(),
    animation = project.motion.animations[0],
    board = project.artboards[0],
    rigTrack = board?.rig?.parameterClips?.[0]?.tracks[0];
  assert.ok(animation && board && rigTrack?.keys[0]);
  // Same persisted IDs across motion and rig are valid and must stay so.
  animation.tracks.push({
    id: rigTrack.id,
    targetId: fixture.shapeId,
    property: "x",
    keys: rigTrack.keys.map((key, index) => ({ ...structuredClone(key), value: index * 100 })),
  });
  parseProject(project);
  const motion = animationKeyReferenceSchema.parse({
      kind: "motion",
      trackId: rigTrack.id,
      keyId: rigTrack.keys[0].id,
    }),
    rig = animationKeyReferenceSchema.parse({
      kind: "rig",
      artboardId: board.id,
      trackId: rigTrack.id,
      keyId: rigTrack.keys[0].id,
    });
  return { ...fixture, motion, rig };
}

export function denseAnimationTimelineFixture() {
  const fixture = trimFixture(),
    project = fixture.project(),
    board = project.artboards[0],
    animation = project.motion.animations[0],
    shape = board?.scene.nodes[0],
    rig = board?.rig,
    trim = rig?.trims?.[0];
  assert.ok(board && animation && shape && rig && trim);
  const count = 32,
    keys = 500;
  animation.frames = 1000;
  board.scene.nodes = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(shape),
    id: `node-virtual-${index}`,
    name: `Caminho ${index + 1}`,
  }));
  rig.trims = board.scene.nodes.map((node, index) => ({
    ...trim,
    id: `trim-virtual-${index}`,
    targetId: node.id,
  }));
  const keyframes = (domain: string, channel: number): Track["keys"] =>
    Array.from({ length: keys }, (_, index) => ({
      id: `key-${domain}-${channel}-${index}`,
      frame: index * 2,
      value: domain === "rig" ? index / keys : index,
      easing: "linear",
    }));
  animation.tracks = board.scene.nodes.map((node, index) => ({
    id: `track-motion-${index}`,
    targetId: node.id,
    property: "x",
    keys: keyframes("motion", index),
  }));
  rig.parameterClips = [
    {
      animationId: animation.id,
      tracks: rig.trims.map((trim, index) => ({
        id: `track-rig-${index}`,
        targetId: trim.id,
        property: "end",
        keys: keyframes("rig", index),
      })),
    },
  ];
  return { ...fixture, source: parseProject(project), count, keys };
}
