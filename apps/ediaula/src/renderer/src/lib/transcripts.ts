import { normalizeScreenMotion, type ScreenMotion, screenRecordings } from "@shared/activity";
import {
  applyCuts,
  audibleClips,
  cutTargets,
  type Issue,
  keptEntries,
  protectedConflicts,
  type TimelineWord,
  timelineWords,
} from "@shared/cleanup";
import { type GlossaryTerm, promptTerms } from "@shared/glossary";
import { newId } from "@shared/timeline";
import type { Asset, CleanupSettings, EngineStatus, Project, Transcript } from "@shared/types";
import { transcriptView } from "@shared/wordEdits";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { loadCursorData } from "@/editor/CursorLayer";
import { useApp } from "@/state/app";
import { type Commit, personCommit, useProject } from "@/state/project";
import {
  type CleanupInputs,
  type CleanupPlan,
  cleanupChoices,
  cleanupPlan,
  KEPT_LIMIT,
} from "./cleanupPlan";
import { projectCorrectionTerms, useCorrectionTerms } from "./glossaryStore";
import { loadWaveform, mediaUrl } from "./media";
import { requestMotion } from "./motion";

const cache = new Map<string, Promise<Transcript>>();

export function loadTranscript(path: string): Promise<Transcript> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(mediaUrl(path)).then((r) => {
      if (!r.ok) throw new Error(`Transcrição não encontrada (${r.status})`);
      return r.json() as Promise<Transcript>;
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

/** Corrected views by transcript as recognized; made again only when edits or terms change. */
const views = new WeakMap<
  Transcript,
  { edits: Asset["wordEdits"]; terms: string; view: Transcript }
>();

/** A media's transcript as the editor reads it: hand corrections and glossary applied. */
function readable(raw: Transcript, asset: Asset | undefined, terms: GlossaryTerm[]): Transcript {
  const key = JSON.stringify(terms);
  const known = views.get(raw);
  if (known && known.edits === asset?.wordEdits && known.terms === key) return known.view;
  const view = transcriptView(raw, asset?.wordEdits, terms);
  views.set(raw, { edits: asset?.wordEdits, terms: key, view });
  return view;
}

/** Transcripts of every transcribed asset in the project (corrected), keyed by asset id. */
export function useTranscripts(project: Project | null): Map<string, Transcript> {
  const parameters = new URLSearchParams();
  for (const asset of project?.assets ?? [])
    if (asset.transcript && asset.transcriptStatus === "ready")
      parameters.append(asset.id, asset.transcript);
  const key = parameters.toString();
  const [raw, setRaw] = useState(new Map<string, Transcript>());
  useEffect(() => {
    let alive = true;
    Promise.all(
      Array.from(new URLSearchParams(key), async ([id, path]) => {
        try {
          return [id, await loadTranscript(path)] as const;
        } catch {
          return null;
        }
      }),
    ).then((list) => {
      if (alive) setRaw(new Map(list.filter((x): x is readonly [string, Transcript] => !!x)));
    });
    return () => {
      alive = false;
    };
  }, [key]);
  const terms = useCorrectionTerms(project);
  const assets = project?.assets;
  const last = useRef(new Map<string, Transcript>());
  return useMemo(() => {
    const byId = new Map((assets ?? []).map((a) => [a.id, a]));
    const out = new Map<string, Transcript>();
    for (const [id, tr] of raw) out.set(id, readable(tr, byId.get(id), terms));
    // Nothing corrected differently: the same map, so what depends on it is not recomputed.
    const prev = last.current;
    if (prev.size === out.size && [...out].every(([id, tr]) => prev.get(id) === tr)) return prev;
    last.current = out;
    return out;
  }, [raw, assets, terms]);
}

/** Transcription language, for this session (the cleanup choices live in the project). */
export const useCleanup = create<{ language: string; set: (p: { language: string }) => void }>(
  (set) => ({
    language: "pt",
    set: (p) => set(p),
  }),
);

/** Changes the cleanup choices of the open lesson (one undo step). */
export function setCleanup(changes: Partial<CleanupSettings>, commit: Commit = personCommit): void {
  commit((p) => ({ ...p, cleanup: { kept: [], ...p.cleanup, ...changes } }));
}

/**
 * Keeps a suggestion out of the cleanup, or lets it be cut again: a pause kept earlier may be
 * stored under another id (trimmed by a cut, split by a gesture), so every entry that covers it
 * goes (keptEntries).
 */
export function toggleKept(issue: Issue, commit: Commit = personCommit): void {
  commit((p) => {
    const kept = p.cleanup?.kept ?? [];
    const covering = keptEntries(p, kept, issue);
    const next = covering.length ? kept.filter((k) => !covering.includes(k)) : [...kept, issue.id];
    return { ...p, cleanup: { ...p.cleanup, kept: next.slice(-KEPT_LIMIT) } };
  });
}

/** The corrected transcript of one transcribed asset of a project. */
export async function loadAssetTranscript(p: Project, a: Asset): Promise<Transcript> {
  if (!a.transcript) throw new Error(`${a.name} ainda não foi transcrita.`);
  const [raw, terms] = await Promise.all([loadTranscript(a.transcript), projectCorrectionTerms(p)]);
  return readable(raw, a, terms);
}

/** Loads the (corrected) transcripts of every transcribed asset of a project. */
export async function loadProjectTranscripts(p: Project): Promise<Map<string, Transcript>> {
  const ready = p.assets.filter((a) => a.transcript && a.transcriptStatus === "ready");
  const loaded = await Promise.all(
    ready.map(async (a) => [a.id, await loadAssetTranscript(p, a)] as [string, Transcript]),
  );
  return new Map(loaded);
}

/**
 * The files the cleanup reads besides the transcripts, one per line ("kind\tasset\tpath"): the
 * sound envelope ("e") of heard media with no transcript yet, the cursor data ("c") and the
 * motion analysis ("m") of the screen recordings on the timeline. File paths never hold tabs or
 * line breaks.
 */
function cleanupFiles(p: Project, transcripts: ReadonlyMap<string, Transcript>): string {
  const heard = new Set(audibleClips(p).map((c) => c.assetId));
  const used = new Set(p.clips.map((c) => c.assetId));
  const screens = new Set(screenRecordings(p).map((a) => a.id));
  return p.assets
    .flatMap((a) => [
      ...(heard.has(a.id) && !transcripts.has(a.id) && a.waveform
        ? [`e\t${a.id}\t${a.waveform}`]
        : []),
      ...(used.has(a.id) && a.cursor && !a.cursorMissing ? [`c\t${a.id}\t${a.cursor}`] : []),
      ...(screens.has(a.id) && a.motion ? [`m\t${a.id}\t${a.motion}`] : []),
    ])
    .join("\n");
}

async function loadMotion(path: string): Promise<ScreenMotion> {
  const r = await fetch(mediaUrl(path));
  if (!r.ok) throw new Error(`Análise da tela não encontrada (${r.status})`);
  return normalizeScreenMotion(await r.json());
}

/**
 * Reads the files cleanupFiles() names. A recording whose cursor data cannot be read is listed
 * in `unseen` (its pauses are then judged by the sound alone).
 */
async function readCleanupFiles(
  files: string,
  transcripts: ReadonlyMap<string, Transcript>,
): Promise<CleanupInputs> {
  const envelopes = new Map<string, { peaksPerSecond: number; peaks: number[] }>();
  const cursors = new Map<string, unknown>();
  const screens = new Map<string, ScreenMotion | null>();
  const unseen: string[] = [];
  await Promise.all(
    files
      .split("\n")
      .filter(Boolean)
      .map(async (line) => {
        const [kind, id, path] = line.split("\t");
        if (kind === "e")
          try {
            envelopes.set(id, await loadWaveform(path));
          } catch (err) {
            // Without its envelope the whole clip counts as speech: nothing of it is cut as silence.
            console.warn(`[cleanup] the sound envelope of ${id} could not be read:`, err);
          }
        else if (kind === "m")
          try {
            screens.set(id, await loadMotion(path));
          } catch (err) {
            // Without it the recording counts as moving all the way: none of its pauses are cut.
            console.warn(`[cleanup] the motion analysis of ${id} could not be read:`, err);
          }
        else
          try {
            cursors.set(id, await loadCursorData(path));
          } catch {
            unseen.push(id);
          }
      }),
  );
  return { transcripts, envelopes, cursors, screens, unseen };
}

/**
 * What the cleanup reads besides the transcripts (cleanupPlan), for code that reads it once. A
 * screen recording not analyzed yet starts its analysis (lib/motion.ts).
 */
export function loadCleanupInputs(
  p: Project,
  transcripts: ReadonlyMap<string, Transcript>,
): Promise<CleanupInputs> {
  requestMotion(p);
  return readCleanupFiles(cleanupFiles(p, transcripts), transcripts);
}

/** The cleanup inputs of the open project, read again when the files it needs change. */
function useCleanupInputs(
  project: Project | null,
  transcripts: Map<string, Transcript>,
): CleanupInputs | null {
  // The project changes on every edit; the files it needs only when media come or go.
  const files = project ? cleanupFiles(project, transcripts) : null;
  const [inputs, setInputs] = useState<CleanupInputs | null>(null);
  const latest = useRef(project);
  latest.current = project;
  useEffect(() => {
    if (files === null) return setInputs(null);
    if (latest.current) requestMotion(latest.current);
    let alive = true;
    void readCleanupFiles(files, transcripts).then((loaded) => {
      if (alive) setInputs(loaded);
    });
    return () => {
      alive = false;
    };
  }, [files, transcripts]);
  return inputs?.transcripts === transcripts ? inputs : null;
}

export type TextModel = CleanupPlan;

/** Nothing to cut yet, with the lesson's own choices shown. */
const emptyModel = (project: Project | null, words: TimelineWord[] = []): TextModel => ({
  words,
  issues: [],
  active: [],
  keptIds: new Set(),
  elsewhere: 0,
  saved: 0,
  activity: [],
  choices: cleanupChoices(project?.cleanup),
  blind: { noCursor: [], unreadable: [], noEnvelope: [], inaudible: [], screenPending: [] },
});

/**
 * Timeline words plus detected issues (cleanupPlan), recomputed when the edit changes. Until the
 * envelopes and cursor data are read (`loading`), nothing is offered for cutting: a pause could
 * still turn out to be a silent demonstration.
 */
export function useTextModel(
  project: Project | null,
  transcripts: Map<string, Transcript>,
): TextModel & { unseen: readonly string[]; loading: boolean } {
  const inputs = useCleanupInputs(project, transcripts);
  return useMemo(() => {
    if (!project || transcripts.size === 0)
      return { ...emptyModel(project), unseen: [], loading: false };
    if (!inputs)
      return {
        ...emptyModel(project, timelineWords(project, transcripts)),
        unseen: [],
        loading: true,
      };
    return { ...cleanupPlan(project, inputs), unseen: inputs.unseen ?? [], loading: false };
  }, [project, transcripts, inputs]);
}

export interface CutResult {
  /** The cut was made (false when protection blocks it or the commit was refused). */
  ok: boolean;
  /** Protected passages the cut would have touched (nothing is cut when there are any). */
  conflicts: { range: [number, number]; label: string }[];
}

/**
 * Cuts timeline ranges on every speech/video track, keeping them in sync. Refuses the whole
 * cut when any range touches a protected passage: removing it must be an explicit decision.
 */
export function cutRanges(
  ranges: [number, number][],
  commit: Commit = personCommit,
  /** Something else to change in the same undo step (what was kept of a proposal). */
  also: (p: Project) => Project = (p) => p,
): CutResult {
  const { project } = useProject.getState();
  if (!project || !ranges.length) return { ok: false, conflicts: [] };
  const conflicts = protectedConflicts(project, ranges);
  if (conflicts.length) return { ok: false, conflicts };
  const targets = cutTargets(project);
  // Locked tracks are never touched, not even trimmed at the end.
  const locked = new Set(project.tracks.filter((t) => t.locked).map((t) => t.id));
  const ok = commit((p) => also({ ...p, clips: applyCuts(p.clips, ranges, targets, locked) }));
  return { ok, conflicts: [] };
}

/** Cuts with a toast when protection blocks it, for direct user actions. */
export function cutRangesInteractive(ranges: [number, number][]): boolean {
  const r = cutRanges(ranges);
  if (!r.ok && r.conflicts.length)
    useApp
      .getState()
      .toast(
        `Trecho protegido: "${r.conflicts[0].label}". Tire a proteção na aba Transcrição antes de cortar.`,
        "error",
      );
  return r.ok;
}

export { wordsRange } from "@shared/cleanup";

/* ----- Engine and transcription jobs ----- */

export const useEngine = create<{ status: EngineStatus | null; refresh: () => Promise<void> }>(
  (set) => ({
    status: null,
    refresh: async () => set({ status: await window.api.engineStatus() }),
  }),
);

export async function runEngineInstall(variant: "cuda" | "cpu"): Promise<void> {
  const { startJob, endJob, toast } = useApp.getState();
  const jobId = newId("job");
  startJob(jobId, variant === "cuda" ? "Baixando motor (GPU)" : "Baixando motor (CPU)");
  try {
    useEngine.setState({ status: await window.api.installEngine(jobId, variant) });
    toast("Motor de transcrição instalado.", "success");
  } catch (err) {
    toast(`Não foi possível instalar o motor: ${cleanError(err)}`, "error");
  } finally {
    endJob(jobId);
  }
}

export async function runModelInstall(name: string): Promise<void> {
  const { startJob, endJob, toast } = useApp.getState();
  const jobId = newId("job");
  startJob(jobId, `Baixando modelo ${name}`);
  try {
    useEngine.setState({ status: await window.api.installModel(jobId, name) });
    toast("Modelo instalado.", "success");
  } catch (err) {
    toast(`Não foi possível baixar o modelo: ${cleanError(err)}`, "error");
  } finally {
    endJob(jobId);
  }
}

export const cleanError = (err: unknown): string =>
  String((err as Error)?.message ?? err).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );

/** Transcription job ids by asset, so the panel can show progress. */
export const useTranscribing = create<Record<string, string>>(() => ({}));

export async function transcribeAssets(assets: Asset[], language: string): Promise<void> {
  const { startJob, endJob, toast } = useApp.getState();
  const { patchAsset } = useProject.getState();
  const project = useProject.getState().project;
  // The names the script mentions most go into whisper's prompt; the rest correct on reading.
  const glossary = project
    ? promptTerms(await projectCorrectionTerms(project), project.script?.text)
    : [];
  // One at a time: the GPU is shared, and the first result shows up sooner.
  for (const a of assets) {
    const jobId = newId("job");
    useTranscribing.setState({ [a.id]: jobId });
    startJob(jobId, `Transcrevendo ${a.name}`);
    patchAsset(a.id, { transcriptStatus: "pending" });
    try {
      const path = await window.api.transcribe(jobId, a.path, a.duration, language, glossary);
      patchAsset(a.id, { transcript: path, transcriptStatus: "ready" });
    } catch (err) {
      patchAsset(a.id, { transcriptStatus: "error" });
      toast(`Falha ao transcrever ${a.name}: ${cleanError(err)}`, "error");
    } finally {
      endJob(jobId);
      const rest = { ...useTranscribing.getState() };
      delete rest[a.id];
      useTranscribing.setState(rest, true);
    }
  }
}

export { speechCandidates } from "@shared/speechSources";
