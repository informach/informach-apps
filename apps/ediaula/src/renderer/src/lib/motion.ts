import { screenRecordings } from "@shared/activity";
import { newId } from "@shared/timeline";
import type { Asset, Project } from "@shared/types";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { cleanError } from "./transcripts";

/** Analyses started in this session, so a panel re-rendering does not start them again. */
const started = new Set<string>();

/**
 * Finds, in the background (main/scheduler.ts), where a screen recording stands still. Until it
 * is done the cleanup cuts no pause of that recording (shared/activity.ts).
 */
async function analyze(asset: Asset): Promise<void> {
  const { patchAsset } = useProject.getState();
  const { startJob, endJob, toast } = useApp.getState();
  const jobId = newId("job");
  patchAsset(asset.id, { motionStatus: "pending" });
  startJob(jobId, `Vendo onde a tela fica parada: ${asset.name}`);
  try {
    const input = asset.proxyStatus === "ready" && asset.proxy ? asset.proxy : asset.path;
    const motion = await window.api.motion(jobId, asset.path, input, asset.duration);
    patchAsset(asset.id, { motion, motionStatus: "ready" });
  } catch (err) {
    patchAsset(asset.id, { motionStatus: "error" });
    toast(
      `Não consegui ver onde a tela de ${asset.name} fica parada: ${cleanError(err)}. Os silêncios dela não serão cortados.`,
      "error",
    );
  } finally {
    endJob(jobId);
  }
}

/** Starts the analysis of every screen recording of the lesson that does not have one yet. */
export function requestMotion(project: Project): void {
  for (const asset of screenRecordings(project)) {
    // A "pending" left by an earlier session is started again; this session's runs only once.
    if (asset.motion || asset.missing || started.has(asset.path)) continue;
    started.add(asset.path);
    void analyze(asset);
  }
}
