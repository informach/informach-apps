import type { Annotation } from "./annotation.ts";
import type { Asset, ProbeResult, Project } from "./types.ts";

/**
 * How a picture the editor made is drawn again when its file is gone (cleaned up, or a project
 * brought from another computer, where the app's cache is not): an annotation from its clip, the
 * blank picture of zoom layers, a held frame from its source media at the same second (with the
 * pointer and the zoom it had). Null when it cannot be: nothing left to draw it from.
 */
export type Redraw =
  | { how: "annotation"; annotation: Annotation }
  | { how: "effect" }
  | { how: "still"; source: Asset; t: number };

export function redrawPlan(
  project: Pick<Project, "assets" | "clips">,
  asset: Pick<Asset, "id" | "generated" | "still">,
): Redraw | null {
  if (asset.generated === "annotation") {
    const annotation = project.clips.find(
      (c) => c.assetId === asset.id && c.annotation,
    )?.annotation;
    return annotation ? { how: "annotation", annotation } : null;
  }
  if (asset.generated === "effect") return { how: "effect" };
  if (asset.generated === "still" && asset.still) {
    const { assetId, t } = asset.still;
    const source = project.assets.find((a) => a.id === assetId);
    // The source has to be there itself (and, for a cut-out avatar, its transparent copy).
    if (!source || source.missing || source.kind !== "video") return null;
    if (source.key && (!source.keyed || source.keyStatus !== "ready")) return null;
    return { how: "still", source, t };
  }
  return null;
}

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
export function relinkMismatch(
  asset: Pick<Asset, "kind" | "duration" | "width" | "height">,
  found: ProbeResult,
): string | null {
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
