import { existsSync } from "node:fs";
import { appendFile, readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { OrphanTake, RecordingResult } from "../../shared/recording.ts";
import {
  JOURNAL_FILE,
  type JournalReplay,
  MEDIA_SOURCES,
  type MediaSource,
  replayJournal,
} from "../../shared/recordingJournal.ts";
import { probe } from "../ffmpeg.ts";
import { finalizeTake } from "./finalize.ts";

/**
 * Takes the app did not finish: folders in the recordings folder whose journal never got to
 * `finalized` (the app or the computer went down, or finalizing failed). Older recordings,
 * made before the journal existed, have no sessao.jsonl and are never listed.
 */

export type { OrphanTake };

async function inspect(dir: string): Promise<OrphanTake | null> {
  const journal = join(dir, JOURNAL_FILE);
  if (!existsSync(journal)) return null;
  const replay = replayJournal(await readFile(journal, "utf8"));
  if (replay.finalized || !replay.begin) return null;
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
  };
}

/** Unfinished takes under `root`, newest first; `active` is the take recording now. */
export async function scanOrphans(root: string, active?: string): Promise<OrphanTake[]> {
  if (!existsSync(root)) return [];
  const found: OrphanTake[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    if (active && resolve(dir) === resolve(active)) continue;
    const take = await inspect(dir);
    if (take) found.push(take);
  }
  return found.sort((a, b) => b.startedAt - a.startedAt);
}

/** The folder is an unfinished take under `root` (not the one recording now). */
export async function isOrphan(root: string, dir: string, active?: string): Promise<boolean> {
  const takes = await scanOrphans(root, active);
  return takes.some((t) => resolve(t.dir) === resolve(dir));
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
  if (replay.stop === null) {
    const stop = await lastKnown(dir, replay);
    // A half-written last line would swallow this one.
    const text = await readFile(path, "utf8");
    await appendFile(
      path,
      `${text.endsWith("\n") || !text ? "" : "\n"}${JSON.stringify({ k: "stop", qpc: stop })}\n`,
    );
  }
  return finalizeTake({
    dir,
    suspect: "all",
    warnings: ["Esta gravação foi interrompida e recuperada depois."],
  });
}
