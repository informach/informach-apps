import { compareReleaseVersions } from "@informach/edi-contracts";
import type { Installation } from "../../shared/hub";
export function installationAction(
  installation: Installation | undefined,
): "open" | "install" | "update" {
  if (!installation?.installed || !installation.version) return "install";
  if (
    installation.available &&
    compareReleaseVersions(installation.available, installation.version) > 0
  )
    return "update";
  return "open";
}
