import {
  intervalLines,
  type NarrationLine,
  placeNarration,
  type TakeMark,
} from "@shared/guidedNarration";
import { findLine, INSERT_PAD } from "@shared/inserts";
import { newId } from "@shared/timeline";
import type { Asset, Clip, Project, Track, Transcript } from "@shared/types";
import { draftCommit, useProject } from "@/state/project";
import { clickTargets } from "./courseTemplate";
import { currentView } from "./script";
import { loadAssetTranscript, transcribeAssets, useCleanup } from "./transcripts";

/**
 * "Narrar intervalo" guided by the script (NarrationPanel): the lines of the stretch for the
 * teleprompter, and, when the take is accepted, each line found in it and placed as a draft at
 * the moment of the screen it belongs to (shared/guidedNarration.ts).
 */

export interface NarrationScript {
  lines: NarrationLine[];
  /** Timeline seconds of the screen's moments: clicks of the guided or screen recording and
   *  where the script's "Na tela" directions apply. */
  anchors: number[];
}

/** The script lines and the screen's moments of [start, end]; null without a script. */
export async function narrationScript(
  project: Project,
  start: number,
  end: number,
): Promise<NarrationScript | null> {
  const view = await currentView(project);
  if (!view) return null;
  const lines = intervalLines(view.section, view.words.length ? view.alignment : null, start, end);
  if (!lines.length) return null;
  let clicks: number[] = [];
  try {
    clicks = (await clickTargets(project)).map((c) => c.t);
  } catch (err) {
    // Without the cursor data the lines snap only to the "Na tela" moments.
    console.warn("[ediaula] narration_clicks_unread", err instanceof Error ? err.message : err);
  }
  // A "Na tela" applies from the start of the line after it.
  const directions = view.section.items.flatMap((item, index) => {
    if (item.kind !== "screen") return [];
    const next = view.alignment.lines.find((l) => l.item > index && l.start !== undefined);
    return next?.start !== undefined ? [next.start] : [];
  });
  return {
    lines,
    anchors: [...clicks, ...directions].filter((t) => t >= start - 0.5 && t <= end + 0.5),
  };
}

/** The take's words between `from` and `to` (seconds of the take), to find one line in them. */
const within = (t: Transcript, from: number, to: number): Transcript => ({
  ...t,
  words: t.words.filter((w) => w.start >= from - 0.05 && w.end <= to + 0.05),
});

/**
 * The take goes into the lesson line by line, as a draft on a new "Narração" track: each line
 * where the person said it while the preview played, moved to the screen's moment next to it.
 * With the transcription engine installed the take is transcribed first, so each line is cut to
 * its words; without it, each line is the stretch between two marks.
 */
export async function placeGuidedNarration(opts: {
  projectId: string;
  asset: Asset;
  start: number;
  marks: TakeMark[];
  anchors: readonly number[];
}): Promise<string> {
  const { asset, projectId } = opts;
  if (useProject.getState().project?.id !== projectId)
    throw new Error("O projeto da narração foi fechado.");
  useProject.getState().patch((p) => ({ ...p, assets: [...p.assets, asset] }));
  // The sound envelope for the timeline and the cleanup, as for any narration.
  void window.api.waveform(asset.path).then(
    (waveform) => {
      if (useProject.getState().project?.id === projectId)
        useProject.getState().patchAsset(asset.id, { waveform });
    },
    (err: unknown) =>
      console.warn("[ediaula] narration_waveform", err instanceof Error ? err.message : err),
  );
  let transcript: Transcript | undefined;
  const status = await window.api.engineStatus();
  if (status.bin && status.model) {
    await transcribeAssets([asset], useCleanup.getState().language);
    const lesson = useProject.getState().project;
    const now = lesson?.assets.find((a) => a.id === asset.id);
    if (lesson && now?.transcriptStatus === "ready")
      transcript = await loadAssetTranscript(lesson, now);
  }
  const placed = placeNarration({
    start: opts.start,
    marks: opts.marks,
    takeLength: asset.duration,
    anchors: opts.anchors,
    ...(transcript
      ? {
          find: (text: string, from: number, to: number) => {
            const found = findLine(text, new Map([[asset.id, within(transcript, from, to)]]));
            return found && { start: found.start, end: found.end };
          },
        }
      : {}),
  });
  if (!placed.length) throw new Error("Nenhuma fala da tomada pôde ser posta na aula.");
  const track: Track = {
    id: newId("t"),
    kind: "audio",
    name: "Narração",
    muted: false,
    hidden: false,
    locked: false,
  };
  const clips: Clip[] = placed.map((l) => {
    const from = Math.max(0, l.src.start - INSERT_PAD / 2);
    const to = Math.min(asset.duration, l.src.end + INSERT_PAD / 2);
    return {
      id: newId("c"),
      assetId: asset.id,
      trackId: track.id,
      start: Math.max(0, l.at - (l.src.start - from)),
      in: from,
      duration: to - from,
      volume: 1,
    };
  });
  const ok = draftCommit(
    "narracao",
    "Narração guiada pelo roteiro",
    projectId,
  )((q) => ({
    ...q,
    tracks: [...q.tracks, track],
    clips: [...q.clips, ...clips],
  }));
  if (!ok) throw new Error("Há outro rascunho esperando revisão: aplique ou descarte antes.");
  const snapped = placed.filter((l) => l.snapped).length;
  return `${placed.length === 1 ? "1 fala" : `${placed.length} falas`} da narração ${placed.length === 1 ? "ficou" : "ficaram"} como rascunho${snapped ? `, ${snapped} no momento da tela` : ""}${transcript ? "" : " (sem transcrição: cada fala é o trecho entre duas trocas)"}. Revise na barra acima da timeline.`;
}
