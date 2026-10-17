import type { DesktopAppId, ReleaseManifest } from "@informach/edi-contracts";
import { fetchPublicRelease, type PublicReleaseConfig } from "@informach/edi-releases/public";
import { NsisUpdater, Provider, type UpdateInfo } from "electron-updater";
import type { ProviderRuntimeOptions } from "electron-updater/out/providers/Provider";
import { createUpdateApproval } from "./update-approval";

// This is a marker for our mandatory verifier hook, not an Authenticode publisher claim.
export const UPDATE_VERIFIER_MARKER = "edi-manifest-v1";
export function createSignedUpdater(
  options: PublicReleaseConfig & {
    appId: DesktopAppId;
    acceptRelease: (manifest: ReleaseManifest) => Promise<void>;
  },
) {
  const approval = createUpdateApproval(options.appId);
  class SignedGithubProvider extends Provider<UpdateInfo> {
    constructor(_configuration: unknown, _updater: NsisUpdater, runtime: ProviderRuntimeOptions) {
      super({ ...runtime, isUseMultipleRangeRequest: false });
    }
    async getLatestVersion(): Promise<UpdateInfo> {
      const manifest = await fetchPublicRelease(options);
      if (!manifest) throw new Error("Nenhuma versão completa foi publicada no GitHub.");
      await options.acceptRelease(manifest);
      return approval.approve(manifest);
    }
    resolveFiles(info: UpdateInfo) {
      return approval.resolveFiles(info);
    }
  }
  const updater = new NsisUpdater({ provider: "custom", updateProvider: SignedGithubProvider });
  updater.verifyUpdateCodeSignature = (_markers, path) => approval.verify(path);
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = options.channel === "beta";
  updater.allowDowngrade = false;
  updater.autoRunAppAfterInstall = false;
  updater.disableDifferentialDownload = true;
  updater.disableWebInstaller = true;
  return updater;
}
