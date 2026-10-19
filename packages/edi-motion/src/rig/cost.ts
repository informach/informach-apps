import type { RigDocument } from "./model";

/** Counts authored work independently of any renderer or expanded instance. */
export function rigCost(rig: RigDocument | undefined) {
  let vertices = 0,
    controls = 0,
    tracks = 0,
    keys = 0;
  for (const morph of rig?.morphs ?? [])
    vertices += morph.geometry.reduce((sum, contour) => sum + contour.points.length, 0);
  for (const skin of rig?.skins ?? []) controls += skin.weights.length;
  controls += (rig?.joysticks?.length ?? 0) * 2;
  for (const clip of rig?.parameterClips ?? []) {
    tracks += clip.tracks.length;
    keys += clip.tracks.reduce((sum, track) => sum + track.keys.length, 0);
  }
  return {
    vertices,
    controls,
    tracks,
    keys,
    deformers:
      (rig?.morphs?.length ?? 0) +
      (rig?.skins?.length ?? 0) +
      (rig?.solos?.length ?? 0) +
      (rig?.trims?.length ?? 0),
  };
}
