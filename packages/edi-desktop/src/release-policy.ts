import { compareReleaseVersions, type ReleaseManifest } from "@informach/edi-contracts";
import type { Vault } from "./vault";

/** Every consumer must apply this AFTER signature verification and BEFORE
 * exposing or downloading artifacts. The protected floor is shared by all apps. */
export function createReleaseAcceptance(options: {
  vault: Vault;
  currentVersion: string;
  channel: "stable" | "beta";
}) {
  return async (manifest: ReleaseManifest): Promise<void> => {
    if (manifest.channel !== options.channel) throw new Error("Canal de atualização incompatível.");
    if (compareReleaseVersions(manifest.version, options.currentVersion) < 0)
      throw new Error("A versão instalada não pode ser substituída por uma versão antiga.");
    await options.vault.use(async (data) => {
      const floor = data.updateFloors[options.channel];
      if (floor && compareReleaseVersions(manifest.version, floor) < 0)
        throw new Error("O catálogo tentou regredir para uma versão antiga.");
      if (!floor || compareReleaseVersions(manifest.version, floor) > 0)
        data.updateFloors[options.channel] = manifest.version;
    });
  };
}
