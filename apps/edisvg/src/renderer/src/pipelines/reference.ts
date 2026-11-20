/**
 * The demonstration video of a pipeline run, under the artboard of its transparent layer: the
 * person sees the arrows and balloons over what the recording shows, at the same moment. It is a
 * reference, like the narration: never part of the project or of the exports. A file holds one per
 * artboard (a lesson may have several demonstrations, each over its stretch of the screen); a run
 * again on the same artboard replaces its own. They are kept on this computer by project
 * (src/main/pipelineReferences.ts), so the file opened again brings them back. The video starts
 * when the script's stretch starts (`offset` seconds into the animation, the breath before the
 * first sentence).
 *
 * The presenter of a theory lesson is the other kind: her video without the green screen (WebM
 * with alpha) over the artwork, inside the spot the animation keeps for her (`slotId`, an object
 * of the artboard the run animated through the shots). It follows that object frame by frame, so
 * moving the spot or its keys in the editor moves her in the preview too.
 */

export interface ReferenceVideo {
  artboardId: string;
  url: string;
  /** Animation second the video's first frame plays at. */
  offset: number;
  duration: number;
  /** The presenter's spot: the object her video fills, over the artwork (none: under it). */
  slotId?: string;
  /** "video/webm" for the presenter (alpha); the demonstrations are MP4. */
  mediaType?: "video/mp4" | "video/webm";
}

/** The videos of the open file, by artboard, each with its element. */
const parts = new Map<
  string,
  {
    reference: ReferenceVideo;
    video: HTMLVideoElement;
    /** The presenter's: the box over the artwork that clips her video to the artboard. */
    frame?: HTMLDivElement;
  }
>();

/** The video under an artboard: added, or replacing the one that artboard had. */
export function setReferenceVideo(
  value: Omit<ReferenceVideo, "url"> & { bytes: Uint8Array },
): ReferenceVideo {
  dropReferenceVideo(value.artboardId);
  const url = URL.createObjectURL(
    new Blob([value.bytes.slice().buffer], { type: value.mediaType ?? "video/mp4" }),
  );
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
  if (reference.slotId) {
    video.className = "presenter-video";
    const frame = document.createElement("div");
    frame.className = "presenter-frame";
    frame.setAttribute("aria-hidden", "true");
    frame.append(video);
    parts.set(reference.artboardId, { reference, video, frame });
  } else parts.set(reference.artboardId, { reference, video });
  return reference;
}

/** Takes away the video of one artboard. */
export function dropReferenceVideo(artboardId: string): void {
  const part = parts.get(artboardId);
  if (!part) return;
  part.video.pause();
  part.video.remove();
  part.frame?.remove();
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
  for (const [artboardId, { reference, video, frame }] of parts) {
    if (!board || artboardId !== activeArtboardId) {
      if (frame) frame.remove();
      else video.remove();
      continue;
    }
    board.classList.add("has-reference");
    if (frame) {
      if (frame.parentElement !== board) board.append(frame);
      placePresenter(board, video, reference.slotId);
    } else if (video.parentElement !== board) board.prepend(video);
  }
}

/**
 * Puts the presenter's video on her spot: the box of the spot's object as drawn now, in the
 * artboard's own pixels (the board may be zoomed). Hidden while the spot is not in the artboard.
 */
function placePresenter(board: HTMLElement, video: HTMLVideoElement, slotId?: string): void {
  const id = slotId ? CSS.escape(slotId) : "";
  const slot = id ? board.querySelector(`[data-object="${id}"],[data-edi-object="${id}"]`) : null;
  const outer = board.getBoundingClientRect();
  if (!slot || !board.offsetWidth || !outer.width) {
    video.style.display = "none";
    return;
  }
  const zoom = outer.width / board.offsetWidth;
  const box = slot.getBoundingClientRect();
  video.style.display = "";
  video.style.left = `${(box.left - outer.left) / zoom}px`;
  video.style.top = `${(box.top - outer.top) / zoom}px`;
  video.style.width = `${box.width / zoom}px`;
  video.style.height = `${box.height / zoom}px`;
}

/** Keeps the open artboard's video at the animation's second: plays with it, still otherwise. */
export function syncReferenceVideo(
  activeArtboardId: string | null,
  playing: boolean,
  seconds: number,
): void {
  for (const [artboardId, { reference, video, frame }] of parts) {
    if (artboardId !== activeArtboardId) {
      if (!video.paused) video.pause();
      continue;
    }
    const board = frame?.parentElement;
    if (board) placePresenter(board, video, reference.slotId);
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
