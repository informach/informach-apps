import { clipEnd } from "./clipTime.ts";
import { type ExportPresetId, exportName } from "./exportPresets.ts";
import type { Finding } from "./preflight.ts";
import type { Clip, Project } from "./types.ts";

/**
 * export_video with several parts at once (`split: "clips"` on a track): the parts
 * of a track, their file names ("<aula> - Parte 1.mp4"), one folder for all of them and one
 * question when some files are already there. Each part is then exported as a stretch of the
 * lesson (courseSplit.ts rangeProject), as export_video with `range` does.
 */

/** One part, in timeline seconds. */
export interface PartRange {
  from: number;
  to: number;
}

/** The most parts one call puts in the queue. */
export const MAX_PARTS = 100;
/** The shortest part, as for a single stretch. */
export const MIN_PART = 0.5;

const EPS = 1e-6;

export const clock = (s: number): string => {
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, "0")}`;
};

/**
 * What a clip of the track belongs to: its group, else the recording it was cut from (a held
 * frame of Estender quadro counts as its source's), else nothing of its own (a b-roll, a picture).
 */
function unitOf(c: Clip, assets: ReadonlyMap<string, Project["assets"][number]>): string | null {
  if (c.groupId) return `g:${c.groupId}`;
  const asset = assets.get(c.assetId);
  const source = asset?.still ? (assets.get(asset.still.assetId) ?? asset) : asset;
  if (source?.recording) return `r:${source.recording.id}`;
  return null;
}

/**
 * split: "clips": one part per clip or group of clips of the track, each from the start to the end
 * of what it covers, in timeline order. The pieces of one recording (the cleanup cuts it, a held
 * frame goes in between) are one part, and so are the clips of one group. On a track that has
 * recordings, a clip of nothing of its own (a b-roll) goes with the part before it, and before the
 * first one with the first; the first part starts at 0:00, and each part runs until the next one
 * begins, so the pauses between them go with the part before. The last ends with its last clip.
 */
export function trackParts(
  p: Pick<Project, "tracks" | "clips" | "assets">,
  trackId: string,
): { ok: true; parts: PartRange[] } | { ok: false; error: string } {
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track)
    return {
      ok: false,
      error: `Faixa não encontrada: ${trackId}. Nada foi exportado. Use os ids de get_overview.`,
    };
  const clips = p.clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start || clipEnd(a) - clipEnd(b));
  if (!clips.length)
    return { ok: false, error: `A faixa ${track.name} não tem clipes. Nada foi exportado.` };
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const keys = clips.map((c) => unitOf(c, assets));
  // A track with no recording: every clip (or group) is a part of its own.
  const owned = keys.some((k) => k?.startsWith("r:"));
  const units: { key: string | null; start: number; end: number }[] = [];
  clips.forEach((c, i) => {
    const key = keys[i];
    const last = units[units.length - 1];
    const joins =
      !!last &&
      // The next piece of the same recording or group; on a track of recordings, a clip of
      // nothing of its own, with the part before it, and the first recording, taking the loose
      // clips that came before it.
      ((key !== null && last.key === key) || (owned && (key === null || last.key === null)));
    if (!last || !joins) {
      units.push({ key, start: c.start, end: clipEnd(c) });
      return;
    }
    last.key ??= key;
    last.end = Math.max(last.end, clipEnd(c));
  });
  const parts = units.map((u, i) => ({
    from: i === 0 ? 0 : u.start,
    to: i + 1 < units.length ? units[i + 1].start : u.end,
  }));
  return { ok: true, parts };
}

/** The file of each part: "<aula> - Parte N.mp4" (".mp3" for audio, " (vertical)" for reels). */
export function partFiles(
  parts: readonly PartRange[],
  lesson: string,
  preset: ExportPresetId,
  vertical: boolean,
): string[] {
  return parts.map((_, i) => exportName(`${lesson} - Parte ${i + 1}`, preset, vertical));
}

/** "Aula - Parte 1.mp4" → "Aula - Parte 1 (2).mp4". */
export function numbered(file: string, n: number): string {
  const dot = file.lastIndexOf(".");
  return dot > 0 ? `${file.slice(0, dot)} (${n})${file.slice(dot)}` : `${file} (${n})`;
}

/** A file of `folder` (the folder as the dialog gave it, with or without the last backslash). */
export const inFolder = (folder: string, file: string): string =>
  `${folder.replace(/[\\/]+$/, "")}\\${file}`;

/** What to do with the files already in the folder, asked once for all of them. */
export type Conflict = "replace" | "suffix";

/**
 * Where each part goes in `folder`. A file already there is written over with "replace", or gets
 * the first free " (n)" with "suffix". A path the export queue is already writing is never taken
 * (the queue refuses two exports to one file): it always gets a suffix.
 */
export async function placeParts(
  folder: string,
  files: readonly string[],
  opts: {
    exists: (paths: string[]) => Promise<boolean[]>;
    /** Paths the queue is writing, in lower case. */
    queued: ReadonlySet<string>;
    /** Asked once, when some files are already in the folder; null stops everything. */
    ask: (names: string[]) => Promise<Conflict | null>;
  },
): Promise<{ paths: string[]; replaced: string[]; suffixed: string[] } | null> {
  const paths = files.map((f) => inFolder(folder, f));
  const there = await opts.exists(paths);
  const existing = paths.filter((_, i) => there[i]);
  let mode: Conflict = "suffix";
  if (existing.length) {
    const answer = await opts.ask(existing.map((p) => p.slice(p.lastIndexOf("\\") + 1)));
    if (!answer) return null;
    mode = answer;
  }
  const move = paths.map(
    (p, i) => opts.queued.has(p.toLowerCase()) || (there[i] && mode === "suffix"),
  );
  const chosen = new Set(paths.filter((_, i) => !move[i]).map((p) => p.toLowerCase()));
  const out = [...paths];
  const pending = files.map((_, i) => i).filter((i) => move[i]);
  const tried = new Map<number, number>(pending.map((i) => [i, 1]));
  while (pending.length) {
    // The next free " (n)" of each file still to place, checked on the disk together.
    const candidates = pending.map((i) => {
      let n = (tried.get(i) ?? 1) + 1;
      let path = inFolder(folder, numbered(files[i], n));
      while (chosen.has(path.toLowerCase()) || opts.queued.has(path.toLowerCase()))
        path = inFolder(folder, numbered(files[i], ++n));
      tried.set(i, n);
      return path;
    });
    const busy = await opts.exists(candidates);
    for (let k = pending.length - 1; k >= 0; k--) {
      if (busy[k]) continue;
      const i = pending[k];
      out[i] = candidates[k];
      chosen.add(candidates[k].toLowerCase());
      pending.splice(k, 1);
    }
  }
  return {
    paths: out,
    replaced: mode === "replace" ? out.filter((p, i) => there[i] && p === paths[i]) : [],
    suffixed: out.filter((p, i) => p !== paths[i]),
  };
}

/** Checks every part before anything is asked: refused as a whole, with what is wrong. */
export function checkParts(
  parts: readonly PartRange[],
  duration: number,
): { ok: true } | { ok: false; error: string } {
  if (!parts.length) return { ok: false, error: "Nenhuma parte para exportar." };
  if (parts.length > MAX_PARTS)
    return {
      ok: false,
      error: `São ${parts.length} partes; o máximo é ${MAX_PARTS} numa chamada. Nada foi exportado.`,
    };
  const bad = parts
    .map((part, i) => ({ part, i }))
    .filter(
      ({ part }) =>
        part.to <= part.from + MIN_PART || part.from >= duration - EPS || part.from < -EPS,
    );
  if (bad.length)
    return {
      ok: false,
      error: `Partes fora da aula (${clock(duration)}) ou com menos de meio segundo: ${bad.map(({ part, i }) => `${i + 1} (${clock(part.from)}–${clock(part.to)})`).join(", ")}. Nada foi exportado.`,
    };
  return { ok: true };
}

/** What export_video with several parts needs from the editor (the renderer gives the real ones). */
export interface ExportPartsSteps {
  /** The check before exporting of the lesson as it is. */
  check(): Promise<readonly Finding[]>;
  /** Asks the person whether to export despite the problems; true to go on. */
  confirm(problems: readonly string[]): Promise<boolean>;
  /** The folder dialog: one folder for every part; null when cancelled. */
  pickFolder(): Promise<string | null>;
  exists(paths: string[]): Promise<boolean[]>;
  /** Paths the export queue is writing, in lower case. */
  queued(): ReadonlySet<string>;
  /** Some files are already in the folder: replace them all, add a suffix, or stop (null). */
  ask(names: string[]): Promise<Conflict | null>;
  /** Puts one part in the queue; returns its id. */
  enqueue(part: PartRange, outPath: string): string;
}

export type ExportPartsResult =
  | {
      ok: true;
      parts: { id: string; from: number; to: number; outPath: string }[];
      folder: string;
      confirmed: boolean;
      replaced: string[];
      suffixed: string[];
    }
  | { ok: false; reason: "refused" | "cancelled"; text: string };

/**
 * export_video with several parts: the check before exporting once for the lesson (with problems,
 * the person confirms or nothing is exported), one folder picked by the person, one question
 * when files are already there, then every part in the queue at once.
 */
export async function runExportParts(
  steps: ExportPartsSteps,
  parts: readonly PartRange[],
  files: readonly string[],
): Promise<ExportPartsResult> {
  const problems = (await steps.check())
    .filter((f) => f.severity === "error")
    .map((f) => f.message);
  let confirmed = false;
  if (problems.length) {
    confirmed = await steps.confirm(problems);
    if (!confirmed)
      return {
        ok: false,
        reason: "refused",
        text: `A pessoa não quis exportar com ${problems.length === 1 ? "o problema" : `os ${problems.length} problemas`} da verificação: ${problems.join(" ")} Nada foi exportado; corrija com check_before_export.`,
      };
  }
  const folder = await steps.pickFolder();
  if (!folder)
    return {
      ok: false,
      reason: "cancelled",
      text: "A pessoa fechou a janela de escolher a pasta. Nada foi exportado.",
    };
  const placed = await placeParts(folder, files, {
    exists: steps.exists,
    queued: steps.queued(),
    ask: steps.ask,
  });
  if (!placed)
    return {
      ok: false,
      reason: "cancelled",
      text: "Alguns arquivos já estavam na pasta e a pessoa preferiu não exportar. Nada foi exportado.",
    };
  const queued = parts.map((part, i) => ({
    id: steps.enqueue(part, placed.paths[i]),
    from: part.from,
    to: part.to,
    outPath: placed.paths[i],
  }));
  return {
    ok: true,
    parts: queued,
    folder,
    confirmed,
    replaced: placed.replaced,
    suffixed: placed.suffixed,
  };
}
