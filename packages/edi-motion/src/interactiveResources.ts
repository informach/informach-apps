import type { AudioAsset } from "./assets/model";
import type { InteractiveDocument } from "./interactiveDocument";
/** Older blueprints carried PCM alone. Portable v6 owns all resources once at
 * the root; adapters must not grow a second catalog or copy blobs per scope. */
export function documentAudioAssets(document: InteractiveDocument): readonly AudioAsset[] {
  return document.assets
    ? document.assets.filter((asset): asset is AudioAsset => asset.kind === "audio")
    : (document.audioAssets ?? []);
}
