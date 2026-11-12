import { lengthMismatch, type Replacement, replaceAsset, timeMap } from "@shared/replaceAsset";
import { newId } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { useApp } from "@/state/app";
import { structuralDraft, useProject, waitForDraft } from "@/state/project";
import { baseName } from "./format";
import { enrich } from "./importMedia";
import { bumpMedia } from "./media";
import { cleanError, loadAssetTranscript, loadTranscript } from "./transcripts";

/**
 * Substituir mídia… (biblioteca): a new file in the place of a media, every clip keeping its
 * edits (shared/replaceAsset.ts). With the old one transcribed, the new one is transcribed too
 * and the clips follow the words; without it, only a file of the same length takes the place.
 * One undo step brings the old media back with its clips.
 *
 * Choosing the same file (exported again over the old one, with the same name) updates the
 * media instead: see updateMedia.
 */
export async function replaceMedia(assetId: string): Promise<boolean> {
  const before = useProject.getState().project;
  const old = before?.assets.find((a) => a.id === assetId);
  if (!before || !old || waitForDraft("substituir a mídia")) return false;
  const [path] = await window.api.pickMedia();
  if (!path) return false;
  return replaceWith(assetId, path, false);
}

/**
 * The media's file was changed in place (same name, new content): the media takes it in, with
 * its name, its id and every clip's edits, whatever its new length (the clips keep their times in
 * the file, or follow the words when it was transcribed; what passes the new end is trimmed). Not
 * an edit: it is applied to the whole undo history, so Ctrl+Z never brings the old file's length
 * back. `auto`: seen on disk by the editor (lib/mediaUpdates.ts), not asked by the person; it
 * waits, silently, while a draft that changes the structure is under review.
 */
export async function updateMedia(assetId: string, auto: boolean): Promise<boolean> {
  const old = useProject.getState().project?.assets.find((a) => a.id === assetId);
  if (!old) return false;
  if (auto ? structuralDraft() : waitForDraft("atualizar a mídia")) return false;
  return replaceWith(assetId, old.path, auto);
}

async function replaceWith(assetId: string, path: string, auto: boolean): Promise<boolean> {
  const { toast, startJob, endJob } = useApp.getState();
  const before = useProject.getState().project;
  const old = before?.assets.find((a) => a.id === assetId);
  if (!before || !old) return false;
  // The same file again: the media is updated, keeping its id and its name.
  const same = path === old.path;
  let next: Asset;
  try {
    const info = await window.api.probe(path);
    next = {
      id: same ? old.id : newId("a"),
      name: same ? old.name : baseName(path),
      path,
      kind: info.kind,
      duration: info.duration,
      width: info.width,
      height: info.height,
      fps: info.fps,
      hasVideo: info.hasVideo,
      hasAudio: info.hasAudio,
      size: info.size,
      ...(info.mtime ? { mtime: info.mtime } : {}),
      vfr: info.vfr,
      ...(info.alpha ? { alpha: true } : {}),
      proxyStatus: "none",
    };
  } catch (err) {
    toast(`Não foi possível abrir ${baseName(path)}: ${cleanError(err)}`, "error");
    return false;
  }
  if (same && next.kind !== old.kind) {
    toast(`${old.name} mudou de tipo no disco e não foi atualizada.`, "error");
    return false;
  }
  let map: ((s: number) => number) | null = null;
  const notes: string[] = [];
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
      if (!same) {
        toast(`A transcrição do arquivo novo falhou: ${cleanError(err)}`, "error");
        return false;
      }
      // The file is already the new one: the lesson takes it in anyway, the clips at the same
      // times, without a transcript (Transcrever makes it again).
      notes.push(
        `A transcrição da versão nova falhou (${cleanError(err)}): os clipes ficaram nos mesmos tempos do arquivo; transcreva de novo.`,
      );
    } finally {
      endJob(jobId);
    }
    if (!map && next.transcript) {
      if (!same) {
        toast(
          "As falas do arquivo novo não batem com as do atual: os cortes não teriam onde ficar. Nada foi trocado.",
          "error",
        );
        return false;
      }
      notes.push(
        "As falas da versão nova não batem com as da anterior: os clipes ficaram nos mesmos tempos do arquivo. Confira os cortes.",
      );
    }
  } else if (!same) {
    const why = lengthMismatch(old, next);
    if (why) {
      toast(why, "error");
      return false;
    }
  }
  let result: Replacement | undefined;
  if (same) {
    // Same name, new content: the preview loads it again, and every step of the history has it.
    bumpMedia(path);
    const store = useProject.getState();
    if (store.project?.id !== before.id || !store.project.assets.some((a) => a.id === assetId))
      return false;
    result = replaceAsset(store.project, assetId, next, map);
    const now = result.project;
    store.rewriteMedia((p) =>
      p === store.project
        ? now
        : p.assets.some((a) => a.id === assetId)
          ? replaceAsset(p, assetId, next, map).project
          : p,
    );
  } else {
    const made: { result?: Replacement } = {};
    const done = useProject.getState().commit((p) => {
      if (!p.assets.some((a) => a.id === assetId)) return p;
      made.result = replaceAsset(p, assetId, next, map);
      return made.result.project;
    });
    if (!done || !made.result) return false;
    result = made.result;
  }
  const { remapped, dropped, warnings } = result;
  const placed = useProject.getState().project?.assets.find((a) => a.id === next.id);
  if (placed) void enrich(placed);
  const followed = map
    ? `; ${remapped} ${remapped === 1 ? "clipe seguiu" : "clipes seguiram"} as falas`
    : "";
  const left = dropped
    ? `; ${dropped} ${dropped === 1 ? "clipe ficou" : "clipes ficaram"} de fora, porque as falas não estão no arquivo novo`
    : "";
  toast(
    same
      ? `${old.name} ${auto ? "mudou no disco" : "foi atualizada"}: a aula já usa a versão nova, com o mesmo nome, e os clipes mantêm as edições${followed}${left}.`
      : `${old.name} foi trocada por ${next.name}: os clipes mantêm posição, movimento, transições e remoção de fundo${followed}${left}.`,
    dropped || warnings.length || notes.length ? "info" : "success",
  );
  for (const warning of [...notes, ...warnings]) toast(warning, "info");
  return true;
}
