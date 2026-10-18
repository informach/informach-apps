import { join } from "node:path";
import { app } from "electron";

/** Subprocesses cannot read Electron's ASAR virtual filesystem. */
export function nativeResourcePath(name: "fonts" | "native/ediaula-helper.exe") {
  return app.isPackaged
    ? join(process.resourcesPath, name)
    : join(app.getAppPath(), "resources", name);
}
