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

/**
 * Lessons saved before the sound taken out of a video was marked (Clip.soundOnly): that clip is
 * a clip of the video, on a sound track, in the group of the silent video it came from. It is
 * marked now, so it plays only its sound and the picture is drawn once, by the video.
 */
export function markDetachedSound(p: Project): Project {
  const sound = new Set(p.tracks.filter((t) => t.kind === "audio").map((t) => t.id));
  const video = new Set(p.assets.filter((a) => a.kind === "video").map((a) => a.id));
  // Groups with a silent clip of a video, by group and media.
  const silent = new Set(
    p.clips
      .filter((c) => c.groupId && c.volume <= 0 && video.has(c.assetId) && !sound.has(c.trackId))
      .map((c) => `${c.groupId}|${c.assetId}`),
  );
  if (!silent.size) return p;
  let changed = false;
  const clips = p.clips.map((c) => {
    if (
      c.soundOnly ||
      !c.groupId ||
      !sound.has(c.trackId) ||
      !silent.has(`${c.groupId}|${c.assetId}`)
    )
      return c;
    changed = true;
    return { ...c, soundOnly: true };
  });
  return changed ? { ...p, clips } : p;
}

/**
 * "Revisar a gravação" came in as the first step of Preparar aula after lessons went through it:
 * a lesson that already decided a step goes on where it was, as if that new step was left out.
 */
export function skipNewFirstStep(p: Project): Project {
  const prepare = p.prepare;
  if (!prepare || prepare.decisions.recording || !Object.keys(prepare.decisions).length) return p;
  return {
    ...p,
    prepare: {
      ...prepare,
      decisions: { recording: "skipped", ...prepare.decisions },
      notes: { recording: "Etapa nova, depois desta aula.", ...prepare.notes },
    },
  };
}

/** Everything a project read from disk goes through before the editor uses it. */
export const normalizeProject = (stored: StoredProject): Project =>
  skipNewFirstStep(markDetachedSound(moveDrawingsToMedia(stored, moveZoomsToMedia(stored))));
