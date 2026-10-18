import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { normalizeProject } from "../shared/project-normalize.ts";
import { projectSchema } from "../shared/project-schema.ts";
import { PACKAGE_PROJECT, packPlan, unpackPaths } from "../shared/projectPackage.ts";
import type { Project } from "../shared/types.ts";
import { writeZip } from "./zip.ts";

/**
 * Packing a lesson into one ZIP and opening such a package (shared/projectPackage.ts says what
 * goes in). Opening extracts with tar.exe, which every Windows 10 and 11 has: it never writes
 * outside the folder it is given (no absolute paths, no "..").
 */

const run = promisify(execFile);
const MAX_PROJECT_BYTES = 32 * 1024 * 1024;

/** The archive with the project and its files; every file read is checked first. */
export async function packProject(
  project: Project,
  out: string,
  assertRead: (path: string) => Promise<string>,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<{ files: number; bytes: number }> {
  const plan = packPlan(project);
  const files: { name: string; path: string }[] = [];
  const missing: string[] = [];
  for (const f of plan.files) {
    if (!existsSync(f.path)) {
      missing.push(basename(f.path));
      continue;
    }
    files.push({ name: f.name, path: await assertRead(f.path) });
  }
  if (missing.length)
    throw new Error(
      `Reconecte antes de empacotar: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` e mais ${missing.length - 5}` : ""}.`,
    );
  const text = Buffer.from(JSON.stringify(projectSchema.parse(plan.project), null, 1), "utf8");
  let bytes = text.length;
  for (const f of files) bytes += (await stat(f.path)).size;
  await writeZip(out, [{ name: PACKAGE_PROJECT, data: text }, ...files], {
    signal,
    onProgress: (done, total) => onProgress?.(total ? done / total : 1),
  });
  return { files: files.length, bytes };
}

/** `<folder>/<name>`, or `<name> (2)` and so on when it is taken. */
function freeFolder(folder: string, name: string): string {
  let path = join(folder, name);
  for (let i = 2; existsSync(path); i++) path = join(folder, `${name} (${i})`);
  return path;
}

const tarPath = (): string =>
  join(process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows", "System32", "tar.exe");

/** Every file under `dir`, relative to it, with forward slashes. */
async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(relative(base, full).replace(/\\/g, "/"));
  }
  return out;
}

/**
 * Extracts a package into a new folder of `into` (named after the package) and writes the
 * lesson there with its paths pointing to the extracted files. Returns the lesson's project
 * and where it must be saved.
 */
export async function unpackProject(
  zip: string,
  into: string,
): Promise<{ folder: string; project: Project }> {
  const name =
    basename(zip, extname(zip))
      .replace(/[<>:"/\\|?*]/g, "")
      .trim() || "Aula";
  await mkdir(into, { recursive: true });
  const folder = freeFolder(into, name);
  await mkdir(folder);
  try {
    try {
      await run(tarPath(), ["-x", "-f", zip, "-C", folder], {
        windowsHide: true,
        maxBuffer: 1 << 20,
      });
    } catch (error) {
      throw new Error(
        "Este arquivo não é um pacote de aula do EdiAula: ele não pôde ser extraído.",
        {
          cause: error,
        },
      );
    }
    const root = await realpath(folder);
    for (const file of await listFiles(root)) {
      const full = await realpath(join(root, file));
      const rel = relative(root, full);
      if (!rel || rel.startsWith("..") || resolve(root, rel) !== full)
        throw new Error("O pacote tem um arquivo fora da pasta da aula.");
    }
    const projectFile = join(root, PACKAGE_PROJECT);
    if (!existsSync(projectFile))
      throw new Error("Este arquivo não é um pacote de aula do EdiAula.");
    if ((await stat(projectFile)).size > MAX_PROJECT_BYTES)
      throw new Error("O projeto do pacote é grande demais.");
    const stored = projectSchema.parse(JSON.parse(await readFile(projectFile, "utf8")));
    const project = unpackPaths(normalizeProject(stored), root);
    await rm(projectFile);
    return { folder: root, project };
  } catch (error) {
    await rm(folder, { recursive: true, force: true });
    throw error;
  }
}
