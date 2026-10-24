import { cutTargets } from "@shared/cleanup";
import { kidsEdition, kidsSpan, locateKids, type SourceWord } from "@shared/kidsEdition";
import type { Substitution } from "@shared/script";
import { heldClips } from "@shared/speechSwap";
import { clipEnd } from "@shared/timeline";
import type { Asset, Project } from "@shared/types";
import { voiceClips } from "@shared/voiceMaster";
import { useApp } from "@/state/app";
import { personCommit, useProject } from "@/state/project";
import { clockTenths } from "./format";
import { importMedia } from "./importMedia";
import { scriptDoc } from "./script";
import { heldSecond, stillAsset } from "./stills";
import { cleanError, loadAssetTranscript, transcribeAssets, useCleanup } from "./transcripts";

/**
 * The kids edition from the editor (shared/kidsEdition.ts): the characters' videos come in and are
 * transcribed, each line of the script's kids table is found in them and in the lesson's voice,
 * and the export of the kids edition gets the lesson with those lines replaced.
 */

/** The kids table of the section the lesson is. */
export function kidsTable(p: Project | null): Substitution[] {
  const doc = scriptDoc(p);
  return doc?.sections[p?.script?.section ?? 0]?.substitutions ?? [];
}

/** A transcript's words in its media's seconds, the dropped ones left out. */
async function wordsOf(p: Project, a: Asset): Promise<SourceWord[]> {
  const t = await loadAssetTranscript(p, a);
  return t.words
    .filter((w) => !w.dropped)
    .map((w) => ({ text: w.text, start: w.start, end: w.end }));
}

/**
 * Finds every line of the kids table in the characters' videos and in the voice, and keeps what
 * was found in the lesson (one undo step). Says what was found and what was not.
 */
export async function locateKidsLines(): Promise<void> {
  const { toast } = useApp.getState();
  const p = useProject.getState().project;
  if (!p) return;
  const table = kidsTable(p);
  if (!table.length) {
    toast("O roteiro desta aula não tem a tabela de substituições kids.", "error");
    return;
  }
  const voiceAssets = [...new Set(voiceClips(p).map((c) => c.assetId))]
    .map((id) => p.assets.find((a) => a.id === id))
    .filter((a): a is Asset => !!a);
  const ready = (a: Asset): boolean => a.transcriptStatus === "ready" && !!a.transcript;
  if (!voiceAssets.length || !voiceAssets.every(ready)) {
    toast(
      "Para achar as falas na aula, transcreva a voz antes, na aba Transcrição do painel da direita.",
      "error",
    );
    return;
  }
  const videos = (p.kids?.videos ?? [])
    .map((id) => p.assets.find((a) => a.id === id))
    .filter((a): a is Asset => !!a && ready(a));
  if (!videos.length) {
    toast("Os vídeos dos personagens ainda não foram transcritos.", "error");
    return;
  }
  try {
    const voices = new Map(
      await Promise.all(voiceAssets.map(async (a) => [a.id, await wordsOf(p, a)] as const)),
    );
    const chars = new Map(
      await Promise.all(
        videos.map(
          async (a) =>
            [a.id, { name: a.name, duration: a.duration, words: await wordsOf(p, a) }] as const,
        ),
      ),
    );
    const { pieces, problems } = locateKids(table, voices, chars);
    const now = useProject.getState().project;
    if (now?.id !== p.id) return;
    personCommit((q) => ({ ...q, kids: { videos: q.kids?.videos ?? [], pieces } }));
    toast(
      problems.length
        ? `${pieces.length} de ${table.length} falas da edição kids foram achadas. Faltam: ${problems.map((x) => `${x.id} (${x.why})`).join("; ")}.`
        : `As ${table.length} falas da edição kids foram achadas. Exporte escolhendo a versão Kids.`,
      problems.length ? "info" : "success",
    );
  } catch (err) {
    toast(`As falas da edição kids não foram procuradas: ${cleanError(err)}`, "error");
  }
}

/**
 * "Importar vídeos dos personagens": the videos come into the library (never onto the timeline:
 * the adult edition stays as it is), are transcribed and the lines are looked for.
 */
export async function importKidsVideos(): Promise<void> {
  const { toast } = useApp.getState();
  if (!useProject.getState().project) return;
  const paths = await window.api.pickPresenterVideos();
  if (!paths.length) return;
  const assets = (await importMedia(paths)).filter((a) => a.kind === "video" && a.hasAudio);
  if (!assets.length) {
    toast("Escolha os vídeos dos personagens com o som deles.", "error");
    return;
  }
  // Characters are presenters: never cleaned of hesitations, placed like the presenter.
  for (const a of assets) useProject.getState().patchAsset(a.id, { origin: "presenter" });
  personCommit((q) => ({
    ...q,
    kids: {
      videos: [...new Set([...(q.kids?.videos ?? []), ...assets.map((a) => a.id)])],
      pieces: q.kids?.pieces ?? [],
    },
  }));
  const status = await window.api.engineStatus();
  if (!status.bin || !status.model) {
    toast(
      "Os vídeos entraram. Para achar as falas neles, instale a transcrição na aba Transcrição e use Procurar as falas.",
      "info",
    );
    return;
  }
  const todo = assets.filter((a) => a.transcriptStatus !== "ready");
  if (todo.length) await transcribeAssets(todo, useCleanup.getState().language || "pt");
  await locateKidsLines();
}

/** Where each line of the table stands now: found (and where), or why not. */
export function kidsStatus(
  p: Project,
): { id: string; character: string; text: string; at: string | null }[] {
  return kidsTable(p).map((s) => {
    const piece = p.kids?.pieces.find((x) => x.id === s.id);
    const span = piece ? kidsSpan(p, piece) : null;
    return {
      id: s.id,
      character: s.character,
      text: s.text,
      at: span ? clockTenths(span[0]) : null,
    };
  });
}

/**
 * The lesson as the kids edition, for the export: the screen's frame before each line drawn to
 * be held while the character speaks. Says which lines stayed out.
 */
export async function kidsProject(
  project: Project,
): Promise<{ project: Project; skipped: string[] }> {
  const pieces = project.kids?.pieces ?? [];
  const targets = cutTargets(project);
  const fps = project.settings.fps || 30;
  const stills = new Map<string, Map<string, string>>();
  const made: Asset[] = [];
  for (const piece of pieces) {
    const span = kidsSpan(project, piece);
    if (!span) continue;
    const byTrack = new Map<string, string>();
    for (const c of heldClips(project, targets, span[0])) {
      const asset = project.assets.find((a) => a.id === c.assetId);
      if (!asset) continue;
      try {
        const still = await stillAsset(
          asset,
          heldSecond(c, asset, Math.min(span[0], clipEnd(c)) - 1 / fps),
        );
        made.push(still);
        byTrack.set(c.trackId, still.id);
      } catch {
        // Without the still the screen leaves a gap there, as without a frame to hold.
      }
    }
    stills.set(piece.id, byTrack);
  }
  const withStills = { ...project, assets: [...project.assets, ...made] };
  const out = kidsEdition(withStills, targets, pieces, stills);
  return { project: { ...withStills, tracks: out.tracks, clips: out.clips }, skipped: out.skipped };
}
