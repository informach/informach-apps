import originalFs from "original-fs";
import type { InstallationFileSystem } from "./installation-integrity";

/** Read the signed installation's physical bytes, including complete ASAR archives. */
export const electronInstallationFileSystem: InstallationFileSystem = {
  ...originalFs.promises,
  createReadStream: originalFs.createReadStream,
};
