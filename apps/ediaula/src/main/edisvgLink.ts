import { existsSync, type FSWatcher, watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import {
  type EdisvgSummary,
  edisvgSummarySchema,
  type LinkedAnimation,
  RENDERS_SUFFIX,
} from "@informach/edi-link/contract";
import { readManifest, renderPath, rendersDir } from "@informach/edi-link/node";

/**
 * EdiAula's side of the link with EdiSVG (packages/edi-link, shared/linkedMedia.ts): where a
 * lesson's EdiSVG project goes, reading a project's animations to link one, and watching the
 * renders folders of the projects the open lesson links to. Asking EdiSVG and opening it are
 * the package's (writeRequest, toolLauncher, openTool).
 */

/** The lesson's EdiSVG project: beside the lesson file, with its name (`Aula.edisvg`). */
export function lessonLinkProject(lessonPath: string): string | undefined {
  if (!isAbsolute(lessonPath) || extname(lessonPath).toLowerCase() !== ".ediaula") return undefined;
  return join(dirname(lessonPath), `${basename(lessonPath, extname(lessonPath))}.edisvg`);
}

/** A .edisvg read as far as linking goes: its artboards and animations. */
const SUMMARY_BYTES = 64 * 1024 ** 2;
export async function readEdisvgSummary(path: string): Promise<EdisvgSummary> {
  if (extname(path).toLowerCase() !== ".edisvg")
    throw new Error("Escolha um projeto do EdiSVG (.edisvg).");
  if ((await stat(path)).size > SUMMARY_BYTES)
    throw new Error("O projeto do EdiSVG é grande demais.");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("O arquivo não é um projeto do EdiSVG que dê para ler.");
  }
  const parsed = edisvgSummarySchema.safeParse(raw);
  if (!parsed.success) throw new Error("O arquivo não é um projeto do EdiSVG que dê para ler.");
  return parsed.data;
}

/** A linked animation of a project, its render as a full path (when it has one). */
export interface LinkedState extends LinkedAnimation {
  renderPath?: string;
}

/**
 * A project's linked animations as the lesson needs them: each render as a full path of the
 * renders folder (never outside it), and whether the project file is still there.
 */
export async function linkState(
  project: string,
): Promise<{ project: string; exists: boolean; items: LinkedState[] }> {
  const folder = rendersDir(project);
  const manifest = await readManifest(folder);
  const items: LinkedState[] = [];
  for (const item of manifest?.items ?? []) {
    let path: string | undefined;
    if (item.render)
      try {
        const full = renderPath(folder, item.render.file);
        if (existsSync(full)) path = full;
      } catch {
        path = undefined;
      }
    items.push({ ...item, ...(path ? { renderPath: path } : {}) });
  }
  return { project, exists: existsSync(project), items };
}

/**
 * Watches the renders folders of the projects the open lesson links to: a manifest written
 * there (a save in EdiSVG) is told with `onChange(project)`. A folder not made yet is waited for
 * in the project's folder. No polling: the folder events, a moment after the last of a burst.
 */
export function createRendersWatcher(onChange: (project: string) => void) {
  const watched = new Map<string, { close(): void }>();
  function watchOne(project: string): { close(): void } {
    const folder = rendersDir(project);
    let inner: FSWatcher | null = null;
    let outer: FSWatcher | null = null;
    let timer: NodeJS.Timeout | null = null;
    const changed = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChange(project), 200);
    };
    const attach = () => {
      if (inner || !existsSync(folder)) return;
      try {
        inner = watch(folder, changed);
        inner.on("error", () => undefined);
        changed();
      } catch {
        inner = null;
      }
    };
    attach();
    if (!inner)
      try {
        // The renders folder is made at the first render: its creation is heard in the project's.
        outer = watch(dirname(project), (_event, name) => {
          if (name && String(name).endsWith(RENDERS_SUFFIX)) attach();
        });
        outer.on("error", () => undefined);
      } catch {
        outer = null;
      }
    return {
      close() {
        if (timer) clearTimeout(timer);
        inner?.close();
        outer?.close();
      },
    };
  }
  return {
    /** Watches exactly these projects (the lesson opened, or its links changed). */
    set(projects: readonly string[]) {
      const want = new Set(projects.map((p) => p.toLowerCase()));
      for (const [key, w] of watched)
        if (!want.has(key)) {
          w.close();
          watched.delete(key);
        }
      for (const project of projects) {
        const key = project.toLowerCase();
        if (!watched.has(key)) watched.set(key, watchOne(project));
      }
    },
    close() {
      for (const w of watched.values()) w.close();
      watched.clear();
    },
  };
}
