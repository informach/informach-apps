import { newId } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { create } from "zustand";
import { useProject } from "@/state/project";

/** Videos asked for this session: one request each, even when it fails. */
const asked = new Set<string>();

/**
 * Filmstrips seen on disk this session, by their first sheet. A lesson opened on another
 * computer (or after the cache was cleared) knows its filmstrips but not their files: until the
 * main process confirms or makes them again, the clips show the video's thumbnail.
 */
export const useFilmstrips = create<{ ready: Record<string, true> }>(() => ({ ready: {} }));

/**
 * The small pictures of a video for its clips on the timeline (media:filmstrip), made in the
 * background one video at a time and kept beside the media; the clips show the video's
 * thumbnail until then. Decodes the proxy when it is ready. A filmstrip the lesson already knows
 * is asked for too: the main process answers at once when its sheets are there and makes again
 * the ones that are gone.
 */
export async function ensureFilmstrip(asset: Asset): Promise<void> {
  if (
    asset.kind !== "video" ||
    !asset.hasVideo ||
    asset.missing ||
    asset.generated ||
    !(asset.duration > 0) ||
    asked.has(asset.path)
  )
    return;
  asked.add(asset.path);
  const input = asset.proxyStatus === "ready" && asset.proxy ? asset.proxy : asset.path;
  try {
    const filmstrip = await window.api.filmstrip(newId("strip"), asset.path, input, asset.duration);
    if (JSON.stringify(filmstrip) !== JSON.stringify(asset.filmstrip))
      useProject.getState().patchAsset(asset.id, { filmstrip });
    useFilmstrips.setState((s) => ({ ready: { ...s.ready, [filmstrip.path]: true } }));
  } catch (err) {
    console.warn("filmstrip not made", asset.path, err);
  }
}

/** Every video of the open lesson whose filmstrip is not confirmed yet. */
export function ensureFilmstrips(): void {
  for (const asset of useProject.getState().project?.assets ?? []) void ensureFilmstrip(asset);
}
