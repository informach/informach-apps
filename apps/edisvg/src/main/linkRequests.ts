import { type FSWatcher, watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { LinkRequest } from "@informach/edi-link/contract";
import { type PendingRequest, readRequests, removeRequest } from "@informach/edi-link/node";

/**
 * The requests other Edi tools leave for EdiSVG (packages/edi-link): `pedidos/` in this
 * profile, read when EdiSVG opens and watched while it is open (no polling). The window takes
 * them one at a time (`next`) when nothing is in the way, and says when one is done (`done`),
 * which removes its file. `onWaiting` hears that a new request came: the window comes to the
 * front and takes it.
 */
export interface LinkInbox {
  /** The oldest request not taken yet, now taken (null when none waits). */
  next(): Promise<LinkRequest | null>;
  /** The request taken with this id (its project path is the main process's, never the window's). */
  taken(id: unknown): LinkRequest;
  /** Done (or refused): its file goes. */
  done(id: unknown): Promise<void>;
  close(): void;
}

export async function createLinkInbox(folder: string, onWaiting: () => void): Promise<LinkInbox> {
  await mkdir(folder, { recursive: true });
  const taken = new Map<string, PendingRequest>();
  const announced = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  const look = async () => {
    const pending = await readRequests(folder);
    let fresh = false;
    for (const p of pending)
      if (!announced.has(p.request.id)) {
        announced.add(p.request.id);
        fresh = true;
      }
    if (fresh) onWaiting();
  };
  let watcher: FSWatcher | null = null;
  try {
    // Several events per write: one look a moment after the last.
    watcher = watch(folder, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void look().catch(() => undefined), 150);
    });
  } catch {
    watcher = null;
  }
  await look().catch(() => undefined);
  return {
    async next() {
      for (const p of await readRequests(folder))
        if (!taken.has(p.request.id)) {
          taken.set(p.request.id, p);
          announced.add(p.request.id);
          return p.request;
        }
      return null;
    },
    taken(id) {
      const p = typeof id === "string" ? taken.get(id) : undefined;
      if (!p) throw new Error("Pedido não encontrado.");
      return p.request;
    },
    async done(id) {
      const p = typeof id === "string" ? taken.get(id) : undefined;
      if (!p) return;
      taken.delete(p.request.id);
      await removeRequest(p.path);
    },
    close() {
      if (timer) clearTimeout(timer);
      watcher?.close();
    },
  };
}
