import { newId } from "@shared/timeline";
import type { ExportSpec } from "@shared/types";
import { useApp } from "@/state/app";
import { prepareCaptions } from "@/state/exportQueue";
import { usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { actions } from "./actions";
import { ensureCursorSprites } from "./cursorRender";
import { bytes } from "./format";
import { ensureRevealSprites } from "./reveal";
import { cleanError } from "./transcripts";

/**
 * The exports that are not a video of the lesson: the current frame as a PNG (the export's own
 * plan, one frame long), the lesson packed with its media in a ZIP, and opening such a package.
 */

const safeName = (name: string): string => name.replace(/[<>:"/\\|?*]/g, "").trim() || "aula";

/** Exportar o quadro atual: the frame under the playhead, at the lesson's size, as a PNG. */
export async function exportCurrentFrame(): Promise<boolean> {
  const { toast, startJob, endJob } = useApp.getState();
  const project = useProject.getState().project;
  if (!project) return false;
  const t = usePlayback.getState().time;
  const stamp = `${Math.floor(t / 60)}m${String(Math.floor(t % 60)).padStart(2, "0")}s`;
  const outPath = await window.api.pickFramePath(`${safeName(project.name)} ${stamp}`);
  if (!outPath) return false;
  const jobId = newId("frame");
  startJob(jobId, "Exportando o quadro atual");
  try {
    const spec: ExportSpec = {
      outPath,
      width: project.settings.width,
      height: project.settings.height,
      fps: project.settings.fps,
      videoBitrate: 1,
      normalizeLoudness: false,
      encoder: "x264",
    };
    await prepareCaptions(project, spec, false, () => undefined);
    spec.cursors = await ensureCursorSprites(project);
    const reveals = await ensureRevealSprites(project);
    if (Object.keys(reveals).length) spec.reveals = reveals;
    const path = await window.api.exportFramePng(jobId, JSON.stringify(project), t, spec);
    toast(`Quadro salvo em ${path}.`, "success");
    return true;
  } catch (err) {
    toast(`O quadro não foi exportado: ${cleanError(err)}`, "error");
    return false;
  } finally {
    endJob(jobId);
  }
}

/** Empacotar a aula: the project and every media it uses in one ZIP, for another computer. */
export async function packLesson(): Promise<boolean> {
  const { toast, startJob, endJob } = useApp.getState();
  const project = useProject.getState().project;
  if (!project) return false;
  if (!(await useProject.getState().saveNow())) {
    toast("Salve a aula antes de empacotar.", "error");
    return false;
  }
  const jobId = newId("pack");
  startJob(jobId, `Empacotando: ${project.name}`);
  try {
    const done = await window.api.packProject(
      jobId,
      JSON.stringify(project),
      safeName(project.name),
    );
    if (!done) return false;
    toast(
      `Aula empacotada com ${done.files} ${done.files === 1 ? "arquivo" : "arquivos"} (${bytes(done.bytes)}) em ${done.path}.`,
      "success",
    );
    if (done.droppedVoices)
      toast(
        done.droppedVoices === 1
          ? "Uma voz exportada para o vídeo do apresentador ficou fora do pacote, porque os arquivos dela não estão mais no computador."
          : `${done.droppedVoices} vozes exportadas para o vídeo do apresentador ficaram fora do pacote, porque os arquivos delas não estão mais no computador.`,
        "info",
      );
    return true;
  } catch (err) {
    toast(`A aula não foi empacotada: ${cleanError(err)}`, "error");
    return false;
  } finally {
    endJob(jobId);
  }
}

/** Abrir aula empacotada: extracts the ZIP into the projects folder and opens the lesson. */
export async function openPackagedLesson(): Promise<void> {
  const { toast } = useApp.getState();
  try {
    const path = await window.api.openPackage();
    if (path) await actions.openProject(path);
  } catch (err) {
    toast(`O pacote não abriu: ${cleanError(err)}`, "error");
  }
}
