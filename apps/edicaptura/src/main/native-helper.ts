import { join } from "node:path";
import { configureWindowsCapture } from "@informach/edi-desktop/windows-capture";

/** Built by scripts/build-native-helper.mjs from @informach/edi-native; the installer declares it. */
export const NATIVE_HELPER = "edicaptura-helper.exe";

/**
 * Subprocesses cannot run from inside the ASAR archive: the installer puts the helper in
 * resources/native, and development builds it into the app's own resources/native.
 */
export function nativeHelperPath(
  app: { isPackaged: boolean; getAppPath(): string },
  resourcesPath: string = process.resourcesPath,
): string {
  return app.isPackaged
    ? join(resourcesPath, "native", NATIVE_HELPER)
    : join(app.getAppPath(), "resources", "native", NATIVE_HELPER);
}

let configured: string | null = null;

/** Main process, at startup: capture bridge and file clipboard use this one executable. */
export function useNativeHelper(path: string): void {
  configureWindowsCapture({ helper: path });
  configured = path;
}

export function nativeHelper(): string {
  if (!configured) throw new Error("O auxiliar nativo do EdiCaptura não foi configurado.");
  return configured;
}
