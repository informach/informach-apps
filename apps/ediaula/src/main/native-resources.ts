import { join } from "node:path";
import { app } from "electron";

/** Subprocesses cannot read Electron's ASAR virtual filesystem. */
export function nativeResourcePath(name: "fonts" | "cursor-hook.ps1" | "guided-input.ps1") {
  return app.isPackaged
    ? join(process.resourcesPath, name)
    : join(app.getAppPath(), "resources", name);
}
