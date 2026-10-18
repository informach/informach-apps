import { pruneGroups } from "./groups.ts";
import { applyMagnetic } from "./magnetic.ts";
import { followMarkers } from "./markers.ts";
import type { Project } from "./types.ts";

/**
 * What every commit goes through after its change (state/project.ts): magnetic tracks packed
 * (shared/magnetic.ts), groups left with one clip dissolved (shared/groups.ts), and the markers
 * moved with the media they mark (shared/markers.ts), unless the change set the markers itself.
 */
export function settle(before: Project, changed: Project): Project {
  let next = applyMagnetic(changed);
  const clips = pruneGroups(next.clips);
  if (clips !== next.clips) next = { ...next, clips };
  if (next.markers?.length && next.markers === before.markers && next.clips !== before.clips) {
    const markers = followMarkers(before, next, next.markers);
    if (markers !== next.markers) next = { ...next, markers };
  }
  return next;
}
