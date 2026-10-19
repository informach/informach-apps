import type { Motion } from "@informach/edi-motion";
import { timelineClip } from "../../shared/animationTimeline";
import type { Artboard } from "../../shared/project";

export function activeTimelineClip(state: {
  motion: Motion;
  artboards: Artboard[];
  activeClipId: string | null;
  activeArtboardId: string | null;
}) {
  const clip = state.motion.animations.find((clip) => clip.id === state.activeClipId),
    board = state.artboards.find((board) => board.id === state.activeArtboardId);
  return clip && board ? timelineClip(board, clip) : undefined;
}
