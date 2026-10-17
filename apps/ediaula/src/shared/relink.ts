import type { Asset, ProbeResult } from "./types.ts";

/** Seconds a found file may differ in length from the missing one (containers round differently). */
export const RELINK_DURATION_TOLERANCE = 0.5;

const seconds = (v: number): string => `${v.toFixed(1).replace(".", ",")} s`;

/** File name of a media path, Windows or POSIX. */
export const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/**
 * Why a found file cannot stand in for a missing media, or null when it is the same media:
 * same kind, the same length (±0.5 s) and the same frame size. Cuts, zooms, cursor and
 * captions are in the media's own time and pixels, so anything else would shift them.
 */
export function relinkMismatch(asset: Asset, found: ProbeResult): string | null {
  if (found.kind !== asset.kind) return "o tipo de mídia é diferente";
  if (
    asset.kind !== "image" &&
    Math.abs(found.duration - asset.duration) > RELINK_DURATION_TOLERANCE
  )
    return `a duração é diferente (${seconds(found.duration)} em vez de ${seconds(asset.duration)})`;
  if (found.width !== asset.width || found.height !== asset.height)
    return `o tamanho do quadro é diferente (${found.width}×${found.height} em vez de ${asset.width}×${asset.height})`;
  return null;
}
