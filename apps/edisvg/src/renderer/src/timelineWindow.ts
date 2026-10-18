import type { Track } from "@informach/edi-motion";

export const TIMELINE_KEY_SPACING = 24;
/** Binary-search a sorted channel, then bound glyphs by visible screen pixels.
 * Dense keys remain in the document; zooming separates their glyphs. */
export function timelineWindow(
  track: { keys: readonly Track["keys"][number][] },
  start: number,
  end: number,
  width: number,
  frames: number,
  selected: ReadonlySet<string>,
) {
  let low = 0,
    high = track.keys.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const key = track.keys[middle];
    if (key && key.frame < start) low = middle + 1;
    else high = middle;
  }
  const entries: { key: Track["keys"][number]; count: number; pixel: number }[] = [];
  let total = 0;
  for (let i = low; i < track.keys.length; i++) {
    const key = track.keys[i];
    if (!key || key.frame > end) break;
    total++;
    const pixel = (key.frame / frames) * width,
      entry = entries.at(-1);
    if (!entry || pixel - entry.pixel >= TIMELINE_KEY_SPACING)
      entries.push({ key, count: 1, pixel });
    else {
      entry.count++;
      if (selected.has(key.id)) {
        entry.key = key;
        entry.pixel = pixel;
      }
    }
  }
  return { entries, total };
}
