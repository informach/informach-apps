/**
 * The demonstration video of a pipeline run, under the artboard of its transparent layer: the
 * person sees the arrows and balloons over what the recording shows, at the same moment. It is a
 * reference, like the narration: never part of the project or of the exports. A file holds one per
 * artboard (a lesson may have several demonstrations, each over its stretch of the screen); a run
 * again on the same artboard replaces its own. They are kept on this computer by project
 * (src/main/pipelineReferences.ts), so the file opened again brings them back. The video starts
 * when the script's stretch starts (`offset` seconds into the animation, the breath before the
 * first sentence).
 */

export interface ReferenceVideo {
  artboardId: string;
  url: string;
  /** Animation second the video's first frame plays at. */
  offset: number;
  duration: number;
}

/** The videos of the open file, by artboard, each with its element. */
const parts = new Map<string, { reference: ReferenceVideo; video: HTMLVideoElement }>();

/** The video under an artboard: added, or replacing the one that artboard had. */
export function setReferenceVideo(
  value: Omit<ReferenceVideo, "url"> & { bytes: Uint8Array },
): ReferenceVideo {
  dropReferenceVideo(value.artboardId);
  const url = URL.createObjectURL(new Blob([value.bytes.slice().buffer], { type: "video/mp4" }));
  const { bytes: _bytes, ...rest } = value;
  const reference: ReferenceVideo = { ...rest, url };
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.className = "reference-video";
  video.dataset.reference = "";
  video.setAttribute("aria-hidden", "true");
  parts.set(reference.artboardId, { reference, video });
  return reference;
}

/** Takes away the video of one artboard. */
export function dropReferenceVideo(artboardId: string): void {
  const part = parts.get(artboardId);
  if (!part) return;
  part.video.pause();
  part.video.remove();
  URL.revokeObjectURL(part.reference.url);
  parts.delete(artboardId);
}

/** Takes away every video (another file opened). */
export function clearReferenceVideo(): void {
  for (const artboardId of [...parts.keys()]) dropReferenceVideo(artboardId);
}

export const referenceVideo = (artboardId: string | null): ReferenceVideo | null =>
  (artboardId ? parts.get(artboardId)?.reference : undefined) ?? null;

/**
 * Puts the open artboard's video under its artwork (moved into the markup each render rebuilds,
 * never reloaded); the others are taken out.
 */
export function mountReferenceVideo(root: ParentNode, activeArtboardId: string | null): void {
  const board = root.querySelector<HTMLElement>(".scene-artboard");
  for (const [artboardId, { video }] of parts) {
    if (!board || artboardId !== activeArtboardId) {
      video.remove();
      continue;
    }
    board.classList.add("has-reference");
    if (video.parentElement !== board) board.prepend(video);
  }
}

/** Keeps the open artboard's video at the animation's second: plays with it, still otherwise. */
export function syncReferenceVideo(
  activeArtboardId: string | null,
  playing: boolean,
  seconds: number,
): void {
  for (const [artboardId, { reference, video }] of parts) {
    if (artboardId !== activeArtboardId) {
      if (!video.paused) video.pause();
      continue;
    }
    const at = Math.max(0, Math.min(reference.duration, seconds - reference.offset));
    if (!playing || seconds < reference.offset || at >= reference.duration) {
      if (!video.paused) video.pause();
      if (Math.abs(video.currentTime - at) > 0.04) video.currentTime = at;
      continue;
    }
    if (Math.abs(video.currentTime - at) > 0.2) video.currentTime = at;
    if (video.paused) void video.play().catch(() => undefined);
  }
}
