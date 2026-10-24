import { LOW_CONFIDENCE } from "@shared/audioSync";
import { cutTargets, protectedConflicts } from "@shared/cleanup";
import { heldClips, swapSpeech } from "@shared/speechSwap";
import { clipEnd, newId } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { voiceClips } from "@shared/voiceMaster";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { personCommit, useProject, waitForDraft } from "@/state/project";
import { clockTenths } from "./format";
import { importMedia } from "./importMedia";
import { openRecorder } from "./recording";
import { heldSecond, stillAsset } from "./stills";
import { cleanError } from "./transcripts";
import { ensureTreated } from "./voice";

/**
 * "Trocar uma fala" (shared/speechSwap.ts) from the editor: the new line's audio and, when there
 * is one, its presenter video come in; the video is placed by its sound against the new audio;
 * the screen's last frame before the line is drawn to be held; then the lesson changes in one
 * undo step, and the new line is left marked on the ruler, where "Regravar a tela neste
 * intervalo" records its screen.
 */

export interface SpeechSwapRequest {
  start: number;
  end: number;
  voicePath: string;
  presenterPath?: string;
  /** Opens the recorder on the new line's stretch right after. */
  rerecord: boolean;
}

/**
 * Media this swap brought into the lesson that no clip uses: taken out again when the swap does
 * not happen, so a failed attempt leaves the lesson as it was.
 */
function dropUnused(ids: readonly string[]): void {
  if (!ids.length) return;
  const gone = new Set(ids);
  useProject.getState().patch((q) => {
    const used = new Set(q.clips.map((c) => c.assetId));
    return { ...q, assets: q.assets.filter((a) => !gone.has(a.id) || used.has(a.id)) };
  });
}

/** Does the swap; returns why it could not, or null when it was done. */
export async function replaceSpeech(r: SpeechSwapRequest): Promise<string | null> {
  const before = useProject.getState().project;
  if (!before) return "Nenhuma aula aberta.";
  const had = new Set(before.assets.map((a) => a.id));
  let added: string[] = [];
  try {
    const problem = await swapInto(r, (assets) => {
      added = assets.filter((a) => !had.has(a.id)).map((a) => a.id);
    });
    // Whatever came in and found no place (a failed attempt, a video with nothing to show) goes.
    dropUnused(added);
    return problem;
  } catch (err) {
    dropUnused(added);
    throw err;
  }
}

async function swapInto(
  r: SpeechSwapRequest,
  onImported: (assets: readonly Asset[]) => void,
): Promise<string | null> {
  const { toast, startJob, endJob } = useApp.getState();
  const before = useProject.getState().project;
  if (!before) return "Nenhuma aula aberta.";
  if (waitForDraft("trocar a fala")) return "Termine o rascunho aberto antes de trocar a fala.";
  const conflicts = r.end > r.start ? protectedConflicts(before, [[r.start, r.end]]) : [];
  if (conflicts.length)
    return `Trecho protegido: "${conflicts[0].label}". Tire a proteção na aba Transcrição antes de trocar a fala.`;
  playback.pause();
  const paths = [r.voicePath, ...(r.presenterPath ? [r.presenterPath] : [])];
  const imported = await importMedia(paths);
  onImported(imported);
  const find = (path: string | undefined): Asset | undefined =>
    path ? imported.find((a) => a.path.toLowerCase() === path.toLowerCase()) : undefined;
  const voice = find(r.voicePath);
  if (!voice?.hasAudio || !(voice.duration > 0))
    return "O áudio novo da fala não pôde ser lido ou não tem som.";
  const video = find(r.presenterPath);
  if (r.presenterPath && (!video || video.kind !== "video"))
    return "O vídeo novo do apresentador não pôde ser lido.";

  // The video is placed by its own sound against the new line's audio.
  let presenter: { asset: Asset; offset: number; scale: number } | undefined;
  let doubtful = false;
  if (video) {
    const jobId = newId("job");
    startJob(jobId, "Encaixando o vídeo novo pela voz");
    try {
      const found = await window.api.locatePresenter(jobId, video.path, [voice.path]);
      const best = found.ranked[0]?.result;
      doubtful = !best || best.confidence < LOW_CONFIDENCE;
      presenter = {
        // Marked as the presenter in the same step as the swap (undo takes it back too).
        asset: { ...video, origin: "presenter" },
        offset: best && !doubtful ? best.offset : 0,
        scale: best && !doubtful ? best.scale : 1,
      };
    } catch (err) {
      return `O vídeo novo não pôde ser comparado com a voz: ${cleanError(err)}`;
    } finally {
      endJob(jobId);
    }
  }

  // The screen's frame just before the line, held while the new one plays.
  const snapshot = useProject.getState();
  const p = snapshot.project;
  if (!p || p.id !== before.id) return "A aula mudou. Abra a troca de novo.";
  const fps = p.settings.fps || 30;
  const stills = new Map<string, Asset>();
  let missingStill = false;
  for (const c of heldClips(p, cutTargets(p), r.start)) {
    const asset = p.assets.find((a) => a.id === c.assetId);
    if (!asset) continue;
    try {
      stills.set(
        c.id,
        await stillAsset(asset, heldSecond(c, asset, Math.min(r.start, clipEnd(c)) - 1 / fps)),
      );
    } catch {
      missingStill = true;
    }
  }
  const current = useProject.getState();
  if (current.revision !== snapshot.revision || current.project?.id !== p.id)
    return "A aula mudou enquanto a troca era preparada. Tente de novo.";

  // The new line is treated like the voice it replaces.
  const oldVoice = voiceClips(p).find((c) => c.start < r.end && clipEnd(c) > r.start);
  const preset = p.assets.find((a) => a.id === oldVoice?.assetId)?.voicePreset;
  let at: [number, number] = [r.start, r.start + voice.duration];
  const ok = personCommit((q) => {
    const assets = [
      ...q.assets.map((a) =>
        a.id === voice.id && preset && preset !== "off"
          ? { ...a, voicePreset: preset }
          : a.id === video?.id
            ? { ...a, origin: "presenter" as const }
            : a,
      ),
      ...stills.values(),
    ];
    const fresh = assets.find((a) => a.id === voice.id) ?? voice;
    const result = swapSpeech({ ...q, assets }, cutTargets(q), {
      start: r.start,
      end: r.end,
      voice: fresh,
      ...(presenter ? { presenter } : {}),
      stills: new Map([...stills].map(([id, a]) => [id, a.id])),
    });
    at = result.at;
    return { ...q, assets, tracks: result.tracks, clips: result.clips };
  });
  if (!ok) return "A troca não pôde ser aplicada.";
  useApp.getState().set({ interval: { start: at[0], end: at[1] }, speechSwap: null });
  playback.seek(at[0]);
  if (preset && preset !== "off") void ensureTreated([voice.id]);
  const change = at[1] - at[0] - (r.end - r.start);
  toast(
    `Fala trocada em ${clockTenths(at[0])}${Math.abs(change) >= 0.05 ? `: a aula ficou ${Math.abs(change).toFixed(1).replace(".", ",")} s ${change > 0 ? "mais longa" : "mais curta"}` : ""}. Ctrl+Z desfaz.`,
    "success",
  );
  if (doubtful)
    toast(
      "O som do vídeo novo não bateu com certeza com o áudio novo: ele entrou no começo da fala. Confira na prévia.",
      "info",
    );
  if (missingStill)
    toast(
      "Não deu para parar a tela no último quadro nesse trecho: grave a tela de novo com Regravar a tela neste intervalo.",
      "info",
    );
  if (r.rerecord) await openRecorder({ mode: "over", from: at[0], to: at[1], replace: true });
  return null;
}
