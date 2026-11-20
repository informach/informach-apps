import { type FSWatcher, watch } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { type LinkRequest, linkRequestSchema } from "@informach/edi-link/contract";
import { readRequests } from "@informach/edi-link/node";
import { samePath, type WindowEntry } from "./instances.ts";

/**
 * The requests other Edi tools leave for EdiSVG (packages/edi-link): `pedidos/` in this
 * profile, read when EdiSVG opens and watched while it is open. The window takes them one at a
 * time (`next`) when nothing is in the way, and says when one is done (`done`), which removes
 * its file. `onWaiting` hears that a request is here for it: the window comes to the front and
 * takes it.
 *
 * With several windows open (instances.ts), a request goes to one of them: the window that has
 * its project open; else a window with nothing in it; else a window opened for it by the
 * lowest-numbered one. Taking is renaming `<id>.json` to `<id>.janela-<n>` (one rename wins;
 * EdiAula's reader only reads `.json`), and a request taken by a window that died goes back.
 */
export interface LinkInbox {
  /** The oldest request taken for this window and not handed yet (null when none waits). */
  next(): Promise<LinkRequest | null>;
  /** The request taken with this id (its project path is the main process's, never the window's). */
  taken(id: unknown): LinkRequest;
  /** Done (or refused): its file goes. */
  done(id: unknown): Promise<void>;
  close(): void;
}

/** What the inbox knows of this window and the others. */
export interface InboxWindow {
  slot: number;
  /** The project file open in this window (null: none). */
  openPath(): string | null;
  /** Nothing in this window and nothing running: a request may take it. */
  idle(): boolean;
  /** The other windows open now. */
  others(): WindowEntry[];
  /** The request this window was opened for (`--pedido`), taken at once. */
  openedFor?: string | null;
  /** Opens a new window for the request `id` (only the lowest-numbered window does). */
  openWindowFor(id: string): void;
  now?: () => number;
}

/** A window with nothing in it waits this long, so the window with the project takes it first. */
export const IDLE_GRACE_MS = 1000;
/** No window with nothing in it: a new window opens for a request this old. */
export const NEW_WINDOW_AFTER_MS = 2000;
/** A window opened for a request that did not take it in this time may be opened again. */
const NEW_WINDOW_RETRY_MS = 30_000;
/** Pending requests are looked at again this often (a request's turn depends on its age). */
const LOOK_EVERY_MS = 1000;

const claimSuffix = (slot: number) => `.janela-${slot}`;
const CLAIMED = /^(.+)\.janela-(\d+)$/;

interface Pending {
  request: LinkRequest;
  path: string;
  time: number;
}

async function pendingRequests(folder: string): Promise<Pending[]> {
  const found: Pending[] = [];
  for (const p of await readRequests(folder)) {
    const st = await stat(p.path).catch(() => null);
    if (st) found.push({ ...p, time: st.mtimeMs });
  }
  return found;
}

/** A taken request's file read back (a window that opens again finds the ones it had taken). */
async function readClaimed(path: string): Promise<LinkRequest | null> {
  try {
    return linkRequestSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return null;
  }
}

/**
 * What this window does with a pending request: take it, open a window for it, or leave it to
 * another window.
 */
export function decide(
  request: LinkRequest,
  age: number,
  window: Pick<InboxWindow, "slot" | "openPath" | "idle" | "others" | "openedFor">,
): "take" | "new-window" | "leave" {
  if (samePath(window.openPath(), request.project)) return "take";
  const others = window.others();
  if (others.some((w) => samePath(w.path, request.project))) return "leave";
  if (window.openedFor === request.id) return "take";
  if (window.idle()) return age >= IDLE_GRACE_MS ? "take" : "leave";
  if (others.some((w) => w.idle)) return "leave";
  const lowest = others.every((w) => w.slot > window.slot);
  return lowest && age >= NEW_WINDOW_AFTER_MS ? "new-window" : "leave";
}

export async function createLinkInbox(
  folder: string,
  onWaiting: () => void,
  window?: InboxWindow,
): Promise<LinkInbox> {
  await mkdir(folder, { recursive: true });
  const now = window?.now ?? Date.now;
  /** Taken for this window: the request and its file (renamed, or as written with one window). */
  const mine = new Map<string, { request: LinkRequest; path: string; handed: boolean }>();
  const announced = new Set<string>();
  const opened = new Map<string, number>();
  let timer: NodeJS.Timeout | null = null;
  let interval: NodeJS.Timeout | null = null;
  let looking: Promise<void> = Promise.resolve();

  /** Requests taken by windows that are gone go back; this window's own are its again. */
  const recover = async () => {
    if (!window) return;
    const live = new Set([window.slot, ...window.others().map((w) => w.slot)]);
    for (const name of await readdir(folder).catch(() => [] as string[])) {
      const match = CLAIMED.exec(name);
      if (!match) continue;
      const slot = Number(match[2]);
      const path = join(folder, name);
      if (slot === window.slot) {
        const request = await readClaimed(path);
        if (request) mine.set(request.id, { request, path, handed: false });
        else await rm(path, { force: true }).catch(() => undefined);
      } else if (!live.has(slot))
        await rename(path, join(folder, `${match[1]}.json`)).catch(() => undefined);
    }
  };

  const take = async (p: Pending): Promise<boolean> => {
    if (!window) {
      mine.set(p.request.id, { request: p.request, path: p.path, handed: false });
      return true;
    }
    const path = `${p.path.replace(/\.json$/i, "")}${claimSuffix(window.slot)}`;
    try {
      await rename(p.path, path);
    } catch {
      // Another window took it first.
      return false;
    }
    mine.set(p.request.id, { request: p.request, path, handed: false });
    return true;
  };

  /** One look at the pending requests: the ones for this window are taken. */
  const sweep = async () => {
    let fresh = false;
    for (const p of await pendingRequests(folder)) {
      if (mine.has(p.request.id)) continue;
      const action = window ? decide(p.request, now() - p.time, window) : "take";
      if (action === "take" && (await take(p))) fresh = true;
      if (action === "new-window" && window) {
        const at = opened.get(p.request.id);
        if (at === undefined || now() - at > NEW_WINDOW_RETRY_MS) {
          opened.set(p.request.id, now());
          window.openWindowFor(p.request.id);
        }
      }
    }
    for (const [id, item] of mine)
      if (!item.handed && !announced.has(id)) {
        announced.add(id);
        fresh = true;
      }
    if (fresh) onWaiting();
  };
  const look = () => {
    looking = looking.then(sweep, sweep).catch(() => undefined);
    return looking;
  };

  await recover().catch(() => undefined);
  let watcher: FSWatcher | null = null;
  try {
    // Several events per write: one look a moment after the last.
    watcher = watch(folder, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void look(), 150);
    });
  } catch {
    watcher = null;
  }
  // With several windows a request's turn depends on its age and on the other windows.
  if (window) {
    interval = setInterval(() => void look(), LOOK_EVERY_MS);
    interval.unref();
  }
  await look();
  return {
    async next() {
      await look();
      for (const item of mine.values())
        if (!item.handed) {
          item.handed = true;
          return item.request;
        }
      return null;
    },
    taken(id) {
      const item = typeof id === "string" ? mine.get(id) : undefined;
      if (!item) throw new Error("Pedido não encontrado.");
      return item.request;
    },
    async done(id) {
      const item = typeof id === "string" ? mine.get(id) : undefined;
      if (!item) return;
      mine.delete(item.request.id);
      await rm(item.path, { force: true });
    },
    close() {
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
      watcher?.close();
    },
  };
}

/**
 * EdiAula opens EdiSVG after it leaves a request. When every recent request is for a project
 * another window has open, that window takes it, and a window opened just for this would stay
 * empty: the launch leaves at once.
 */
export async function onlyNudged(
  folder: string,
  others: WindowEntry[],
  now = Date.now(),
  recentMs = 10_000,
): Promise<boolean> {
  if (!others.length) return false;
  const recent = (await pendingRequests(folder)).filter((p) => now - p.time <= recentMs);
  return (
    recent.length > 0 &&
    recent.every((p) => others.some((w) => samePath(w.path, p.request.project)))
  );
}
