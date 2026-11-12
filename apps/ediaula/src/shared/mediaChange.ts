import type { Asset } from "./types.ts";

/** A media file as it is on disk now: bytes and last change (ms), or null when it is not there. */
export interface FileStat {
  size: number;
  mtime: number;
}

/**
 * Whether a media file was changed in place (same name, new content: a new export over the old
 * one), from what the lesson kept of it:
 * - "changed": another size, or another date than the one kept;
 * - "record": same size, and the lesson never kept the date (media brought in before 11/11/2026):
 *   the date is only written down, nothing is done;
 * - "same": as the lesson knows it.
 * Dates within a second are the same (file systems and copies round them).
 */
export function diskChange(
  asset: Pick<Asset, "size" | "mtime">,
  stat: FileStat,
): "changed" | "record" | "same" {
  if (stat.size !== asset.size) return "changed";
  if (asset.mtime === undefined) return "record";
  return Math.abs(stat.mtime - asset.mtime) > 1000 ? "changed" : "same";
}

/**
 * Media whose file the person may change outside: not the pictures the editor makes itself, nor
 * an animation linked to EdiSVG (its renders come through the link, lib/edisvgLink.ts).
 */
export const watchable = (a: Asset): boolean => !a.missing && !a.generated && !a.link && !!a.path;
