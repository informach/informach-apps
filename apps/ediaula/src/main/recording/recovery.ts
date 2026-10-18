import { existsSync } from "node:fs";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { OrphanTake, RecordingResult } from "../../shared/recording.ts";
import {
  JOURNAL_FILE,
  type JournalReplay,
  keptRanges,
  MEDIA_SOURCES,
  type MediaSource,
  RESULT_FILE,
  replayJournal,
} from "../../shared/recordingJournal.ts";
import { probe } from "../ffmpeg.ts";
import { finalizeTake } from "./finalize.ts";

/**
 * Takes that never reached a project: folders in the recordings folder whose journal never got
 * to `finalized` (the app or the computer went down, or finalizing failed), and finished takes
 * the editor never imported (it closed first, or the import failed). Older recordings, made
 * before the journal existed, have no sessao.jsonl and are never listed.
 */

export type { OrphanTake };

/** gravacao.json of a finished take, when it is there and reads as one. */
async function finishedResult(dir: string): Promise<RecordingResult | null> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(join(dir, RESULT_FILE), "utf8"));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const result = value as Partial<RecordingResult>;
  if (result.version !== 2 || typeof result.duration !== "number" || !Array.isArray(result.pauses))
    return null;
  // The folder is where it is now, whatever path it had when it was written; a file outside it
  // makes the result unusable, and the take is finalized again from its journal.
  try {
    return rebaseResult(result as RecordingResult, dir);
  } catch {
    return null;
  }
}

/**
 * The take's files where its folder is now. Every path of gravacao.json must lie inside the
 * folder the take was written in (its `dir` then): one outside it is refused, so a result that
 * was moved or edited never makes the editor read a file that is not the take's own.
 */
export function rebaseResult(result: RecordingResult, dir: string): RecordingResult {
  const written = resolve(typeof result.dir === "string" && result.dir ? result.dir : dir);
  const inside = (path: string): string => {
    const rel = relative(written, resolve(written, path));
    if (!rel || rel.startsWith("..") || isAbsolute(rel))
      throw new Error("A gravação aponta para arquivos fora da pasta dela.");
    return join(dir, rel);
  };
  const maybe = (path: string | undefined): string | undefined =>
    typeof path === "string" && path ? inside(path) : undefined;
  const piece = <T extends { path: string; cursor?: string }>(p: T): T => ({
    ...p,
    path: inside(p.path),
    ...(p.cursor ? { cursor: inside(p.cursor) } : {}),
  });
  const out: RecordingResult = { ...result, dir };
  for (const key of [
    "screen",
    "cursor",
    "microphone",
    "systemAudio",
    "narration",
    "guidedRun",
  ] as const) {
    const value = maybe(result[key]);
    if (value) out[key] = value;
  }
  if (result.screenParts) out.screenParts = result.screenParts.map(piece);
  if (result.cameraParts) out.cameraParts = result.cameraParts.map(piece);
  if (result.microphoneParts) out.microphoneParts = result.microphoneParts.map(piece);
  if (result.systemParts) out.systemParts = result.systemParts.map(piece);
  return out;
}

async function inspect(dir: string): Promise<OrphanTake | null> {
  const journal = join(dir, JOURNAL_FILE);
  if (!existsSync(journal)) return null;
  const replay = replayJournal(await readFile(journal, "utf8"));
  if (replay.imported || !replay.begin) return null;
  if (replay.finalized) {
    const result = await finishedResult(dir);
    if (!result) return null;
    let size = 0;
    for (const entry of await readdir(dir, { withFileTypes: true }))
      if (entry.isFile()) size += (await stat(join(dir, entry.name))).size;
    const kept = keptRanges(result.pauses, result.duration).reduce((t, [a, b]) => t + b - a, 0);
    return {
      dir,
      name: basename(dir),
      startedAt: replay.begin.at,
      size,
      seconds: Math.round(kept),
      sources: [
        ...(result.screen || result.screenParts?.length ? ["screen" as const] : []),
        ...(result.microphone || result.microphoneParts?.length ? ["mic" as const] : []),
        ...(result.cameraParts?.length ? ["camera" as const] : []),
        ...(result.systemAudio || result.systemParts?.length ? ["system" as const] : []),
      ],
      finalized: true,
    };
  }
  let size = 0;
  const sources: MediaSource[] = [];
  for (const src of MEDIA_SOURCES)
    for (const part of replay.parts[src]) {
      const path = join(dir, part.file);
      if (!existsSync(path)) continue;
      const bytes = (await stat(path)).size;
      if (!bytes) continue;
      size += bytes;
      if (!sources.includes(src)) sources.push(src);
    }
  // A take that never got a frame or a sample has nothing to recover.
  if (!size) return null;
  const firsts = MEDIA_SOURCES.flatMap((src) => replay.parts[src].map((p) => p.qpc));
  const from = Math.min(...firsts);
  const paused = replay.pauses.reduce(
    (sum, [a, b]) => sum + (Math.min(b, replay.lastQpc) - Math.max(a, from)),
    0,
  );
  return {
    dir,
    name: basename(dir),
    startedAt: replay.begin.at,
    size,
    seconds: Math.max(0, Math.round((replay.lastQpc - from - Math.max(0, paused)) / 1000)),
    sources,
    finalized: false,
  };
}

/** Unfinished takes under `root`, newest first; `active`, the takes recording now. */
export async function scanOrphans(
  root: string,
  active: readonly string[] = [],
): Promise<OrphanTake[]> {
  if (!existsSync(root)) return [];
  const busy = new Set(active.map((d) => resolve(d).toLowerCase()));
  const found: OrphanTake[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    if (busy.has(resolve(dir).toLowerCase())) continue;
    const take = await inspect(dir);
    if (take) found.push(take);
  }
  return found.sort((a, b) => b.startedAt - a.startedAt);
}

/** The folder is a take under `root` waiting to be imported (not the one recording now). */
export async function isOrphan(
  root: string,
  dir: string,
  active: readonly string[] = [],
): Promise<boolean> {
  const takes = await scanOrphans(root, active);
  return takes.some((t) => resolve(t.dir) === resolve(dir));
}

/** The folder is a take of the recordings folder (it has a journal), directly inside it. */
export async function isTake(root: string, dir: string): Promise<boolean> {
  const inside = relative(resolve(root), resolve(dir));
  return (
    !!inside &&
    !inside.startsWith("..") &&
    !inside.includes("\\") &&
    !inside.includes("/") &&
    existsSync(join(dir, JOURNAL_FILE))
  );
}

/** Appends a line to the journal and waits for it to reach the disk. */
async function appendLine(path: string, line: object): Promise<void> {
  // A half-written last line would swallow this one.
  const text = await readFile(path, "utf8");
  const file = await open(path, "a");
  try {
    await file.write(`${text.endsWith("\n") || !text ? "" : "\n"}${JSON.stringify(line)}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
}

/** The editor placed the take in a project: from now on it is not offered again. */
export async function markTakeImported(dir: string): Promise<void> {
  await appendLine(join(dir, JOURNAL_FILE), { k: "imported", at: Date.now() });
}

/**
 * Highest QPC time anything in the folder knows of: the journals' last lines and the end of each
 * part (its first sample plus what it holds), so the stop cuts nothing that was recorded.
 */
async function lastKnown(dir: string, replay: JournalReplay): Promise<number> {
  let last = replay.lastQpc;
  for (const src of MEDIA_SOURCES)
    for (const part of replay.parts[src]) {
      const path = join(dir, part.file);
      if (src === "system" || !existsSync(path)) continue;
      // An unreadable part is repaired or left out by the finalization.
      const seconds = await probe(path).then(
        (info) => info.duration,
        () => 0,
      );
      last = Math.max(last, part.qpc + seconds * 1000, part.end ?? 0);
    }
  try {
    const text = await readFile(join(dir, "cursor.jsonl"), "utf8");
    for (const m of text.matchAll(/"t":(\d+(?:\.\d+)?)/g)) last = Math.max(last, Number(m[1]));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  return last;
}

/**
 * Finalizes an unfinished take like one that was stopped: every part is checked and repaired,
 * and the take ends at the last moment anything in the folder knows of.
 */
export async function recoverOrphan(dir: string): Promise<RecordingResult> {
  const path = join(dir, JOURNAL_FILE);
  const replay = replayJournal(await readFile(path, "utf8"));
  // Finished but never imported: it only has to be handed over again.
  if (replay.finalized) {
    const result = await finishedResult(dir);
    if (result) return result;
  }
  if (replay.stop === null)
    await appendLine(path, { k: "stop", qpc: await lastKnown(dir, replay) });
  return finalizeTake({
    dir,
    suspect: "all",
    warnings: ["Esta gravação foi interrompida e recuperada depois."],
  });
}
