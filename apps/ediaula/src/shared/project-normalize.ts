import type { z } from "zod";
import type { Annotation } from "./annotation.ts";
import { type Drawing, sanitizeDrawing } from "./drawing.ts";
import type { projectSchema } from "./project-schema.ts";
import type { Project } from "./types.ts";
import type { Zoom } from "./zoom.ts";

/** A project as read from disk: it may still carry fields of older versions. */
export type StoredProject = z.infer<typeof projectSchema>;

function unionById(a: Zoom[], b: Zoom[]): Zoom[] {
  const out = new Map(a.map((z) => [z.id, z]));
  for (const z of b) if (!out.has(z.id)) out.set(z.id, z);
  return [...out.values()].sort((x, y) => x.start - y.start);
}

/**
 * Older projects kept the zooms on each clip, and every piece of a cut recording carried all of
 * them: the file grew with each cut, and a zoom left out of a piece was gone for good. The zooms
 * now belong to the media (Asset.zooms), in its own seconds; this moves them there, joined by
 * id, so nothing that any clip showed or could show again is lost.
 */
export function moveZoomsToMedia(stored: StoredProject): Project {
  const moved = new Map<string, Zoom[]>();
  let legacy = false;
  const clips = stored.clips.map((c) => {
    if (!("zooms" in c)) return c;
    legacy = true;
    const { zooms, ...rest } = c;
    if (zooms?.length) moved.set(c.assetId, unionById(moved.get(c.assetId) ?? [], zooms));
    return rest;
  });
  if (!legacy) return stored;
  const assets = stored.assets.map((a) => {
    const zooms = moved.get(a.id);
    return zooms ? { ...a, zooms: unionById(a.zooms ?? [], zooms) } : a;
  });
  return { ...stored, clips, assets };
}

/**
 * The drawing of a take was kept on each of its clips (every page, every kept stretch carried all
 * of it); it now lives once on its media (Asset.drawing). This moves it there and makes it sound:
 * a moment that fell before 0 (an "apagar tudo" before the first stroke) is put back at the start.
 */
export function moveDrawingsToMedia(stored: StoredProject, p: Project): Project {
  const moved = new Map<string, Drawing>();
  const legacy = new Map<string, Annotation>();
  for (const c of stored.clips) {
    if (!c.annotation || !("drawing" in c.annotation)) continue;
    const { drawing, ...annotation } = c.annotation;
    legacy.set(c.id, annotation);
    if (drawing && !moved.has(c.assetId)) moved.set(c.assetId, drawing);
  }
  if (!legacy.size && !p.assets.some((a) => a.drawing)) return p;
  const clips = p.clips.map((c) => {
    const annotation = legacy.get(c.id);
    return annotation ? { ...c, annotation } : c;
  });
  const assets = p.assets.map((a) => {
    const drawing = a.drawing ?? moved.get(a.id);
    return drawing ? { ...a, drawing: sanitizeDrawing(drawing) } : a;
  });
  return { ...p, clips, assets };
}

/** Everything a project read from disk goes through before the editor uses it. */
export const normalizeProject = (stored: StoredProject): Project =>
  moveDrawingsToMedia(stored, moveZoomsToMedia(stored));
