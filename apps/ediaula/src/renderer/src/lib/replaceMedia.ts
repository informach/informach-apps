import { lengthMismatch, replaceAsset, timeMap } from "@shared/replaceAsset";
import { newId } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { useApp } from "@/state/app";
import { useProject, waitForDraft } from "@/state/project";
import { baseName } from "./format";
import { enrich } from "./importMedia";
import { cleanError, loadAssetTranscript, loadTranscript } from "./transcripts";

/**
 * Substituir mídia… (biblioteca): a new file in the place of a media, every clip keeping its
 * edits (shared/replaceAsset.ts). With the old one transcribed, the new one is transcribed too
 * and the clips follow the words; without it, only a file of the same length takes the place.
 * One undo step brings the old media back with its clips.
 */
export async function replaceMedia(assetId: string): Promise<boolean> {
  const { toast, startJob, endJob } = useApp.getState();
  const before = useProject.getState().project;
  const old = before?.assets.find((a) => a.id === assetId);
  if (!before || !old || waitForDraft("substituir a mídia")) return false;
  const [path] = await window.api.pickMedia();
  if (!path) return false;
  let next: Asset;
  try {
    const info = await window.api.probe(path);
    next = {
      id: newId("a"),
      name: baseName(path),
      path,
      kind: info.kind,
      duration: info.duration,
      width: info.width,
      height: info.height,
      fps: info.fps,
      hasVideo: info.hasVideo,
      hasAudio: info.hasAudio,
      size: info.size,
      vfr: info.vfr,
      ...(info.alpha ? { alpha: true } : {}),
      proxyStatus: "none",
    };
  } catch (err) {
    toast(`Não foi possível abrir ${baseName(path)}: ${cleanError(err)}`, "error");
    return false;
  }
  let map: ((s: number) => number) | null = null;
  const transcribed = old.transcript && old.transcriptStatus === "ready" && next.hasAudio;
  if (transcribed) {
    const jobId = newId("job");
    startJob(jobId, `Transcrevendo ${next.name} para encaixar os cortes`);
    try {
      // In the same language as the current one.
      const was = await loadAssetTranscript(before, old);
      const language = /^[a-z]{2,3}$/.test(was.language) ? was.language : "pt";
      const transcript = await window.api.transcribe(jobId, path, next.duration, language, []);
      next = { ...next, transcript, transcriptStatus: "ready" };
      map = timeMap(was.words, (await loadTranscript(transcript)).words);
    } catch (err) {
      toast(`A transcrição do arquivo novo falhou: ${cleanError(err)}`, "error");
      return false;
    } finally {
      endJob(jobId);
    }
    if (!map) {
      toast(
        "As falas do arquivo novo não batem com as do atual: os cortes não teriam onde ficar. Nada foi trocado.",
        "error",
      );
      return false;
    }
  } else {
    const why = lengthMismatch(old, next);
    if (why) {
      toast(why, "error");
      return false;
    }
  }
  let result: ReturnType<typeof replaceAsset> | null = null;
  const done = useProject.getState().commit((p) => {
    if (!p.assets.some((a) => a.id === assetId)) return p;
    result = replaceAsset(p, assetId, next, map);
    return result.project;
  });
  if (!done || !result) return false;
  const { remapped, dropped } = result;
  const placed = useProject.getState().project?.assets.find((a) => a.id === next.id);
  if (placed) void enrich(placed);
  toast(
    `${old.name} foi trocada por ${next.name}: os clipes mantêm posição, movimento, transições e remoção de fundo${map ? `; ${remapped} ${remapped === 1 ? "clipe seguiu" : "clipes seguiram"} as falas` : ""}${dropped ? `; ${dropped} ${dropped === 1 ? "clipe ficou" : "clipes ficaram"} de fora, porque as falas não estão no arquivo novo` : ""}.`,
    dropped ? "info" : "success",
  );
  return true;
}
