import { existsSync, type FSWatcher, watch } from "node:fs";
import { mkdir, readFile, rename, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import {
  type EdisvgSummary,
  edisvgSummarySchema,
  LINK_VERSION,
  type LinkedAnimation,
  linkedAnimationSchema,
  RENDERS_SUFFIX,
  type Render,
  renderFileName,
  renderSchema,
} from "@informach/edi-link/contract";
import {
  inside,
  readManifest,
  renderPath,
  rendersDir,
  writeManifest,
} from "@informach/edi-link/node";
import { linkedProjects } from "../shared/linkedMedia.ts";
import type { Asset, Project } from "../shared/types.ts";

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

/** The render a linked asset plays, as its manifest entry says it (none when it is not one). */
function renderOfAsset(a: Asset): Render | undefined {
  if (a.kind !== "video" || !a.link?.animationId || !a.link.hash) return undefined;
  const parsed = renderSchema.safeParse({
    file: renderFileName(a.link.animationId, a.link.hash),
    width: a.width,
    height: a.height,
    fps: a.fps,
    frames: Math.max(1, Math.round(a.duration * a.fps)),
    duration: a.duration,
    hash: a.link.hash,
  });
  return parsed.success ? parsed.data : undefined;
}

/**
 * The links of the EdiSVG projects a package brought (shared/projectPackage.ts). A package
 * carries each linked .edisvg but not its renders folder, and without the manifest there EdiSVG
 * does not know which of its animations a lesson shows: a save in it rendered nothing and the
 * lesson never changed. Each such project (inside `root`, with no manifest yet) gets one listing
 * the lesson's animations of it, and the render each one plays moves into the renders folder, so
 * EdiSVG renders only what a save changes. Returns the lesson with those assets at their new place.
 */
export async function restorePackedLinks(
  p: Project,
  root: string,
  now = Date.now(),
): Promise<Project> {
  let assets = p.assets;
  for (const edisvg of linkedProjects(p)) {
    if (!inside(root, edisvg) || !existsSync(edisvg)) continue;
    const folder = rendersDir(edisvg);
    if (await readManifest(folder)) continue;
    let projectId: string;
    try {
      projectId = (await readEdisvgSummary(edisvg)).id;
    } catch {
      continue;
    }
    const items: LinkedAnimation[] = [];
    const moved = new Map<string, string>();
    for (const a of assets) {
      const link = a.link;
      if (link?.project !== edisvg || !link.animationId || !link.artboardId) continue;
      if (items.some((i) => i.animationId === link.animationId)) continue;
      const entry = linkedAnimationSchema.safeParse({
        animationId: link.animationId,
        artboardId: link.artboardId,
        name: a.name.trim().slice(0, 200) || "Animação",
        ...(link.start !== undefined ? { start: link.start } : {}),
        updatedAt: now,
      });
      if (!entry.success) continue;
      const item = entry.data;
      const render = renderOfAsset(a);
      const target = render && renderPath(folder, render.file);
      if (render && target && moved.get(a.path) === target) item.render = render;
      else if (
        render &&
        target &&
        !moved.has(a.path) &&
        inside(root, a.path) &&
        existsSync(a.path)
      ) {
        await mkdir(folder, { recursive: true });
        await rename(a.path, target);
        moved.set(a.path, target);
        item.render = render;
      }
      items.push(item);
    }
    if (!items.length) continue;
    await writeManifest(folder, { version: LINK_VERSION, projectId, items });
    assets = assets.map((a) => {
      const to = moved.get(a.path);
      return to ? { ...a, path: to } : a;
    });
  }
  return assets === p.assets ? p : { ...p, assets };
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
