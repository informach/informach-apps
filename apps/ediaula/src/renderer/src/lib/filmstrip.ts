import { newId } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { useProject } from "@/state/project";

/** Videos asked for this session: one request each, even when it fails. */
const asked = new Set<string>();

/**
 * The small pictures of a video for its clips on the timeline (media:filmstrip), made in the
 * background one video at a time and kept beside the media; the clips show its first picture
 * until then. Decodes the proxy when it is ready.
 */
export async function ensureFilmstrip(asset: Asset): Promise<void> {
  if (
    asset.kind !== "video" ||
    !asset.hasVideo ||
    asset.missing ||
    asset.generated ||
    asset.filmstrip ||
    !(asset.duration > 0) ||
    asked.has(asset.path)
  )
    return;
  asked.add(asset.path);
  const input = asset.proxyStatus === "ready" && asset.proxy ? asset.proxy : asset.path;
  try {
    const filmstrip = await window.api.filmstrip(newId("strip"), asset.path, input, asset.duration);
    useProject.getState().patchAsset(asset.id, { filmstrip });
  } catch (err) {
    console.warn("filmstrip not made", asset.path, err);
  }
}

/** Every video of the open lesson that has no filmstrip yet. */
export function ensureFilmstrips(): void {
  for (const asset of useProject.getState().project?.assets ?? []) void ensureFilmstrip(asset);
}
