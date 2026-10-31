import {
  type Affine,
  type Animation,
  createPlaybackContext,
  evaluatePlaybackFrame,
  type PlaybackContext,
  type PlaybackDocument,
  transformAttribute,
} from "@informach/edi-motion";
import { geometryPath } from "@informach/edi-motion/geometry";
import { paintLayerPaths, writeShapePath } from "@informach/edi-motion/graphics";

const contexts = new WeakMap<PlaybackDocument, PlaybackContext>();

/** Workspace overlay only: real neighboring poses, no IDs or hit targets. */
export function paintOnionSkin(
  svg: SVGSVGElement,
  playback: PlaybackDocument,
  clip: Animation,
  frame: number,
  enabled: boolean,
  prefixes?: ReadonlyMap<string, Affine>,
  baseDisplays?: ReadonlyMap<string, string | null>,
) {
  for (const element of svg.querySelectorAll("[data-onion-skin]")) element.remove();
  if (!enabled) return;
  const artwork = svg.querySelector("[data-scene-motion]");
  if (!artwork) return;
  const bases = new Map(playback.objects.map((object) => [object.id, object.transform]));
  let context = contexts.get(playback);
  if (!context) {
    context = createPlaybackContext(playback);
    contexts.set(playback, context);
  }
  for (const delta of [-1, 1]) {
    const time = frame + delta;
    if (time < 0 || time > clip.frames) continue;
    const clone = artwork.cloneNode(true);
    if (!(clone instanceof SVGGElement)) continue;
    for (const helper of clone.querySelectorAll("[data-edi-rig-overlay]")) helper.remove();
    const evaluated = evaluatePlaybackFrame(context, clip, time, prefixes),
      pose = evaluated.poses;
    clone.setAttribute("data-onion-skin", String(delta));
    clone.setAttribute("aria-hidden", "true");
    clone.setAttribute("class", `onion-skin ${delta < 0 ? "previous" : "next"}`);
    for (const element of clone.querySelectorAll("[data-object],[data-edi-object]")) {
      const id = element.getAttribute("data-object") ?? element.getAttribute("data-edi-object"),
        base = id ? bases.get(id) : undefined;
      if (base) {
        const transform = { ...base, ...pose.get(id ?? "") };
        element.setAttribute("transform", transformAttribute(transform));
        element.setAttribute("opacity", String(transform.opacity / 100));
        const geometry = evaluated.geometry.get(id ?? ""),
          shape = element.firstElementChild;
        if (id && shape?.localName === "path")
          writeShapePath(
            shape,
            geometry ? geometryPath(geometry) : shape.getAttribute("d"),
            paintLayerPaths(evaluated.geometry, id),
          );
        if (evaluated.visibility.get(id ?? "") === false) element.setAttribute("display", "none");
        else {
          const display = baseDisplays?.get(id ?? "");
          if (display === null || display === undefined) element.removeAttribute("display");
          else element.setAttribute("display", display);
        }
      }
      element.removeAttribute("data-object");
      element.removeAttribute("data-edi-object");
    }
    clone.removeAttribute("data-scene-motion");
    svg.insertBefore(clone, artwork);
  }
}
