import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import {
  type LinkRequest,
  linkRequestSchema,
  MANIFEST_FILE,
  RENDERS_SUFFIX,
  REQUESTS_FOLDER,
  type RendersManifest,
  rendersManifestSchema,
} from "./contract.ts";

/**
 * The disk side of the link (contract.ts): where requests and renders are, and reading and
 * writing them whole. Main process only.
 */

/** A tool's requests folder: `<appData>\<tool>\pedidos`. */
export const requestsDir = (appData: string, tool: string): string =>
  join(appData, tool, REQUESTS_FOLDER);

/** The renders folder beside a project: `<folder>\<name> · renders`. */
export function rendersDir(project: string): string {
  const name = basename(project, extname(project));
  return join(dirname(project), `${name}${RENDERS_SUFFIX}`);
}

/** A render named in a manifest, as a path of the renders folder (never one outside it). */
export function renderPath(folder: string, file: string): string {
  const path = resolve(folder, file);
  if (dirname(path) !== resolve(folder) || basename(path) !== file)
    throw new Error("Render fora da pasta de renders.");
  return path;
}

/** Whether `path` is inside `folder` (both resolved; case does not matter on Windows). */
export function inside(folder: string, path: string): boolean {
  const a = resolve(folder) + sep;
  const b = resolve(path);
  return process.platform === "win32"
    ? b.toLowerCase().startsWith(a.toLowerCase())
    : b.startsWith(a);
}

/** A request as the asking tool writes it: the id and version are filled in. */
export type NewRequest = LinkRequest extends infer R
  ? R extends LinkRequest
    ? Omit<R, "id" | "version"> & { id?: string }
    : never
  : never;

/** Leaves a request for a tool (written whole: a request there is complete). */
export async function writeRequest(folder: string, request: NewRequest): Promise<LinkRequest> {
  const value = linkRequestSchema.parse({ version: 1, ...request, id: request.id ?? randomUUID() });
  await mkdir(folder, { recursive: true });
  await atomicWrite(join(folder, `${value.id}.json`), JSON.stringify(value));
  return value;
}

export interface PendingRequest {
  request: LinkRequest;
  /** The file, removed once the request is done. */
  path: string;
}

/**
 * The requests waiting in `folder`, oldest first. One that does not parse (another version, a
 * hand-made file) is removed: it would be refused at every look.
 */
export async function readRequests(folder: string): Promise<PendingRequest[]> {
  const names = await readdir(folder).catch(() => [] as string[]);
  const found: (PendingRequest & { time: number })[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(folder, name);
    try {
      const [text, st] = await Promise.all([readFile(path, "utf8"), stat(path)]);
      found.push({ request: linkRequestSchema.parse(JSON.parse(text)), path, time: st.mtimeMs });
    } catch {
      await rm(path, { force: true }).catch(() => undefined);
    }
  }
  return found.sort((a, b) => a.time - b.time).map(({ request, path }) => ({ request, path }));
}

/** Marks a request done. */
export const removeRequest = (path: string): Promise<void> => rm(path, { force: true });

/** A project's manifest, or null when it has none (or it does not parse). */
export async function readManifest(folder: string): Promise<RendersManifest | null> {
  try {
    const raw = JSON.parse(await readFile(join(folder, MANIFEST_FILE), "utf8"));
    const parsed = rendersManifestSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Writes a project's manifest whole, last: the renders it lists are complete. */
export async function writeManifest(folder: string, manifest: RendersManifest): Promise<void> {
  await mkdir(folder, { recursive: true });
  await atomicWrite(
    join(folder, MANIFEST_FILE),
    JSON.stringify(rendersManifestSchema.parse(manifest), null, 1),
  );
}
