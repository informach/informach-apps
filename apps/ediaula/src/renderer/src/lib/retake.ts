import { cutTargets, timelineWords } from "@shared/cleanup";
import {
  type InsertEntry,
  layoutInserts,
  lockedAfter,
  planLineInsert,
  stillKey,
} from "@shared/inserts";
import type { RecordingResult } from "@shared/recording";
import { type RetakeLine, retakeLines, speechItemAt, takeOfLine } from "@shared/retake";
import type { ScriptSection } from "@shared/script";
import { alignSection } from "@shared/scriptAlign";
import { newId, sourceEnd } from "@shared/timeline";
import type { Asset, Project, Track, Transcript } from "@shared/types";
import { voiceTracks } from "@shared/voiceMaster";
import { voiceTakes } from "@shared/voiceTakes";
import { useApp } from "@/state/app";
import { draftCommit, useProject } from "@/state/project";
import { projectCorrectionTerms } from "./glossaryStore";
import { importMedia } from "./importMedia";
import { showProposal } from "./proposals";
import { openRecorder } from "./recording";
import { currentView } from "./script";
import {
  loadAssetTranscript,
  loadProjectTranscripts,
  transcribeAssets,
  useCleanup,
} from "./transcripts";
import { treatVoices } from "./voice";

/**
 * "Regravar falas": the recorder opens in "Só voz" with the teleprompter showing only the lines
 * missing from the lesson (or only partly in it), one take each. When the take comes back the
 * voice is treated and transcribed, each line is found in its take (findLine) and fitted in the
 * lesson between the lines around it (planLineInsert), all as one draft to review.
 */

/** The retake the recorder is open for: its lesson, section and lines. */
let pending: { projectId: string; section: number; lines: RetakeLine[] } | null = null;

/** Opens the recorder for the lines the lesson is missing; returns what to tell the person. */
export async function openRetake(): Promise<{ ok: boolean; message: string }> {
  const p = useProject.getState().project;
  if (!p) return { ok: false, message: "Nenhuma aula aberta." };
  const view = await currentView(p);
  if (!view) return { ok: false, message: "Cole o roteiro na aba Roteiro primeiro." };
  if (view.words.length && !view.confirmed)
    return {
      ok: false,
      message: `Confirme na aba Roteiro que esta gravação é da seção ${view.section.number} antes de regravar falas.`,
    };
  const lines = retakeLines(view.section, view.alignment);
  if (!lines.length)
    return { ok: false, message: "Todas as falas do roteiro desta seção já estão na aula." };
  pending = { projectId: p.id, section: view.index, lines };
  await openRecorder({ mode: "voice", retakeLines: lines.map((l) => l.line) });
  const missing = lines.filter((l) => l.state === "missing").length;
  return {
    ok: true,
    message: `Gravador aberto em Só voz com ${lines.length === 1 ? "1 fala" : `${lines.length} falas`} (${missing} ${missing === 1 ? "ausente" : "ausentes"}, ${lines.length - missing} pela metade). Leia uma de cada vez.`,
  };
}

/**
 * A take that comes back from the recorder: when it is the retake the recorder was opened for,
 * it goes into the lesson here (and true is returned); otherwise it is an ordinary take.
 */
export function takeRetake(r: RecordingResult): boolean {
  const open = pending;
  const project = useProject.getState().project;
  if (!open || r.mode !== "voice" || !r.microphone || project?.id !== open.projectId) return false;
  pending = null;
  void placeRetake(r, open).then(
    (message) => useApp.getState().toast(message, "info"),
    (err: unknown) =>
      useApp
        .getState()
        .toast(
          `As falas regravadas não entraram na aula: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        ),
  );
  return true;
}

/** The track the lesson's voice is on (a new "Voz" track when there is none). */
function voiceTrackOf(p: Project): { track: Track; created: boolean } {
  const found =
    voiceTracks(p)[0] ?? p.tracks.find((t) => t.kind === "audio" && !t.music && !t.locked);
  if (found) return { track: found, created: false };
  return {
    track: {
      id: newId("t"),
      kind: "audio",
      name: "Voz",
      muted: false,
      hidden: false,
      locked: false,
    },
    created: true,
  };
}

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

async function placeRetake(
  r: RecordingResult,
  open: { projectId: string; section: number; lines: RetakeLine[] },
): Promise<string> {
  const mic = r.microphone;
  if (!mic) throw new Error("A tomada não tem a voz.");
  const [asset] = await importMedia([mic]);
  if (!asset) throw new Error("A voz gravada não pôde ser lida.");
  const takes = voiceTakes(r);
  useProject.getState().patchAsset(asset.id, {
    name: `Regravação ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
    voiceTakes: takes,
  });
  // Treated like every "Só voz" take, and transcribed to find each line in its take.
  void treatVoices([asset.id], "teacher");
  const status = await window.api.engineStatus();
  let transcript: Transcript | undefined;
  if (status.bin && status.model) {
    await transcribeAssets([asset], useCleanup.getState().language);
    const lesson = useProject.getState().project;
    const now = lesson?.assets.find((a) => a.id === asset.id);
    if (lesson && now?.transcriptStatus === "ready")
      transcript = await loadAssetTranscript(lesson, now);
  }
  const start = useProject.getState().project;
  if (!start || start.id !== open.projectId) throw new Error("A aula aberta mudou.");
  const revision = useProject.getState().revision;
  const view = await currentView(start);
  const section: ScriptSection | undefined = view?.doc.sections[open.section];
  if (!view || !section) throw new Error("O roteiro da aula mudou.");
  const glossary = await projectCorrectionTerms(start);

  // Each line where it was said in the take.
  const sources = open.lines.flatMap((l) => {
    const item = speechItemAt(section, l.line);
    const src = item ? takeOfLine(asset.id, takes, l.line, item.text, transcript) : null;
    return src && item ? [{ line: l, src }] : [];
  });
  const unread = open.lines.filter((l) => !sources.some((s) => s.line === l));
  if (!sources.length)
    return "Nenhuma das falas foi gravada nesta tomada (passe de uma fala para a outra no teleprompter).";

  // One line at a time, in script order, each planned on the lesson as the ones before left it.
  const transcripts = await loadProjectTranscripts(start);
  if (transcript) transcripts.set(asset.id, transcript);
  const { track, created } = voiceTrackOf(start);
  let working: Project = created ? { ...start, tracks: [...start.tracks, track] } : start;
  const locked = new Set(start.tracks.filter((t) => t.locked).map((t) => t.id));
  const placed: string[] = [];
  const problems: string[] = [];
  const remaining = new Set(sources.map((s) => s.line.item));
  const stills = new Map<string, Asset>();
  for (const { line, src } of [...sources].sort((a, b) => a.line.item - b.line.item)) {
    remaining.delete(line.item);
    const alignment = alignSection(section, timelineWords(working, transcripts), { glossary });
    const plan = planLineInsert(section, alignment, line.item, src.end - src.start, remaining);
    const item = speechItemAt(section, line.line);
    if ("error" in plan || !item) {
      problems.push(
        `Fala ${line.line + 1}: ${"error" in plan ? plan.error : "não está no roteiro"}`,
      );
      continue;
    }
    const entry: InsertEntry = { item, src, plan };
    if (lockedAfter(working.clips, plan, locked).length) {
      problems.push(
        `Fala ${line.line + 1}: precisaria abrir ${plan.gap.toFixed(1)} s em ${clock(plan.cut)}, mas uma faixa travada passa por ali. Destrave e grave de novo.`,
      );
      continue;
    }
    const targets = new Set([...cutTargets(working), track.id].filter((id) => !locked.has(id)));
    // Still frames hold the screen while the timeline opens for the line.
    for (const { left } of layoutInserts(working, [entry], targets, locked, stills, track.id)
      .splits) {
      const key = stillKey(left);
      const a = working.assets.find((x) => x.id === left.assetId);
      if (!a || stills.has(key)) continue;
      stills.set(key, {
        id: newId("a"),
        name: `Quadro parado de ${a.name}`,
        path: await window.api.stillFrame(a.path, sourceEnd(left) - 1 / (a.fps || 30)),
        kind: "image",
        duration: 0,
        width: a.width,
        height: a.height,
        fps: 0,
        hasVideo: true,
        hasAudio: false,
        size: 0,
        proxyStatus: "none",
      });
    }
    const layout = layoutInserts(working, [entry], targets, locked, stills, track.id);
    working = {
      ...working,
      tracks: layout.tracks,
      assets: [...working.assets, ...layout.assets.filter((a) => !working.assets.includes(a))],
      clips: layout.clips,
    };
    placed.push(
      `fala ${line.line + 1} em ${clock(plan.at)}${plan.gap > 0 ? ` (abri ${plan.gap.toFixed(1)} s)` : ""}`,
    );
  }
  if (!placed.length) return problems.join("\n");
  if (useProject.getState().revision !== revision || useProject.getState().project?.id !== start.id)
    throw new Error(
      "A aula mudou enquanto as falas eram encaixadas. Grave de novo ou encaixe à mão.",
    );
  const result = working;
  const ok = draftCommit(
    "regravacao",
    "Falas regravadas",
    start.id,
  )((q) => ({
    ...q,
    tracks: result.tracks,
    assets: [...q.assets, ...result.assets.filter((a) => !q.assets.some((b) => b.id === a.id))],
    clips: result.clips,
  }));
  if (!ok)
    throw new Error("Há outro rascunho esperando revisão: aplique ou descarte e grave de novo.");
  // The incomplete take of a partial line is still in the lesson: offered for cutting.
  const partial = open.lines.filter(
    (l) => l.state === "partial" && sources.some((s) => s.line === l),
  );
  const ranges = partial.flatMap((l) => {
    const m = view.alignment.lines.find((x) => x.item === l.item);
    return m?.start !== undefined && m.end !== undefined
      ? [{ start: m.start, end: m.end, reason: `tomada incompleta da fala ${l.line + 1}` }]
      : [];
  });
  if (ranges.length)
    await showProposal(start, "Tomadas incompletas", ranges, revision, "regravacao");
  return [
    `Rascunho com ${placed.length === 1 ? "1 fala regravada" : `${placed.length} falas regravadas`}: ${placed.join(", ")}. Revise na barra acima da timeline.`,
    ...(ranges.length ? ["As tomadas incompletas ficaram numa proposta de corte."] : []),
    ...(unread.length
      ? [`Sem tomada: ${unread.map((l) => `fala ${l.line + 1}`).join(", ")}.`]
      : []),
    ...(transcript ? [] : ["Sem transcrição: cada fala entrou com a tomada inteira."]),
    ...problems,
  ].join("\n");
}
