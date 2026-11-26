import {
  type AlignEdge,
  type Axis,
  alignShifts,
  type Box,
  distributeShifts,
  moveClipBy,
  type Shift,
  unionBox,
} from "@shared/align";
import type { Annotation } from "@shared/annotation";
import { clipLayout } from "@shared/compose";
import { transformAt } from "@shared/keyframes";
import type { Asset, Clip, Project } from "@shared/types";
import { usePlayback } from "@/state/playback";
import { type Commit, personCommit, useProject } from "@/state/project";
import { renderAnnotation } from "./annotations";

/** What Alinhar and Espaçamento do: an edge to line up on, or the same space along an axis. */
export type Arrangement =
  | { align: AlignEdge; to: "selection" | "frame" }
  | { distribute: Axis; gap?: number };

/** Pictures on screen that can move: not sounds, zoom layers, region effects or locked tracks. */
export function arrangeable(p: Project, ids: readonly string[]): Clip[] {
  const set = new Set(ids);
  const locked = new Set(p.tracks.filter((t) => t.locked).map((t) => t.id));
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  return p.clips.filter((c) => {
    if (!set.has(c.id) || locked.has(c.trackId)) return false;
    const a = assets.get(c.assetId);
    return !!a && a.kind !== "audio" && !c.soundOnly && !c.zoomLayer && !c.regionFx;
  });
}

/**
 * The transparent room around what an annotation's picture draws, as a fraction of the picture
 * (the same on every side; 0 for a full-frame card or backdrop). Worked out by drawing it as the
 * editor does (renderAnnotation), once per version of the annotation.
 */
const margins = new WeakMap<Annotation, Promise<{ x: number; y: number }>>();
function marginOf(a: Annotation, p: Project): Promise<{ x: number; y: number }> {
  let known = margins.get(a);
  if (!known) {
    known = renderAnnotation(a, p.settings.height, p.settings.width).then((r) => ({
      x: r.width ? r.margin / r.width : 0,
      y: r.height ? r.margin / r.height : 0,
    }));
    margins.set(a, known);
  }
  return known;
}

/**
 * Each clip's box on screen at the playhead (its keyframes there when it travels), frame
 * pixels: what it draws, so a text lines up by its strip and letters, not by the picture's
 * transparent border.
 */
export async function clipBoxes(p: Project, clips: readonly Clip[], time: number): Promise<Box[]> {
  const assets = new Map<string, Asset>(p.assets.map((a) => [a.id, a]));
  return Promise.all(
    clips.map(async (c) => {
      const asset = assets.get(c.assetId);
      const layout = clipLayout(
        { transform: transformAt(c, Math.min(Math.max(time, c.start), c.start + c.duration)) },
        asset ?? { width: 0, height: 0 },
        p.settings,
      );
      const box = layout.bounds;
      if (!c.annotation) return box;
      const margin = await marginOf(c.annotation, p).catch(() => ({ x: 0, y: 0 }));
      const mx = margin.x * layout.full.w;
      const my = margin.y * layout.full.h;
      return {
        x: box.x + mx,
        y: box.y + my,
        w: Math.max(0, box.w - mx * 2),
        h: Math.max(0, box.h - my * 2),
      };
    }),
  );
}

/** How far each clip moves for an arrangement. */
export function arrangementShifts(
  boxes: readonly Box[],
  how: Arrangement,
  frame: { width: number; height: number },
): Shift[] {
  if ("align" in how)
    return alignShifts(
      boxes,
      how.align,
      how.to === "frame" || boxes.length < 2
        ? { x: 0, y: 0, w: frame.width, h: frame.height }
        : unionBox(boxes),
    );
  return distributeShifts(boxes, how.distribute, how.gap);
}

/**
 * Lines up or spaces the given clips (groups are expected already expanded) in one commit, one
 * Ctrl+Z. Returns how many clips moved.
 */
export async function arrangeClips(
  ids: readonly string[],
  how: Arrangement,
  commit: Commit = personCommit,
): Promise<number> {
  const p = useProject.getState().project;
  if (!p) return 0;
  const clips = arrangeable(p, ids);
  const boxes = await clipBoxes(p, clips, usePlayback.getState().time);
  const shifts = arrangementShifts(boxes, how, p.settings);
  const moves = new Map<string, Shift>();
  clips.forEach((c, i) => {
    const s = shifts[i];
    if (Math.abs(s.dx) > 0.01 || Math.abs(s.dy) > 0.01) moves.set(c.id, s);
  });
  if (!moves.size) return 0;
  commit((q) => ({
    ...q,
    clips: q.clips.map((c) => {
      const s = moves.get(c.id);
      return s ? moveClipBy(c, s, q.settings) : c;
    }),
  }));
  return moves.size;
}
