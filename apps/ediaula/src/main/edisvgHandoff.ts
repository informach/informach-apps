import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
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
 * opens its pipelines with the lesson chosen; the animation comes back by its "Enviar animações
 * para a aula" (edisvgInbox.ts).
 */

/**
 * Packages kept: the new one. A lesson with its presenter videos packs to hundreds of MB, and
 * EdiSVG works from its own unpacked copy; one it is still reading (Windows keeps an open file)
 * fails to go and goes the next time.
 */
const KEEP = 1;
const PACKAGE = /^aula-[\w-]{1,100}-(\d{13})\.zip(\.part)?$/;

/** Packs the lesson with `pack` and leaves the request for EdiSVG. Returns the package's path. */
export async function handOffLesson(
  userData: string,
  lesson: { id: string; name: string },
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

/**
 * Opens EdiSVG. Already open, it only comes to the front (it runs once), and reads the request
 * there. False when it is not installed or did not start: the request waits for it.
 */
export async function openEdisvg(exe: string): Promise<boolean> {
  if (!existsSync(exe)) return false;
  try {
    const child = spawn(exe, [], { detached: true, stdio: "ignore", windowsHide: false });
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
