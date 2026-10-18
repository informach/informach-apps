import {
  analyze,
  applyCuts,
  cutTargets,
  type Issue,
  type IssueKind,
  mergeRanges,
  protectedConflicts,
  type TimelineWord,
  timelineSilences,
  timelineWords,
} from "@shared/cleanup";
import { promptTerms } from "@shared/glossary";
import { newId } from "@shared/timeline";
import type { Asset, EngineStatus, Project, Transcript } from "@shared/types";
import { transcriptView } from "@shared/wordEdits";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { useApp } from "@/state/app";
import { type Commit, personCommit, useProject } from "@/state/project";
import { projectCorrectionTerms, useCorrectionTerms } from "./glossaryStore";
import { mediaUrl } from "./media";

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
function readable(raw: Transcript, asset: Asset | undefined, terms: string[]): Transcript {
  const key = terms.join("|");
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

export interface CleanupState {
  minSilence: number;
  keepPause: number;
  kinds: Record<IssueKind, boolean>;
  /** Issues the user chose to keep. */
  kept: Set<string>;
  language: string;
}

export const useCleanup = create<
  CleanupState & { set: (p: Partial<CleanupState>) => void; toggleKept: (id: string) => void }
>((set, get) => ({
  minSilence: 1,
  keepPause: 0.4,
  kinds: { filler: true, silence: true, repeat: true },
  kept: new Set(),
  language: "pt",
  set: (p) => set(p),
  toggleKept: (id) => {
    const kept = new Set(get().kept);
    if (kept.has(id)) kept.delete(id);
    else kept.add(id);
    set({ kept });
  },
}));

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

export interface TextModel {
  words: TimelineWord[];
  issues: Issue[];
  /** Issues that will be cut (enabled kind and not kept). */
  active: Issue[];
  saved: number;
}

/** Timeline words plus detected issues, recomputed when the edit or the options change. */
export function useTextModel(
  project: Project | null,
  transcripts: Map<string, Transcript>,
): TextModel {
  const { minSilence, keepPause, kinds, kept } = useCleanup();
  return useMemo(() => {
    if (!project || transcripts.size === 0) return { words: [], issues: [], active: [], saved: 0 };
    const words = timelineWords(project, transcripts);
    const issues = analyze(words, timelineSilences(project, transcripts), {
      minSilence,
      keepPause,
    });
    // Protected passages are never offered for automatic cutting.
    const active = issues.filter(
      (i) =>
        kinds[i.kind] && !kept.has(i.id) && !protectedConflicts(project, [[i.start, i.end]]).length,
    );
    // Repeats can contain pauses that are also flagged, so measure the merged ranges.
    let saved = 0;
    for (const [a, b] of mergeRanges(active.map((i) => [i.start, i.end]))) saved += b - a;
    return { words, issues, active, saved };
  }, [project, transcripts, minSilence, keepPause, kinds, kept]);
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
export function cutRanges(ranges: [number, number][], commit: Commit = personCommit): CutResult {
  const { project } = useProject.getState();
  if (!project || !ranges.length) return { ok: false, conflicts: [] };
  const conflicts = protectedConflicts(project, ranges);
  if (conflicts.length) return { ok: false, conflicts };
  const targets = cutTargets(project);
  // Locked tracks are never touched, not even trimmed at the end.
  const locked = new Set(project.tracks.filter((t) => t.locked).map((t) => t.id));
  const ok = commit((p) => ({ ...p, clips: applyCuts(p.clips, ranges, targets, locked) }));
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
