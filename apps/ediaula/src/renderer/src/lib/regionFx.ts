import { DEFAULT_REGION, type RegionKind } from "@shared/look";
import { newId, newTrackName, placeClips } from "@shared/timeline";
import type { Asset, Clip, Track } from "@shared/types";
import { usePlayback } from "@/state/playback";
import { type Commit, personCommit, useProject } from "@/state/project";
import { blankPicture } from "./zoomLayer";

/**
 * Adds a region effect (blur, pixelate or spotlight) at the playhead, on a new track on top, so
 * it covers every track below; like a zoom layer it shows nothing of its own. One undo step.
 */
export async function addRegionFx(
  kind: RegionKind,
  opts: { at?: number; duration?: number } = {},
  commit: Commit = personCommit,
): Promise<string | null> {
  const p = useProject.getState().project;
  if (!p) return null;
  const path = await blankPicture();
  const asset: Asset = {
    id: newId("a"),
    name: kind === "spotlight" ? "Holofote" : kind === "pixelate" ? "Pixelado" : "Desfoque",
    path,
    kind: "image",
    duration: 0,
    width: 1,
    height: 1,
    fps: 0,
    hasVideo: true,
    hasAudio: false,
    size: 1,
    proxyStatus: "none",
    generated: "effect",
  };
  const start = Math.max(0, opts.at ?? usePlayback.getState().time);
  const id = newId("c");
  commit((q) => {
    const track: Track = {
      id: newId("t"),
      kind: "video",
      name: newTrackName(q.tracks),
      muted: false,
      hidden: false,
      locked: false,
    };
    const clip: Clip = {
      id,
      assetId: asset.id,
      trackId: track.id,
      start,
      in: 0,
      duration: opts.duration ?? 5,
      volume: 0,
      regionFx: {
        ...DEFAULT_REGION,
        kind,
        ...(kind === "spotlight" ? { rect: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 }, feather: 30 } : {}),
      },
    };
    return {
      ...q,
      tracks: [track, ...q.tracks],
      assets: [...q.assets, asset],
      clips: placeClips(q.clips, [clip]),
    };
  });
  useProject.getState().select([id]);
  return id;
}
