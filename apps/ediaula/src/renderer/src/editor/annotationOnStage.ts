import { animAt, clipLayout } from "@shared/compose";
import { transformAt } from "@shared/keyframes";
import { clipEnd } from "@shared/timeline";
import type { Asset, Clip, Project } from "@shared/types";
import { zoomAffine, zoomsOver } from "@shared/zoomLayer";

/** Where an annotation's picture is on the stage at a moment, in screen pixels of the stage. */
export interface OnStage {
  /** Top-left corner of the whole picture (with its transparent padding). */
  x: number;
  y: number;
  /** Screen pixels per pixel of the picture. */
  density: number;
  /** The stage's size. */
  width: number;
  height: number;
  /** Whether it can be edited now: on screen, visible and on a track that is not locked. */
  editable: boolean;
}

/**
 * Same placement as the preview draws it: its layout, entrance/exit and the zoom layers above.
 * `still` leaves the entrance and exit out: where it rests, as it shows once it is in (a
 * balloon just added sits at the playhead, where its entrance still hides it).
 */
export function annotationOnStage(
  clip: Clip,
  asset: Asset,
  project: Project,
  scale: number,
  time: number,
  still = false,
): OnStage {
  const trackIndex = project.tracks.findIndex((t) => t.id === clip.trackId);
  const track = project.tracks[trackIndex];
  const lay = clipLayout({ transform: transformAt(clip, time) }, asset, project.settings);
  const width = project.settings.width * scale;
  const height = project.settings.height * scale;
  const motion = still ? { opacity: 1, scale: 1, dx: 0, dy: 0 } : animAt(clip, time);
  const z = zoomAffine(zoomsOver(project, trackIndex, time), width, height);
  const density = (lay.full.w / asset.width) * scale * motion.scale * z.s;
  const pivotX = (lay.visible.x + lay.visible.w / 2) * scale;
  const pivotY = (lay.visible.y + lay.visible.h / 2) * scale;
  return {
    x: z.s * (pivotX + motion.dx * width + (lay.full.x * scale - pivotX) * motion.scale) + z.tx,
    y: z.s * (pivotY + motion.dy * height + (lay.full.y * scale - pivotY) * motion.scale) + z.ty,
    density,
    width,
    height,
    editable:
      time >= clip.start &&
      time < clipEnd(clip) &&
      !track?.hidden &&
      !track?.locked &&
      motion.opacity >= 0.1 &&
      density >= 0.001,
  };
}
