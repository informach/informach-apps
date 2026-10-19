import {
  type Animation,
  evaluateAnimation,
  type Motion,
  type Transform,
} from "@informach/edi-motion";
import type { SceneNode } from "../../shared/sceneTypes";

interface ClipState {
  motion: Motion;
  activeClipId: string | null;
  view: string;
  frame: number;
}
export const activeClip = (state: ClipState) =>
  state.motion.animations.find((clip) => clip.id === state.activeClipId);
// Published clips are replaced, not mutated, by transactions/history. Keep only
// the current sampled frame per live clip; old documents remain collectable.
const poses = new WeakMap<
  Animation,
  { frame: number; value: ReturnType<typeof evaluateAnimation> }
>();
export function objectPose(state: ClipState, node: SceneNode): Transform {
  const clip = state.view === "animate" ? activeClip(state) : undefined;
  if (!clip) return { ...node.transform };
  let pose = poses.get(clip);
  if (!pose || pose.frame !== state.frame) {
    pose = { frame: state.frame, value: evaluateAnimation(clip, state.frame) };
    poses.set(clip, pose);
  }
  return { ...node.transform, ...pose.value.get(node.id) };
}
