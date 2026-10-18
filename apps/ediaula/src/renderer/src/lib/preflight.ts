import { buildCues, cueLayout } from "@shared/captions";
import { speechIntervals, timelineWords } from "@shared/cleanup";
import { type Finding, type Loudness, preflight } from "@shared/preflight";
import { newId } from "@shared/timeline";
import type { Project } from "@shared/types";
import { setCaptions } from "@/editor/CaptionSettings";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { updateAnnotation } from "./annotations";
import { showProposal } from "./proposals";
import { reconnectMissing } from "./relink";
import { currentView } from "./script";
import {
  cleanError,
  cutRangesInteractive,
  loadCleanupInputs,
  loadProjectTranscripts,
} from "./transcripts";

/**
 * The check before exporting in the editor: reads what shared/preflight.ts needs (the words,
 * where anyone is heard, the captions, the script and, when asked, the volume measured by the
 * main process) and carries out the fixes it offers.
 */

/** Measures the lesson's mixed sound (main/loudness.ts), as a job in the status bar. */
export async function measureLoudness(project: Project): Promise<Loudness | null> {
  const { startJob, endJob } = useApp.getState();
  const jobId = newId("job");
  startJob(jobId, "Medindo o volume da aula");
  try {
    return await window.api.measureLoudness(jobId, JSON.stringify(project));
  } finally {
    endJob(jobId);
  }
}

/** Every finding about `project`; `loudness` measures the volume too (a few seconds per minute). */
export async function checkLesson(
  project: Project,
  opts: { loudness?: Loudness | null; normalize?: boolean } = {},
): Promise<Finding[]> {
  const transcripts = await loadProjectTranscripts(project);
  const inputs = await loadCleanupInputs(project, transcripts);
  const words = transcripts.size ? timelineWords(project, transcripts) : [];
  const view = transcripts.size ? await currentView(project) : null;
  return preflight(project, {
    words,
    speech: speechIntervals(project, { transcripts, envelopes: inputs.envelopes }),
    cues: words.length ? buildCues(words, 42, 2, cueLayout(project)) : [],
    ...(view ? { section: view.section, alignment: view.alignment } : {}),
    ...(opts.loudness !== undefined ? { loudness: opts.loudness } : {}),
    ...(opts.normalize !== undefined ? { normalize: opts.normalize } : {}),
  });
}

/** "Ir até": the playhead to where the finding is. */
export function goToFinding(f: Finding): void {
  if (f.at === undefined) return;
  playback.pause();
  playback.seek(f.at);
}

/**
 * Carries out a finding's fix. `normalize` turns on the export's volume normalization (the export
 * dialog owns that choice). Returns whether something was done.
 */
export async function runFix(f: Finding, opts: { normalize?: () => void } = {}): Promise<boolean> {
  const fix = f.fix;
  if (!fix) return false;
  const { toast } = useApp.getState();
  const p = useProject.getState().project;
  if (!p) return false;
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
          useProject.getState().revision,
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
    }
  } catch (err) {
    toast(`A correção não pôde ser feita: ${cleanError(err)}`, "error");
    return false;
  }
}
