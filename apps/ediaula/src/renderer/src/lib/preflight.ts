import { buildCues, captionWords, cueLayout } from "@shared/captions";
import { speechIntervals, timelineWords } from "@shared/cleanup";
import { type Finding, type Loudness, preflight } from "@shared/preflight";
import { newId } from "@shared/timeline";
import type { Project } from "@shared/types";
import { setCaptions } from "@/editor/CaptionSettings";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { updateAnnotation } from "./annotations";
import { projectSpeech } from "./audio";
import { showProposal } from "./proposals";
import { reconnectMissing } from "./relink";
import { currentView } from "./script";
import {
  cleanError,
  cutRangesInteractive,
  loadCleanupInputs,
  loadProjectTranscripts,
} from "./transcripts";
import { ensureTreated } from "./voice";

/**
 * The check before exporting in the editor: reads what shared/preflight.ts needs (the words,
 * where anyone is heard, the captions, the script and, when asked, the volume measured by the
 * main process) and carries out the fixes it offers. Every list is tied to the revision of the
 * lesson it was made on: a fix only ever acts on that revision.
 */

/** The findings of a lesson at one revision of it. */
export interface LessonCheck {
  findings: Finding[];
  revision: number;
  projectId: string;
}

/** A volume measured on one revision of the lesson. */
export interface MeasuredLoudness {
  value: Loudness | null;
  revision: number;
}

/**
 * Measures the lesson's mixed sound as the export mixes it (main/loudness.ts): the treated
 * voices first (a treatment still running is waited for, one missing is made), then the music
 * stepping aside on the speech, as a job in the status bar.
 */
export async function measureLoudness(): Promise<MeasuredLoudness> {
  const { startJob, endJob } = useApp.getState();
  const jobId = newId("job");
  startJob(jobId, "Medindo o volume da aula");
  try {
    await ensureTreated();
    const { project, revision } = useProject.getState();
    if (!project) throw new Error("Nenhum projeto aberto.");
    const speech = project.tracks.some((t) => t.music) ? await projectSpeech(project) : undefined;
    const value = await window.api.measureLoudness(jobId, JSON.stringify(project), speech);
    return { value, revision };
  } finally {
    endJob(jobId);
  }
}

/**
 * Every finding about `project` at `revision` (the open lesson as the caller read it). `loudness`
 * counts only when it was measured on this same revision; `srt` says the .srt goes out with the
 * export.
 */
export async function checkLesson(
  project: Project,
  revision: number,
  opts: { loudness?: MeasuredLoudness | null; normalize?: boolean; srt?: boolean } = {},
): Promise<LessonCheck> {
  const transcripts = await loadProjectTranscripts(project);
  const inputs = await loadCleanupInputs(project, transcripts);
  const words = transcripts.size ? timelineWords(project, transcripts) : [];
  // The captions as the export makes them: only what is heard, each word once.
  const cueWords = transcripts.size ? captionWords(project, transcripts) : [];
  const view = transcripts.size ? await currentView(project) : null;
  const loudness =
    opts.loudness && opts.loudness.revision === revision ? opts.loudness.value : undefined;
  const findings = preflight(project, {
    words,
    speech: speechIntervals(project, { transcripts, envelopes: inputs.envelopes }),
    cues: cueWords.length ? buildCues(cueWords, 42, 2, cueLayout(project)) : [],
    ...(opts.srt !== undefined ? { srt: opts.srt } : {}),
    ...(view ? { section: view.section, alignment: view.alignment } : {}),
    ...(loudness !== undefined ? { loudness } : {}),
    ...(opts.normalize !== undefined ? { normalize: opts.normalize } : {}),
    solo: useApp.getState().solo,
  });
  return { findings, revision, projectId: project.id };
}

/** Whether a list is still about the lesson as it is (same lesson, same revision). */
export const checkIsCurrent = (check: LessonCheck): boolean => {
  const { project, revision } = useProject.getState();
  return !!project && project.id === check.projectId && revision === check.revision;
};

/** "Ir até": the playhead to where the finding is. */
export function goToFinding(f: Finding): void {
  if (f.at === undefined) return;
  playback.pause();
  playback.seek(f.at);
}

/**
 * Carries out a finding's fix, only on the revision of the lesson the finding was made on: once
 * the lesson changed, its times may point elsewhere, and the list is made again instead.
 * `normalize` turns on the export's volume normalization (the export dialog owns that choice).
 * Returns whether something was done.
 */
export async function runFix(
  f: Finding,
  check: LessonCheck,
  opts: { normalize?: () => void; withoutCursor?: () => void } = {},
): Promise<boolean> {
  const fix = f.fix;
  if (!fix) return false;
  const { toast } = useApp.getState();
  const p = useProject.getState().project;
  if (!p) return false;
  if (!checkIsCurrent(check)) {
    toast("A aula mudou desde a verificação: a lista está sendo feita de novo.", "info");
    return false;
  }
  try {
    switch (fix.action) {
      case "cut":
        return cutRangesInteractive(fix.ranges);
      case "propose-cut": {
        const msg = await showProposal(
          p,
          "Verificação antes de exportar",
          fix.ranges.map(([start, end]) => ({
            start,
            end,
            reason: fix.reason,
            category: "off-script" as const,
          })),
          check.revision,
          "verificacao",
        );
        toast(msg.split("\n")[0], "info");
        return true;
      }
      case "relink":
        await reconnectMissing();
        return true;
      case "chapters":
        return useProject
          .getState()
          .commit((q) => ({ ...q, publish: { ...q.publish, chapters: fix.chapters } }));
      case "normalize":
        opts.normalize?.();
        return !!opts.normalize;
      case "annotation-size":
        await updateAnnotation(fix.clipId, { fontSize: fix.fontSize });
        return true;
      case "caption-size":
        setCaptions({ size: fix.size });
        return true;
      case "without-cursor":
        opts.withoutCursor?.();
        return !!opts.withoutCursor;
      case "solo-off":
        useApp.getState().set({ solo: [] });
        return true;
    }
  } catch (err) {
    toast(`A correção não pôde ser feita: ${cleanError(err)}`, "error");
    return false;
  }
}
