import { sourceEnd } from "./clipTime.ts";
import { zoomsWithin } from "./pieces.ts";
import type { Clip, Project } from "./types.ts";

/**
 * Projects saved before every cut went through pieces.ts carry, on each piece of a recording,
 * all the zooms of the whole recording. That is invisible (a zoom only acts inside its own
 * stretch of the source) but makes the file and every IPC call grow with the number of cuts.
 * compactProject() keeps on each clip only the zooms it can show, which is exactly what the
 * preview and the export use. Untouched clips stay the same objects.
 */
export function compactProject(project: Project): Project {
  let changed = false;
  const clips = project.clips.map((c): Clip => {
    if (!c.zooms) return c;
    const kept = zoomsWithin(c.zooms, c.in, sourceEnd(c));
    if (kept.length === c.zooms.length) return c;
    changed = true;
    const { zooms: _all, ...rest } = c;
    return kept.length ? { ...rest, zooms: kept } : rest;
  });
  return changed ? { ...project, clips } : project;
}

/** Everything a project read from disk goes through before the editor uses it. */
export const normalizeProject = (project: Project): Project => compactProject(project);
