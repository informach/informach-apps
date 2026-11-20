import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { basename, extname } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import type { LinkedAnimation } from "@informach/edi-link/contract";
import { z } from "zod";
import { type Project, parseProject } from "../shared/project";
import { PROJECT_BYTES, parseJsonText, readBoundedText } from "./boundedText";
import { linkedAnimations } from "./linkRender";

/**
 * The queue of renders for the lessons (packages/edi-link): every save of a project with linked
 * animations puts the project here, and the window renders the queue one project at a time from
 * the saved file, whatever project is open meanwhile. Opening the next lesson's project no
 * longer stops the render of the one before. The queue is kept in the profile, so renders left
 * when EdiSVG closes go on when it opens again.
 *
 * The window sees an item's id and name; the project's path stays here, as every link path does.
 */

const MAX_ITEMS = 200;
const storedItemSchema = z.strictObject({
  id: z.uuid(),
  path: z.string().min(1).max(4096),
  name: z.string().min(1).max(260),
  addedAt: z.number().int().nonnegative(),
});
const storedSchema = z.strictObject({
  version: z.literal(1),
  items: z.array(storedItemSchema).max(MAX_ITEMS),
});
type StoredItem = z.infer<typeof storedItemSchema>;

/** What the window knows of a queued project. */
export interface QueueItem {
  id: string;
  name: string;
}

export interface LinkQueueOptions {
  /** The queue's file in the profile (each window has its own, instances.ts). */
  file: string;
  /** The queue files of windows that closed without rendering all: their items come here. */
  orphans?: () => string[];
  rename?: (from: string, to: string) => Promise<void>;
  remove?: (path: string) => Promise<void>;
  read?: (path: string) => Promise<string>;
  write?: (path: string, text: string) => Promise<void>;
  exists?: (path: string) => boolean;
  links?: (project: string) => Promise<LinkedAnimation[]>;
  now?: () => number;
}

const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function createLinkQueue({
  file,
  read = (path) => readBoundedText(path, PROJECT_BYTES),
  write = atomicWrite,
  exists = existsSync,
  links = linkedAnimations,
  now = Date.now,
  orphans = () => [],
  rename: move = rename,
  remove = (path) => rm(path, { force: true }),
}: LinkQueueOptions) {
  let items: StoredItem[] = [];
  /** The project id each loaded item had in its file: renders write under it. */
  const projectIds = new Map<string, string>();
  let saving: Promise<void> = Promise.resolve();

  const persist = () => {
    const text = JSON.stringify({ version: 1, items } satisfies z.infer<typeof storedSchema>);
    saving = saving.then(
      () => write(file, text),
      () => write(file, text),
    );
    return saving;
  };
  const itemOf = (id: unknown): StoredItem => {
    const item = typeof id === "string" ? items.find((i) => i.id === id) : undefined;
    if (!item) throw new Error("Este render já saiu da fila.");
    return item;
  };

  return {
    /** Reads the queue left by the last session; an unreadable file starts an empty queue. */
    async init(): Promise<void> {
      const readQueue = async (path: string): Promise<StoredItem[]> => {
        try {
          return storedSchema.parse(parseJsonText(await read(path))).items;
        } catch (error) {
          console.warn(
            "[edisvg] fila de renders ilegível; começa vazia:",
            error instanceof Error ? error.message : error,
          );
          return [];
        }
      };
      if (exists(file)) items = await readQueue(file);
      // A closed window's queue: renamed first (one window adopts it), then its items join.
      let adopted = false;
      for (const orphan of orphans()) {
        const taken = `${orphan}.${randomUUID()}.adotada`;
        try {
          await move(orphan, taken);
        } catch {
          continue;
        }
        for (const item of await readQueue(taken))
          if (items.length < MAX_ITEMS && !items.some((i) => samePath(i.path, item.path))) {
            items = [...items, item];
            adopted = true;
          }
        await remove(taken).catch(() => undefined);
      }
      if (adopted) await persist();
    },
    view(): QueueItem[] {
      return items.map(({ id, name }) => ({ id, name }));
    },
    /**
     * Queues the project saved at `path`, when it has linked animations. A project already in
     * the queue keeps its place (its render reads the file as it is when it starts): the same id
     * comes back, so the window can restart a render of it that is going.
     */
    async add(path: string): Promise<string | null> {
      const queued = items.find((i) => samePath(i.path, path));
      if (queued) return queued.id;
      if (!(await links(path)).length) return null;
      if (items.length >= MAX_ITEMS) throw new Error("A fila de renders está cheia.");
      const item: StoredItem = {
        id: randomUUID(),
        path,
        name: basename(path, extname(path)).slice(0, 260) || "Projeto",
        addedAt: now(),
      };
      items = [...items, item];
      await persist();
      return item.id;
    },
    /** The saved project of an item and its linked animations, as its render starts. */
    async load(id: unknown): Promise<{ project: Project; links: LinkedAnimation[] }> {
      const item = itemOf(id);
      if (!exists(item.path))
        throw new Error(`O projeto ${basename(item.path)} não foi encontrado.`);
      const project = parseProject(parseJsonText(await read(item.path)));
      projectIds.set(item.id, project.id);
      return { project, links: await links(item.path) };
    },
    /** Where an item's renders go: its project's file and the id read from it at `load`. */
    target(id: unknown): { path: string; projectId: string } {
      const item = itemOf(id);
      const projectId = projectIds.get(item.id);
      if (!projectId) throw new Error("O render deste projeto ainda não começou.");
      return { path: item.path, projectId };
    },
    async remove(id: unknown): Promise<void> {
      if (typeof id !== "string" || !items.some((i) => i.id === id)) return;
      items = items.filter((i) => i.id !== id);
      projectIds.delete(id);
      await persist();
    },
  };
}
export type LinkQueue = ReturnType<typeof createLinkQueue>;
