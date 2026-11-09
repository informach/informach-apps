import { execFileSync } from "node:child_process";
import { existsSync, type FSWatcher, readFileSync, statSync, watch } from "node:fs";
import { join } from "node:path";

/**
 * Tells the development Hub when a tool open in `pnpm edi:work` is running code older than the
 * repository's. The tool is built once, on opening. EdiCaptura starts with Windows and stays in
 * the tray, so without this an edit or a `git pull` could wait days to reach it.
 *
 * What the build writes (out/, resources/native/ of the native helper) is ignored by git, and
 * so is it here: the sweep lists files through git, and each change seen goes through
 * `git check-ignore`.
 */

/**
 * Folders that never feed the tool's build: outputs and caches (also ignored by git; skipped
 * first so their flood of events never reaches git) and tests. `scripts` stays: the native
 * helper's build script lives there.
 */
const IGNORED_FOLDERS = new Set([
  "node_modules",
  "out",
  "dist",
  "release",
  ".turbo",
  "test-results",
  "playwright-report",
  "coverage",
  "tmp",
  "tests",
  "bin",
  "obj",
]);
const IGNORED_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|\.(md|tsbuildinfo|pen|log)$/i;

/** Whether a change at this path (relative to an app or package folder) reaches the build. */
export function isBuildInput(path: string): boolean {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return false;
  if (parts.some((part) => IGNORED_FOLDERS.has(part))) return false;
  return !IGNORED_FILE.test(parts.at(-1) ?? "");
}

type Manifest = Partial<
  Record<"dependencies" | "devDependencies" | "peerDependencies", Record<string, string>>
>;

/**
 * The tool's folder and every `@informach/*` package it consumes, directly or through another
 * package, relative to the repository. Packages are consumed as source, so their edits change
 * the tool.
 */
export function buildSources(
  repo: string,
  id: string,
  read: (path: string) => string = (path) => readFileSync(path, "utf8"),
): string[] {
  const folders = [join("apps", id)];
  for (let index = 0; index < folders.length; index++) {
    let manifest: Manifest;
    try {
      manifest = JSON.parse(read(join(repo, folders[index] ?? "", "package.json"))) as Manifest;
    } catch (error) {
      // The tool itself must exist; a package without a folder here is not built from source.
      if (index === 0) throw error;
      continue;
    }
    const names = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    });
    for (const name of names) {
      if (!name.startsWith("@informach/")) continue;
      const folder = join("packages", name.slice("@informach/".length));
      if (!folders.includes(folder)) folders.push(folder);
    }
  }
  return folders;
}

/** Whether git ignores the path. Without git (or outside a repository) nothing is ignored. */
function gitIgnored(repo: string, path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", path.replaceAll("\\", "/")], {
      cwd: repo,
      stdio: "ignore",
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

/** Modification time of a file, or null for a folder or a path that is gone. */
function fileTime(path: string): number | null {
  try {
    const entry = statSync(path);
    return entry.isFile() ? entry.mtimeMs : null;
  } catch {
    return null;
  }
}

/**
 * First build input of these folders written at or after `since`, from the files git knows
 * (tracked, or new and not ignored). Undefined when there is none or git cannot list them.
 */
function writtenSince(repo: string, folders: string[], since: number): string | undefined {
  let listed: string[];
  try {
    listed = execFileSync(
      "git",
      [
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
        "--",
        ...folders.map((folder) => folder.replaceAll("\\", "/")),
      ],
      { cwd: repo, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, windowsHide: true },
    ).split("\0");
  } catch {
    return undefined;
  }
  for (const file of listed) {
    const folder = folders.find((f) => file.startsWith(`${f.replaceAll("\\", "/")}/`));
    if (!folder || !isBuildInput(file.slice(folder.length + 1))) continue;
    const time = fileTime(join(repo, file));
    if (time !== null && time >= since) return join(file);
  }
  return undefined;
}

/**
 * Calls `changed` once, with the repository-relative path, at the first change to a build input
 * of the tool made after `since` (when its build started). Start it after the build: the build
 * writes and removes temporary files beside the sources, and reads them all, which Windows also
 * reports. A source edited while it compiled is caught by a sweep when the watch starts.
 * Returns the function that stops watching.
 */
export function watchBuildSources(
  repo: string,
  id: string,
  changed: (path: string) => void,
  since: number = Date.now(),
): () => void {
  const watchers: FSWatcher[] = [];
  let done = false;
  const stop = () => {
    done = true;
    for (const watcher of watchers.splice(0)) watcher.close();
  };
  const report = (path: string) => {
    if (done) return;
    stop();
    changed(path);
  };
  const folders = buildSources(repo, id).filter((folder) => existsSync(join(repo, folder)));
  for (const folder of folders) {
    const root = join(repo, folder);
    const watcher = watch(root, { recursive: true }, (_event, file) => {
      if (done || !file || !isBuildInput(file)) return;
      // Windows also reports a folder whose file was written, and a file that was only read:
      // only a file written after `since` counts. A path that is gone was a removed source,
      // which counts.
      const path = join(root, file);
      const time = fileTime(path);
      if (time === null && existsSync(path)) return;
      if (time !== null && time < since) return;
      if (gitIgnored(repo, join(folder, file))) return;
      report(join(folder, file));
    });
    // A folder removed by a checkout must not end the work session.
    watcher.on("error", () => undefined);
    watchers.push(watcher);
  }
  const edited = writtenSince(repo, folders, since);
  if (edited) report(edited);
  return stop;
}
