import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { MAX_TOOL_INSTANCES } from "@informach/edi-desktop/runtime-lock";
import { z } from "zod";

/**
 * EdiSVG's windows: each one is a process of its own (one lesson per window, its pipeline, its
 * assistant and its exports running beside the others'), on the same profile. They know of each
 * other by a register in the profile, `janelas/<n>.json`: the window's number (`n`, from 1), its
 * process and what it has open. A file whose process is gone is free to take.
 *
 * Window 1 keeps what EdiSVG always had (its recovery copy, its render queue, the MCP port the
 * clients outside the app point at); the others have their own beside it (index.js).
 */

/** At most this many windows at once (each holds a runtime lock of the suite). */
export const MAX_WINDOWS = MAX_TOOL_INSTANCES;
/** A register file left half written this long ago is not a window being born. */
const UNREADABLE_STALE_MS = 10_000;
/** A takeover of a dead window's number left this long ago was abandoned. */
const TAKEOVER_STALE_MS = 10_000;

const entrySchema = z.strictObject({
  slot: z.int().min(1).max(MAX_WINDOWS),
  pid: z.int().positive(),
  startedAt: z.number().nonnegative(),
  /** The project's file, when it has one. */
  path: z.string().max(4096).nullable(),
  dirty: z.boolean(),
  /** Nothing in it (no file, nothing edited) and nothing running: a request may take it. */
  idle: z.boolean(),
});
export type WindowEntry = z.infer<typeof entrySchema>;
export type WindowState = Pick<WindowEntry, "path" | "dirty" | "idle">;

export const windowsFolder = (userData: string): string => join(userData, "janelas");
const entryFile = (folder: string, slot: number) => join(folder, `${slot}.json`);
const frontFile = (folder: string, slot: number) => join(folder, `${slot}.frente`);

/** Whether a process is running (EPERM: running, someone else's). */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export const samePath = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

type Read = { entry: WindowEntry } | { unreadable: true; since: number } | null;

function readEntry(file: string): Read {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  try {
    return { entry: entrySchema.parse(JSON.parse(text)) };
  } catch {
    try {
      return { unreadable: true, since: statSync(file).mtimeMs };
    } catch {
      return null;
    }
  }
}

export interface RegisterOptions {
  alive?: (pid: number) => boolean;
  now?: () => number;
}

/** The windows open now, by number (a file of a process gone is left out). */
export function liveWindows(
  folder: string,
  { alive = isAlive }: Pick<RegisterOptions, "alive"> = {},
): WindowEntry[] {
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch {
    return [];
  }
  const found: WindowEntry[] = [];
  for (const name of names) {
    if (!/^\d+\.json$/.test(name)) continue;
    const read = readEntry(join(folder, name));
    if (read && "entry" in read && alive(read.entry.pid)) found.push(read.entry);
  }
  return found.sort((a, b) => a.slot - b.slot);
}

/** The window (other than `except`) that has the project at `path` open. */
export function ownerOf(
  folder: string,
  path: string,
  except: number | null = null,
  options: Pick<RegisterOptions, "alive"> = {},
): WindowEntry | null {
  return (
    liveWindows(folder, options).find((w) => w.slot !== except && samePath(w.path, path)) ?? null
  );
}

/** Asks window `slot` to come to the front (it watches the register's folder). */
export function askToFront(folder: string, slot: number): void {
  try {
    writeFileSync(frontFile(folder, slot), String(Date.now()));
  } catch {
    // The window will not come forward: nothing else is lost.
  }
}

/**
 * Takes the lowest free window number for this process, before the app is ready (it decides
 * the browser profile). Null when all MAX_WINDOWS are open. A number whose process is gone is
 * taken over under a short lock (`<n>.troca`), so two windows opening at once never share it.
 */
export function claimSlot(
  folder: string,
  { pid = process.pid, alive = isAlive, now = Date.now }: RegisterOptions & { pid?: number } = {},
): number | null {
  mkdirSync(folder, { recursive: true });
  for (let slot = 1; slot <= MAX_WINDOWS; slot++) {
    const file = entryFile(folder, slot);
    const entry: WindowEntry = {
      slot,
      pid,
      startedAt: now(),
      path: null,
      dirty: false,
      idle: false,
    };
    const create = () => {
      try {
        writeFileSync(file, JSON.stringify(entry), { flag: "wx" });
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw error;
      }
    };
    if (create()) return slot;
    const read = readEntry(file);
    const stale =
      read === null ||
      ("entry" in read ? !alive(read.entry.pid) : now() - read.since > UNREADABLE_STALE_MS);
    if (!stale) continue;
    const takeover = `${file}.troca`;
    try {
      mkdirSync(takeover);
    } catch {
      // Another window is taking it over (or left a takeover behind long ago).
      try {
        if (now() - statSync(takeover).mtimeMs > TAKEOVER_STALE_MS) rmdirSync(takeover);
      } catch {
        // Gone meanwhile.
      }
      continue;
    }
    try {
      // Still the dead one's (not a window born meanwhile): it goes, and this one is made.
      const again = readEntry(file);
      const stillStale =
        again === null ||
        ("entry" in again ? !alive(again.entry.pid) : now() - again.since > UNREADABLE_STALE_MS);
      if (!stillStale) continue;
      rmSync(file, { force: true });
      if (create()) return slot;
    } finally {
      rmdirSync(takeover);
    }
  }
  return null;
}

/** This window's side of the register: what it has open, and the calls to come to the front. */
export function createWindowRegister(
  folder: string,
  slot: number,
  { pid = process.pid, now = Date.now }: { pid?: number; now?: () => number } = {},
) {
  const startedAt = now();
  let last = "";
  let writing: Promise<void> = Promise.resolve();
  let watcher: ReturnType<typeof watch> | null = null;
  return {
    slot,
    /** Writes what the window has open, when it changed. */
    publish(state: WindowState): Promise<void> {
      const text = JSON.stringify({ slot, pid, startedAt, ...state } satisfies WindowEntry);
      if (text === last) return writing;
      last = text;
      const file = entryFile(folder, slot);
      writing = writing.then(
        () => atomicWrite(file, text),
        () => atomicWrite(file, text),
      );
      return writing.catch((error: unknown) =>
        console.warn(
          "[edisvg] registro da janela:",
          error instanceof Error ? error.message : error,
        ),
      );
    },
    /** Calls `onFront` whenever another process asks this window to the front. */
    watchFront(onFront: () => void): void {
      const look = () => {
        const file = frontFile(folder, slot);
        try {
          statSync(file);
        } catch {
          return;
        }
        rmSync(file, { force: true });
        onFront();
      };
      look();
      try {
        watcher = watch(folder, (_event, name) => {
          if (!name || name === `${slot}.frente`) look();
        });
      } catch {
        watcher = null;
      }
    },
    /** The window closes: its number is free (only if the file is still this process's). */
    release(): void {
      watcher?.close();
      const read = readEntry(entryFile(folder, slot));
      if (read && "entry" in read && read.entry.pid !== pid) return;
      rmSync(entryFile(folder, slot), { force: true });
      rmSync(frontFile(folder, slot), { force: true });
    },
  };
}
export type WindowRegister = ReturnType<typeof createWindowRegister>;

/** Our own arguments: a window opened for one of the requests (linkRequests.ts). */
export const REQUEST_FLAG = "--pedido";

/**
 * The arguments a new window starts with: this process's, without the project files, the
 * request it was opened for and the smoke test, plus `extra`. Development (`pnpm edi:work`)
 * keeps its preload of the license fixture and the app's folder.
 */
export function windowArguments(argv: readonly string[], extra: readonly string[] = []): string[] {
  const out: string[] = [];
  const args = argv.slice(1);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === REQUEST_FLAG) {
      i++;
      continue;
    }
    if (arg === "--smoke-test" || /\.edisvg$/i.test(arg)) continue;
    out.push(arg);
  }
  return [...out, ...extra];
}

/** The request id after `--pedido` in `argv`, when it is one. */
export function requestArgument(argv: readonly string[]): string | null {
  const at = argv.indexOf(REQUEST_FLAG);
  const id = at >= 0 ? argv[at + 1] : undefined;
  return id && /^[\w-]{1,100}$/.test(id) ? id : null;
}
