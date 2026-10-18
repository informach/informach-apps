import { clipSpeed, setClipSpeed } from "@shared/timeline";
import type { Clip, Project } from "@shared/types";
import { type Commit, personCommit, useProject } from "@/state/project";

export const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8];

/** Only clips that play in time have a speed: videos and sounds (not pictures, annotations or zoom layers). */
export function hasSpeed(project: Project, clip: Clip): boolean {
  const asset = project.assets.find((a) => a.id === clip.assetId);
  return !!asset && asset.kind !== "image" && !clip.zoomLayer && !clip.annotation;
}

export function speedLabel(speed: number): string {
  return `${Number(speed.toFixed(2))}×`.replace(".", ",");
}

/**
 * Sets the speed of the given clips (those that have one), keeping what each one shows: faster
 * makes it shorter, slower longer. `ripple` moves what follows on each clip's track. One undo step.
 */
export function applySpeed(
  ids: string[],
  speed: number,
  ripple: boolean,
  commit: Commit = personCommit,
): number {
  const p = useProject.getState().project;
  if (!p) return 0;
  const locked = new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));
  // Latest first, so moving what follows one clip does not shift the ones still to change.
  const targets = p.clips
    .filter((c) => ids.includes(c.id) && !locked.has(c.trackId) && hasSpeed(p, c))
    .sort((a, b) => b.start - a.start);
  if (!targets.length) return 0;
  commit((q) => ({
    ...q,
    clips: targets.reduce((clips, c) => setClipSpeed(clips, c.id, speed, ripple), q.clips),
  }));
  return targets.length;
}

/** Speed shared by the clips, or null when they differ. */
export function commonSpeed(clips: Clip[]): number | null {
  const s = clips.map(clipSpeed);
  return s.every((x) => Math.abs(x - s[0]) < 1e-3) ? (s[0] ?? 1) : null;
}
