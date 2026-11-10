import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import {
  HANDOFF_FOLDER,
  HANDOFF_REQUEST,
  handoffRequestSchema,
} from "../shared/edisvgAnimations.ts";

/**
 * "Animar no EdiSVG": the open lesson goes to EdiSVG as the package its pipelines take (the ZIP
 * of Empacotar a aula, with only the media the timeline uses), in this profile's
 * `para-o-edisvg/`, with `pedido.json` written last: a request there means its package is whole.
 * EdiSVG reads the request when it opens or comes back to the front (its lessonRequest.ts) and
 * opens the lesson's own project (a .edisvg beside the lesson, made the first time) with its
 * pipelines and the lesson chosen; the animation comes back by its "Enviar animações para a
 * aula" (edisvgInbox.ts).
 */

/**
 * Packages kept: the new one. EdiSVG keeps its own link to each package it takes (its
 * lessonRequest.ts keepPackage), so cleaning here never removes one its pipelines are reading.
 */
const KEEP = 1;
const PACKAGE = /^aula-[\w-]{1,100}-(\d{13})\.zip(\.part)?$/;

/** The lesson's EdiSVG project: beside the lesson file, with its name (`aula.edisvg`). */
export function lessonProject(lessonPath: string): string | undefined {
  if (!isAbsolute(lessonPath) || extname(lessonPath).toLowerCase() !== ".ediaula") return undefined;
  return join(dirname(lessonPath), `${basename(lessonPath, extname(lessonPath))}.edisvg`);
}

/** Packs the lesson with `pack` and leaves the request for EdiSVG. Returns the package's path. */
export async function handOffLesson(
  userData: string,
  lesson: { id: string; name: string; project?: string },
  pack: (out: string) => Promise<unknown>,
  now = Date.now(),
): Promise<string> {
  const folder = join(userData, HANDOFF_FOLDER);
  const file = `aula-${lesson.id}-${now}.zip`;
  const request = handoffRequestSchema.parse({
    version: 1,
    lessonId: lesson.id,
    name: lesson.name.trim().slice(0, 200) || "Aula",
    file,
    sentAt: now,
    ...(lesson.project ? { project: lesson.project } : {}),
  });
  await mkdir(folder, { recursive: true });
  const out = join(folder, file);
  // Packed beside its name: a package stopped half way never has the name a request lists.
  const part = `${out}.part`;
  try {
    await pack(part);
    await rename(part, out);
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
  await atomicWrite(join(folder, HANDOFF_REQUEST), JSON.stringify(request));
  // Older packages go, and so does a half-made one a crash left behind.
  const packages = (await readdir(folder))
    .flatMap((name) => {
      const match = PACKAGE.exec(name);
      return match ? [{ name, at: Number(match[1]), part: !!match[2] }] : [];
    })
    .sort((a, b) => b.at - a.at);
  const kept = packages.filter((p) => !p.part).slice(0, KEEP);
  for (const p of packages)
    if (!kept.includes(p)) await rm(join(folder, p.name), { force: true }).catch(() => undefined);
  return out;
}

/** EdiSVG where the Hub installs it (packages/edi-desktop/src/installations.ts). */
export const edisvgExecutable = (localAppData: string): string =>
  join(localAppData, "Programs", "Edi", "EdiSVG", "EdiSVG.exe");

export interface EdisvgLauncher {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** The file that must be there for the launch to work (the app, or the script). */
  needs: string;
  /** The launcher's own console stays hidden (EdiSVG's window shows). */
  hidden: boolean;
}

/**
 * The environment EdiSVG starts with: this app's, without what belongs to it alone (Electron's
 * own variables, Node's options, the suite's license and profile settings of a development
 * build), so the opened EdiSVG sets its own.
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
 * Whether this EdiAula can open EdiSVG for its request: an installed one, or in development one
 * on the real profile (`pnpm edi:work`), the one the EdiSVG of `edi:work` reads. A development
 * run on a throwaway profile (`edi:open`, `pnpm dev`) leaves its request where no EdiSVG looks.
 */
export const canOpenEdisvg = (packaged: boolean, userData: string, appData: string): boolean =>
  packaged || userData.toLowerCase() === join(appData, "ediaula").toLowerCase();

/**
 * How EdiSVG is opened: the installed app, or in development the development Hub's script
 * (`scripts/edi/hub-dev/abrir.ps1`, which runs `pnpm edi:work edisvg`: a build of the
 * repository, licensed, on the real profile, its log in `.cache/edi-work/registros`). Already
 * open, the installed app only comes to the front (it runs once) and the script stops at once;
 * either way the open EdiSVG sees the request and comes to the front by itself.
 */
export function edisvgLauncher(
  packaged: boolean,
  localAppData: string,
  repository: string,
): EdisvgLauncher {
  if (packaged) {
    const exe = edisvgExecutable(localAppData);
    return { command: exe, args: [], needs: exe, hidden: false };
  }
  const script = join(repository, "scripts", "edi", "hub-dev", "abrir.ps1");
  return {
    command: "powershell.exe",
    args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Ferramenta", "edisvg"],
    cwd: repository,
    needs: script,
    hidden: true,
  };
}

/** Opens EdiSVG with `launcher`. False when it is not there or did not start. */
export async function openEdisvg(launcher: EdisvgLauncher): Promise<boolean> {
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
