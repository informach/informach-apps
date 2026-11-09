/**
 * The demonstration video of a pipeline run, under the artboard of its transparent layer: the
 * person sees the arrows and balloons over what the recording shows, at the same moment. It is a
 * reference, like the narration: never part of the project or of the exports, and it lasts while
 * the file is open. The video starts when the script's stretch starts (`offset` seconds into the
 * animation, the breath before the first sentence).
 */

export interface ReferenceVideo {
  artboardId: string;
  url: string;
  /** Animation second the video's first frame plays at. */
  offset: number;
  duration: number;
}

let current: ReferenceVideo | null = null;
let video: HTMLVideoElement | null = null;

export function setReferenceVideo(
  value: Omit<ReferenceVideo, "url"> & { bytes: Uint8Array },
): ReferenceVideo {
  clearReferenceVideo();
  const url = URL.createObjectURL(new Blob([value.bytes.slice().buffer], { type: "video/mp4" }));
  const { bytes: _bytes, ...rest } = value;
  current = { ...rest, url };
  video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.className = "reference-video";
  video.dataset.reference = "";
  video.setAttribute("aria-hidden", "true");
  return current;
}

export function clearReferenceVideo(): void {
  video?.pause();
  video?.remove();
  video = null;
  if (current) URL.revokeObjectURL(current.url);
  current = null;
}

export const referenceVideo = (): ReferenceVideo | null => current;

/**
 * Puts the video under the artwork of its artboard (moved into the markup each render rebuilds,
 * never reloaded); elsewhere it is taken out.
 */
export function mountReferenceVideo(root: ParentNode, activeArtboardId: string | null): void {
  if (!current || !video) return;
  const board = root.querySelector<HTMLElement>(".scene-artboard");
  if (!board || activeArtboardId !== current.artboardId) {
    video.remove();
    return;
  }
  board.classList.add("has-reference");
  if (video.parentElement !== board) board.prepend(video);
}

/** Keeps the video at the animation's second: plays with it, still otherwise. */
export function syncReferenceVideo(
  activeArtboardId: string | null,
  playing: boolean,
  seconds: number,
): void {
  if (!current || !video || activeArtboardId !== current.artboardId) {
    if (video && !video.paused) video.pause();
    return;
  }
  const at = Math.max(0, Math.min(current.duration, seconds - current.offset));
  if (!playing || seconds < current.offset || at >= current.duration) {
    if (!video.paused) video.pause();
    if (Math.abs(video.currentTime - at) > 0.04) video.currentTime = at;
    return;
  }
  if (Math.abs(video.currentTime - at) > 0.2) video.currentTime = at;
  if (video.paused) void video.play().catch(() => undefined);
}
