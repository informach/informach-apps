import { newId, newTrackName, placeClips } from "@shared/timeline";
import type { Asset, Clip, Track } from "@shared/types";
import { DEFAULT_ZOOM_LAYER, editLayer, type ZoomLayer } from "@shared/zoomLayer";
import { usePlayback } from "@/state/playback";
import { type Commit, personCommit, useProject } from "@/state/project";

let blank: Promise<string> | null = null;

/** The blank picture written again (its file was deleted): same name, so every layer finds it. */
export function restoreBlankPicture(): Promise<string> {
  blank = null;
  return blankPicture();
}

/** A 1 × 1 transparent picture: zoom layers need an asset but show nothing themselves. */
export function blankPicture(): Promise<string> {
  blank ??= (async () => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), "image/png"));
    return window.api.saveGenerated(new Uint8Array(await blob.arrayBuffer()), "png");
  })();
  return blank;
}

/**
 * Adds a zoom layer at the playhead (or `at`) on a new track on top of everything, so every track
 * zooms. Dragging it to a lower track leaves the tracks above it alone. One undo step.
 */
export async function addZoomLayer(
  opts: { at?: number; duration?: number; zoom?: Partial<ZoomLayer>; trackId?: string } = {},
  commit: Commit = personCommit,
): Promise<string | null> {
  const p = useProject.getState().project;
  if (!p) return null;
  const path = await blankPicture();
  const asset: Asset = {
    id: newId("a"),
    name: "Zoom",
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
    const existing = opts.trackId ? q.tracks.find((t) => t.id === opts.trackId) : undefined;
    const track: Track = existing ?? {
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
      duration: opts.duration ?? 4,
      volume: 1,
      zoomLayer: { ...DEFAULT_ZOOM_LAYER, ...opts.zoom },
    };
    return {
      ...q,
      tracks: existing ? q.tracks : [track, ...q.tracks],
      assets: [...q.assets, asset],
      clips: placeClips(q.clips, [clip]),
    };
  });
  useProject.getState().select([id]);
  return id;
}

export function setZoomLayer(clipId: string, changes: Partial<ZoomLayer>): void {
  useProject.getState().commit((q) => ({
    ...q,
    clips: q.clips.map((c) =>
      c.id === clipId && c.zoomLayer ? { ...c, zoomLayer: editLayer(c, changes) } : c,
    ),
  }));
}

/**
 * The next step after a zoom layer, glued to its end on the same track (like Camtasia's next zoom
 * animation): `pan` moves on to another spot without going back out; `restore` goes back to normal.
 * The current layer stops zooming out, so the next one starts from its view. Two undo steps:
 * the new layer, then the change to the current one.
 */
export async function continueZoom(
  clipId: string,
  step: "pan" | "restore",
): Promise<string | null> {
  const p = useProject.getState().project;
  const c = p?.clips.find((x) => x.id === clipId && x.zoomLayer);
  if (!p || !c) return null;
  const z = c.zoomLayer!;
  setZoomLayer(clipId, { zoomOut: false });
  const at = c.start + c.duration;
  if (step === "restore")
    return addZoomLayer({
      at,
      duration: Math.max(0.3, z.easeOut ?? z.ease ?? 0.6),
      trackId: c.trackId,
      zoom: {
        scale: 1,
        x: 0.5,
        y: 0.5,
        zoomIn: true,
        zoomOut: false,
        easeIn: z.easeOut ?? z.ease ?? 0.6,
      },
    });
  // A new spot across the frame from the current one; the box is then dragged where it should go.
  return addZoomLayer({
    at,
    duration: 3,
    trackId: c.trackId,
    zoom: {
      scale: z.scale,
      x: z.x < 0.5 ? 0.7 : 0.3,
      y: z.y,
      zoomIn: true,
      zoomOut: true,
      easeIn: 0.6,
      easeOut: z.easeOut ?? z.ease ?? 0.6,
    },
  });
}
