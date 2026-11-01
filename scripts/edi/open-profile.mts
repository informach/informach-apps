import { win32 } from "node:path";
import type { DesktopAppId } from "../../packages/edi-contracts/src/index.ts";

/**
 * Where `pnpm edi:open` (test) and `pnpm edi:work` (daily work) keep a tool's own data.
 *
 * - test: a throwaway profile inside the harness root, removed on close, unless
 *   `EDI_OPEN_USER_DATA` names a folder to keep. EdiAula's Documents are inside the profile.
 * - work: the tool's normal profile, `%APPDATA%\<tool>`, the one the installed app (and the
 *   older standalone copies) use, so existing recents, libraries and captures show up. EdiAula
 *   keeps the real Documents (`Documentos\EdiAula\Projetos` and `Gravações`). `EDI_WORK_DATA`
 *   moves the profiles to `EDI_WORK_DATA\<tool>`. Never removed.
 *
 * Paths are Windows paths: the native harness only runs on Windows.
 */
export type OpenMode = "test" | "work";

export type OpenProfile = {
  userData: string;
  /** True when closing the tool keeps this folder. */
  kept: boolean;
  /** Extra variables for the launched tool. */
  environment: Record<string, string>;
};

function inside(parent: string, child: string) {
  const relative = win32.relative(win32.resolve(parent), win32.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !win32.isAbsolute(relative));
}

export function resolveOpenProfile(input: {
  mode: OpenMode;
  id: DesktopAppId;
  env: Readonly<Record<string, string | undefined>>;
  /** %APPDATA%, where the tools keep their profile. */
  appData: string;
  /** The OS temp folder, which Windows may clean on its own. */
  temp: string;
  /** The harness root, removed when the tool closes. */
  harnessRoot: string;
}): OpenProfile {
  const kept = input.env.EDI_OPEN_USER_DATA?.trim();
  if (input.mode === "test") {
    if (kept && !win32.isAbsolute(kept))
      throw new Error("EDI_OPEN_USER_DATA must be an absolute folder");
    return {
      userData: kept || win32.join(input.harnessRoot, "user-data"),
      kept: Boolean(kept),
      environment: {},
    };
  }
  if (kept)
    throw new Error("edi:work uses the tools' own profiles; use EDI_WORK_DATA to move them");
  const root = input.env.EDI_WORK_DATA?.trim() || input.appData;
  if (!win32.isAbsolute(root)) throw new Error("EDI_WORK_DATA must be an absolute folder");
  const userData = win32.join(root, input.id);
  if (inside(input.temp, userData) || inside(input.harnessRoot, userData))
    throw new Error("edi:work data cannot live in the temp folder, which is cleaned up");
  return {
    userData,
    kept: true,
    environment: {
      // native-vault.cjs keeps Chromium's storage at the profile root, as a released app does,
      // instead of the sessionData subfolder the throwaway test profiles use.
      EDI_WORK_PROFILE: "true",
      ...(input.id === "ediaula" ? { EDIAULA_REAL_DOCUMENTS: "true" } : {}),
    },
  };
}
