import type { DesktopAppId, ReleaseManifest } from "@informach/edi-contracts";
import type { UpdateInfo } from "electron-updater";
import { fileDigest } from "./installation-integrity";

/** Accept only the currently approved artifact, including the final quit-time check. */
export function createUpdateApproval(appId: DesktopAppId) {
  let approved: { version: string; artifact: ReleaseManifest["artifacts"][number] } | undefined;
  return {
    approve(manifest: ReleaseManifest): UpdateInfo {
      const artifact = manifest.artifacts.find((item) => item.appId === appId);
      if (!artifact) throw new Error("The suite release is incomplete");
      approved = { version: manifest.version, artifact: { ...artifact } };
      return {
        version: manifest.version,
        releaseDate: manifest.publishedAt,
        releaseNotes: manifest.notes,
        path: artifact.url,
        sha512: artifact.sha512,
        files: [{ url: artifact.url, sha512: artifact.sha512, size: artifact.size }],
      };
    },
    resolveFiles(info: UpdateInfo) {
      const artifact = approved?.artifact;
      if (
        !artifact ||
        approved?.version !== info.version ||
        info.files.length !== 1 ||
        info.files[0]?.url !== artifact.url ||
        info.files[0]?.sha512 !== artifact.sha512 ||
        info.files[0]?.size !== artifact.size
      )
        throw new Error("Update metadata was not approved by our signing key");
      return [
        {
          url: new URL(artifact.url),
          info: { url: artifact.url, sha512: artifact.sha512, size: artifact.size },
        },
      ];
    },
    async verify(path: string): Promise<string | null> {
      const current = approved;
      if (!current) return "Nenhuma versão foi aprovada para este instalador.";
      try {
        const digest = await fileDigest(path);
        return approved === current &&
          current.artifact.size === digest.size &&
          current.artifact.sha512 === digest.sha512
          ? null
          : "O instalador não corresponde à versão atualmente aprovada da suíte.";
      } catch {
        return "Não foi possível verificar o instalador da suíte.";
      }
    },
  };
}
