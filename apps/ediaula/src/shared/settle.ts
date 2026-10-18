import { pruneGroups } from "./groups.ts";
import { applyMagnetic } from "./magnetic.ts";
import { followMarkers, type Marker } from "./markers.ts";
import type { Project, PublishInfo } from "./types.ts";

/**
 * What every commit goes through after its change (state/project.ts): magnetic tracks packed
 * (shared/magnetic.ts), groups left with one clip dissolved (shared/groups.ts), and the markers
 * moved with the media they mark (shared/markers.ts), unless the change set the markers itself.
 * The saved chapters and the thumbnail's moment (publish) follow the media the same way.
 */
export function settle(before: Project, changed: Project): Project {
  let next = applyMagnetic(changed);
  const clips = pruneGroups(next.clips);
  if (clips !== next.clips) next = { ...next, clips };
  if (next.markers?.length && next.markers === before.markers && next.clips !== before.clips) {
    const markers = followMarkers(before, next, next.markers);
    if (markers !== next.markers) next = { ...next, markers };
  }
  if (next.publish && next.publish === before.publish && next.clips !== before.clips) {
    const publish = followPublish(before, next, next.publish);
    if (publish !== next.publish) next = { ...next, publish };
  }
  return next;
}

/** publish.chapters and publish.thumbnail.time put back on the moments of the media they had. */
function followPublish(before: Project, after: Project, publish: PublishInfo): PublishInfo {
  const chapters = publish.chapters ?? [];
  const thumb = publish.thumbnail;
  const points: Marker[] = chapters.map((c, i) => ({ id: `c${i}`, t: c.time, label: c.title }));
  if (thumb) points.push({ id: "thumb", t: thumb.time, label: "" });
  if (!points.length) return publish;
  const moved = followMarkers(before, after, points);
  if (moved === points) return publish;
  const at = new Map(moved.map((m) => [m.id, m.t]));
  return {
    ...publish,
    ...(publish.chapters
      ? {
          chapters: chapters
            .map((c, i) => ({ ...c, time: at.get(`c${i}`) ?? c.time }))
            .sort((a, b) => a.time - b.time),
        }
      : {}),
    ...(thumb ? { thumbnail: { ...thumb, time: at.get("thumb") ?? thumb.time } } : {}),
  };
}
