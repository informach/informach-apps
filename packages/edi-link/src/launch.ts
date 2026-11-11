import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Opening another Edi tool from one of them (main process). Installed, the tool's executable
 * where the Hub installs it; already open, it only comes to the front (each tool runs once). In
 * development, the development Hub's script (`scripts/edi/hub-dev/abrir.ps1`, which runs
 * `pnpm edi:work <tool>`: a build of the repository, licensed, on the real profile); already
 * open, it stops at once. Either way the request goes by file (contract.ts), so it reaches the
 * tool however it was opened.
 */

export interface ToolLauncher {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** The file that must be there for the launch to work (the app, or the script). */
  needs: string;
  /** The launcher's own console stays hidden (the tool's window shows). */
  hidden: boolean;
}

/** A tool where the Hub installs it (packages/edi-desktop/src/installations.ts). */
export const toolExecutable = (localAppData: string, name: string): string =>
  join(localAppData, "Programs", "Edi", name, `${name}.exe`);

export function toolLauncher(
  tool: { id: string; name: string },
  where: { packaged: boolean; localAppData: string; repository: string },
): ToolLauncher {
  if (where.packaged) {
    const exe = toolExecutable(where.localAppData, tool.name);
    return { command: exe, args: [], needs: exe, hidden: false };
  }
  const script = join(where.repository, "scripts", "edi", "hub-dev", "abrir.ps1");
  return {
    command: "powershell.exe",
    args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Ferramenta", tool.id],
    cwd: where.repository,
    needs: script,
    hidden: true,
  };
}

/**
 * The environment a tool starts with: the caller's, without what belongs to it alone
 * (Electron's own variables, Node's options, the suite's license and profile settings of a
 * development build), so the opened tool sets its own.
 */
export function launchEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env))
    if (
      value !== undefined &&
      !name.startsWith("EDI_") &&
      !name.startsWith("ELECTRON_") &&
      !name.endsWith("_USER_DATA") &&
      !name.startsWith("npm_") &&
      !["NODE_OPTIONS", "EDICAPTURA_TEST_PROFILE"].includes(name)
    )
      out[name] = value;
  return out;
}

/**
 * Whether a tool may open another for a request: installed, always; in development only on the
 * real profile (`pnpm edi:work`, `%APPDATA%\<caller>`), the one the other tool's `edi:work`
 * pairs with. A throwaway development profile (`edi:open`, `pnpm dev`) would start a tool that
 * reads requests and renders elsewhere.
 */
export const canOpenTool = (
  packaged: boolean,
  userData: string,
  appData: string,
  caller: string,
): boolean => packaged || userData.toLowerCase() === join(appData, caller).toLowerCase();

/** Starts a tool with `launcher`. False when it is not there or did not start. */
export async function openTool(launcher: ToolLauncher): Promise<boolean> {
  if (!existsSync(launcher.needs)) return false;
  try {
    const child = spawn(launcher.command, launcher.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: launcher.hidden,
      ...(launcher.cwd ? { cwd: launcher.cwd } : {}),
      ...(launcher.env ? { env: launcher.env } : {}),
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
