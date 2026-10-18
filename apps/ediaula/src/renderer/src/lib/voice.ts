import type { PieceMatch } from "@shared/audioSync";
import { timelineWords } from "@shared/cleanup";
import { AVATAR_FADE, defaultTransformFor, placementTransform } from "@shared/compose";
import { type HeygenCandidate, masterCandidates, planHeygenVideo } from "@shared/heygenImport";
import { speechItems } from "@shared/script";
import { clipEnd, newId, newTrackName, splitClip } from "@shared/timeline";
import type { Asset, Clip, Project, Track, VoiceMaster } from "@shared/types";
import { treatedPath, VOICE_PRESET_LABELS, type VoicePreset } from "@shared/voiceChain";
import { cleanupSummary, voiceCleanup, waveSilences } from "@shared/voiceCleanup";
import {
  type HeygenPlacement,
  heygenPlacements,
  insertPieces,
  lessonPieces,
  type PieceSpec,
  pieceToTimeline,
  repeatedLabels,
  sectionPieces,
  sourceMapFor,
  voiceClips,
  voiceSegments,
  voiceSpan,
  withMaster,
} from "@shared/voiceMaster";
import { create } from "zustand";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { type Commit, personCommit, useProject } from "@/state/project";
import { importMedia } from "./importMedia";
import { loadWaveform } from "./media";
import { showProposal } from "./proposals";
import { scriptDoc } from "./script";
import { cleanError, loadProjectTranscripts } from "./transcripts";

/**
 * The teacher's voice in the editor: its treatment (shared/voiceChain.ts), the cleanup before
 * HeyGen (shared/voiceCleanup.ts), the export of the voice for HeyGen and the MP4s that come back
 * (shared/voiceMaster.ts, shared/heygenImport.ts, shared/audioSync.ts).
 */

/** A/B in the audio panel: the preview plays the original voice while this is on. */
export const useVoiceListen = create<{ original: boolean }>(() => ({ original: false }));

/** What a media plays in the preview: its treated voice, unless the A/B asks for the original. */
export const listenPath = (asset: Asset, original: boolean): string | null =>
  original ? null : treatedPath(asset);

/** Media whose voice the panel acts on: the selected sound clips, else the voice track's. */
export function voiceTargets(project: Project, selection: readonly string[]): Asset[] {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const selected = project.clips
    .filter((c) => selection.includes(c.id))
    .map((c) => assets.get(c.assetId))
    .filter((a): a is Asset => !!a && a.hasAudio && a.kind !== "image" && !a.generated);
  const pool = selected.length
    ? selected
    : voiceClips(project).flatMap((c) => {
        const a = assets.get(c.assetId);
        return a ? [a] : [];
      });
  return [...new Map(pool.map((a) => [a.id, a])).values()];
}

/** Treatments under way, by media: asking again waits for the same one. */
const running = new Map<string, { preset: VoicePreset; done: Promise<void> }>();

/** The treated file of a media is there on disk (a cache that was cleaned up is not). */
async function treatedReady(asset: Asset): Promise<boolean> {
  const path = treatedPath(asset);
  if (!path) return false;
  const [there] = await window.api.exists([path]);
  return there;
}

/** Treats one media with this preset, or waits for the treatment already running for it. */
function treatOne(id: string, preset: Exclude<VoicePreset, "off">): Promise<void> {
  const current = running.get(id);
  if (current?.preset === preset) return current.done;
  const done = (async () => {
    const { patchAsset } = useProject.getState();
    const { startJob, endJob, toast } = useApp.getState();
    const asset = useProject.getState().project?.assets.find((a) => a.id === id);
    if (!asset || asset.missing || (await treatedReady(asset))) return;
    const jobId = newId("job");
    const before = asset.treatStatus === "pending" ? undefined : asset.treatStatus;
    patchAsset(id, { treatStatus: "pending" });
    startJob(jobId, `Tratando a voz: ${asset.name}`);
    try {
      const result = await window.api.treatVoice(jobId, asset.path, preset);
      // A preset chosen again meanwhile keeps its own result.
      const now = useProject.getState().project?.assets.find((a) => a.id === id);
      if (now && (now.voicePreset ?? "off") === result.preset)
        patchAsset(id, {
          treated: { path: result.path, preset: result.preset, version: result.version },
          treatStatus: "ready",
        });
      else patchAsset(id, { treatStatus: before });
      toast(
        `Voz tratada (${VOICE_PRESET_LABELS[preset]}): ${asset.name}${result.cached ? ", do cache" : ""}.`,
        "success",
      );
    } catch (err) {
      // Cancelled: back to how it was. Failed: said so.
      const cancelled = /Cancelado/.test(cleanError(err));
      patchAsset(id, { treatStatus: cancelled ? before : "error" });
      if (!cancelled)
        toast(`Não foi possível tratar a voz de ${asset.name}: ${cleanError(err)}`, "error");
    } finally {
      endJob(jobId);
    }
  })().finally(() => {
    if (running.get(id)?.done === done) running.delete(id);
  });
  running.set(id, { preset, done });
  return done;
}

/**
 * Sets the preset of these media (one Ctrl+Z) and treats each one that has no treated voice
 * for it yet. The treatment waits for a take that is recording, like the other background work.
 */
export async function treatVoices(
  ids: readonly string[],
  preset: VoicePreset,
  commit: Commit = personCommit,
): Promise<void> {
  const project = useProject.getState().project;
  if (!project || !ids.length) return;
  const set = new Set(ids);
  if (project.assets.some((a) => set.has(a.id) && (a.voicePreset ?? "off") !== preset))
    commit((p) => ({
      ...p,
      assets: p.assets.map((a) => (set.has(a.id) ? { ...a, voicePreset: preset } : a)),
    }));
  if (preset === "off") return;
  for (const id of ids) await treatOne(id, preset);
}

/**
 * Every media with a preset (or the ones in `ids`) gets its treated voice, each with its own
 * preset, waiting for the treatments already running: the export and HeyGen get the voice the
 * lesson plays. A treated file that went missing is made again.
 */
export async function ensureTreated(ids?: readonly string[]): Promise<void> {
  const p = useProject.getState().project;
  if (!p) return;
  const wanted = ids ? new Set(ids) : null;
  for (const a of p.assets) {
    const preset = a.voicePreset ?? "off";
    if (preset === "off" || a.missing || !a.hasAudio || (wanted && !wanted.has(a.id))) continue;
    await treatOne(a.id, preset);
  }
}

/** The section the project is on, its speech lines and the transcript words of the timeline. */
async function voiceContext(p: Project) {
  const doc = scriptDoc(p);
  const section = doc?.sections[p.script?.section ?? 0];
  const transcripts = await loadProjectTranscripts(p);
  return { doc, section, transcripts, words: timelineWords(p, transcripts) };
}

/**
 * The cleanup of the voice before HeyGen as one proposal: repeated takes (the last complete
 * one stays), takes marked to redo, filler words and long silences. Returns the message shown.
 */
export async function proposeVoiceCleanup(by = "voz"): Promise<string> {
  const p = useProject.getState().project;
  if (!p) return "Nenhum projeto aberto.";
  const revision = useProject.getState().revision;
  const clips = voiceClips(p);
  if (!clips.length) return "Não há faixa Voz nesta aula.";
  const { section, transcripts } = await voiceContext(p);
  // Media without a transcript: the quiet stretches of their waveform.
  const silences = new Map<string, [number, number][]>();
  for (const id of new Set(clips.map((c) => c.assetId))) {
    const a = p.assets.find((x) => x.id === id);
    if (!a || transcripts.has(id) || !a.waveform) continue;
    const wave = await loadWaveform(a.waveform);
    silences.set(id, waveSilences(wave.peaks, wave.peaksPerSecond));
  }
  const items = voiceCleanup({
    project: p,
    transcripts,
    lines: section ? speechItems(section) : undefined,
    silences,
  });
  if (!items.length) return "A voz já está limpa: nada a propor.";
  const s = cleanupSummary(items);
  const parts = [
    s.take ? `${s.take} tomada(s) repetida(s)` : "",
    s.retake ? `${s.retake} marcada(s) para refazer` : "",
    s.filler ? `${s.filler} vício(s)` : "",
    s.silence ? `${s.silence} silêncio(s)` : "",
  ].filter(Boolean);
  return showProposal(
    p,
    `Limpeza da voz: ${parts.join(", ")}`,
    items.map((i) => ({
      start: i.start,
      end: i.end,
      reason: i.reason,
      ...(i.issueId ? { issueId: i.issueId } : {}),
    })),
    revision,
    by,
  );
}

/** The pieces of the voice for HeyGen in a scope; empty with the reason when there are none. */
export async function heygenPieces(
  p: Project,
  scope: VoiceMaster["scope"],
): Promise<{ pieces: PieceSpec[]; problem?: string }> {
  if (!voiceSpan(p)) return { pieces: [], problem: "Não há voz na faixa Voz para exportar." };
  const { doc, section, words } = await voiceContext(p);
  if (scope === "lesson") return { pieces: lessonPieces(p, "aula inteira") };
  if (!doc || !section)
    return { pieces: [], problem: "Cole o roteiro na aba Roteiro para dividir a voz." };
  if (scope === "section") {
    const pieces = sectionPieces(p, doc, words);
    return pieces.length
      ? { pieces }
      : { pieces: [], problem: "Transcreva a voz para achar as seções do roteiro nela." };
  }
  const pieces = insertPieces(p, section, words);
  return pieces.length
    ? { pieces }
    : {
        pieces: [],
        problem:
          "Nenhuma inserção do avatar (como F1P1-D01) foi achada na voz. Grave as falas dela no modo Só voz ou transcreva a voz.",
      };
}

/**
 * Writes the voice for HeyGen in a new folder beside the project and keeps that export among
 * the lesson's voice masters (an MP4 that comes back is compared with all of them).
 */
export async function exportForHeygen(scope: VoiceMaster["scope"]): Promise<boolean> {
  const { toast, startJob, endJob } = useApp.getState();
  const state = useProject.getState();
  const p = state.project;
  if (!p || !state.path) return false;
  if (!(await state.saveNow())) {
    toast("Salve a aula antes de exportar a voz.", "error");
    return false;
  }
  // Voices still being treated are waited for: HeyGen gets the voice the lesson plays.
  await ensureTreated(voiceClips(p).map((c) => c.assetId));
  const project = useProject.getState().project;
  if (!project || project.id !== p.id) return false;
  const { pieces, problem } = await heygenPieces(project, scope);
  if (!pieces.length) {
    toast(problem ?? "Nada para exportar.", "error");
    return false;
  }
  const repeated = repeatedLabels(pieces);
  if (repeated.length) {
    toast(
      `Duas partes da voz ficariam com o mesmo nome (${repeated.join(", ")}). Corrija o roteiro para que cada inserção tenha um código só.`,
      "error",
    );
    return false;
  }
  const jobId = newId("job");
  startJob(jobId, "Exportando a voz para o HeyGen");
  try {
    const master = await window.api.exportHeygenVoice(
      jobId,
      state.path,
      JSON.stringify(project),
      scope,
      pieces,
    );
    if (useProject.getState().project?.id !== project.id) return false;
    // A note of what was sent, not an edit: undo does not take it back (shared/history.ts).
    useProject
      .getState()
      .patch((q) => ({ ...q, voiceMasters: withMaster(q.voiceMasters ?? [], master) }));
    toast(
      `${master.pieces.length} arquivo(s) numa pasta nova dentro de "Para o HeyGen". Leve estes arquivos ao HeyGen e traga o MP4 de volta com Importar vídeo do HeyGen.`,
      "success",
    );
    await window.api.showInFolder(master.pieces[0].file);
    return true;
  } catch (err) {
    toast(`A voz não foi exportada: ${cleanError(err)}`, "error");
    return false;
  } finally {
    endJob(jobId);
  }
}

/* ----- The MP4s that come back ----- */

/** A match too unsure to place: shown for the person to check, never placed blind. */
export interface HeygenGuess {
  id: string;
  assetId: string;
  name: string;
  candidate: HeygenCandidate;
  match: PieceMatch;
  duration: number;
  /** Timeline second the best guess puts the video's start at (null: nowhere on it now). */
  at: number | null;
  /** Why it is doubtful, for the bar. */
  why: string;
  useSound: boolean;
}

export const useHeygenReview = create<{ items: HeygenGuess[] }>(() => ({ items: [] }));

/** The top video track free over [a, b] (above everything playing there), or a new one on top. */
function avatarTrack(
  p: Pick<Project, "tracks" | "clips">,
  a: number,
  b: number,
): {
  tracks: Track[];
  track: Track;
} {
  const busy = new Set(
    p.clips.filter((c) => c.start < b - 1e-3 && clipEnd(c) > a + 1e-3).map((c) => c.trackId),
  );
  const highest = p.tracks.findIndex((t) => t.kind === "video" && busy.has(t.id));
  const free = p.tracks
    .slice(0, highest < 0 ? p.tracks.length : highest)
    .find((t) => t.kind === "video" && !t.locked);
  if (free) return { tracks: p.tracks, track: free };
  const track: Track = {
    id: newId("t"),
    kind: "video",
    name: newTrackName(p.tracks),
    muted: false,
    hidden: false,
    locked: false,
  };
  return { tracks: [track, ...p.tracks], track };
}

/**
 * The voice clips under [a, b] go silent there (split at the edges) while HeyGen's sound plays.
 * They keep their volume and stay the lesson's voice (Clip.mutedFor).
 */
function silenceVoice(p: Project, clips: Clip[], a: number, b: number): Clip[] {
  const voice = new Set(voiceClips(p).map((c) => c.id));
  const out: Clip[] = [];
  for (const c of clips) {
    if (!voice.has(c.id) || clipEnd(c) <= a + 1e-3 || c.start >= b - 1e-3) {
      out.push(c);
      continue;
    }
    let rest: Clip = c;
    const left = splitClip(rest, a);
    if (left) {
      out.push(left[0]);
      rest = left[1];
    }
    const right = splitClip(rest, b);
    if (right) out.push({ ...right[0], mutedFor: "heygen" }, right[1]);
    else out.push({ ...rest, mutedFor: "heygen" });
  }
  return out;
}

/**
 * The HeyGen video's clips on the timeline, as one edit. Each run of clips that touch fades in
 * at its start and out at its end, and nowhere between.
 */
function placeVideo(
  p: Project,
  asset: Asset,
  placements: HeygenPlacement[],
  useSound: boolean,
  label: string,
): Project | null {
  if (!placements.length) return null;
  const a = placements[0].start;
  const b = Math.max(...placements.map((x) => x.start + x.duration));
  const { tracks, track } = avatarTrack(p, a, b);
  const portrait = asset.height > asset.width;
  const transform =
    portrait || asset.screen
      ? placementTransform(p.settings.width > p.settings.height ? "right" : "full")
      : defaultTransformFor(asset, p.settings);
  const touches = (x: number, y: number): boolean => Math.abs(x - y) < 0.002;
  let clips = useSound ? silenceVoice(p, p.clips, a, b) : p.clips;
  clips = [
    ...clips,
    ...placements.map((x, i): Clip => {
      const prev = placements[i - 1];
      const next = placements[i + 1];
      const opens = !prev || !touches(prev.start + prev.duration, x.start);
      const closes = !next || !touches(x.start + x.duration, next.start);
      const fade = Math.min(AVATAR_FADE, x.duration / 3);
      return {
        id: newId("c"),
        assetId: asset.id,
        trackId: track.id,
        start: x.start,
        in: x.in,
        duration: x.duration,
        volume: useSound ? 1 : 0,
        ...(Math.abs(x.speed - 1) > 1e-4 ? { speed: x.speed } : {}),
        ...(transform ? { transform } : {}),
        ...(opens ? { fadeIn: fade } : {}),
        ...(closes ? { fadeOut: fade } : {}),
        ...(/^[A-Z]\d+P\d+-[A-Z]\d+$/.test(label) ? { insertId: label } : {}),
      };
    }),
  ];
  return { ...p, tracks, clips };
}

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** The voice as it is now, rendered, as the last resort to compare with. */
async function currentVoice(p: Project): Promise<HeygenCandidate | null> {
  const span = voiceSpan(p);
  if (!span) return null;
  const jobId = newId("job");
  useApp.getState().startJob(jobId, "Preparando a voz para comparar");
  try {
    const file = await window.api.renderVoice(
      jobId,
      voiceSegments(p, span[0], span[1]),
      span[0],
      span[1],
    );
    return { piece: { file, label: "voz atual", sourceMap: sourceMapFor(p, span[0], span[1]) } };
  } finally {
    useApp.getState().endJob(jobId);
  }
}

/**
 * Brings HeyGen MP4s in. Each is compared by its sound with every voice file sent to HeyGen
 * that is still on disk, and goes where the winning file's source map says that voice is on the
 * timeline now: cuts made after the export are followed. Only when no file sent is left (or its
 * media are gone) the voice as it is now is used. The avatar's background is removed when it is
 * a solid screen; it plays silent (the treated voice is heard) unless `useSound`. A doubtful
 * match becomes a guess to check, never a blind placement.
 */
export async function importHeygenVideos(useSound: boolean): Promise<void> {
  const { toast, startJob, endJob } = useApp.getState();
  const start = useProject.getState().project;
  if (!start) return;
  if (!voiceSpan(start)) {
    toast("Não há faixa Voz nesta aula para encaixar o vídeo do HeyGen.", "error");
    return;
  }
  const videos = await window.api.pickHeygenVideos();
  if (!videos.length) return;
  const files = (start.voiceMasters ?? []).flatMap((m) => m.pieces.map((x) => x.file));
  const there = files.length ? await window.api.exists(files) : [];
  let candidates = masterCandidates(start, new Set(files.filter((_, i) => there[i])));
  let fallback: HeygenCandidate | null = null;
  const currentCandidates = async (): Promise<HeygenCandidate[]> => {
    fallback ??= await currentVoice(start);
    return fallback ? [fallback] : [];
  };
  try {
    if (!candidates.length) candidates = await currentCandidates();
  } catch (err) {
    toast(`Não consegui preparar a voz para comparar: ${cleanError(err)}`, "error");
    return;
  }
  const assets = await importMedia(videos);
  // The presenter's video: acted, so the cleanup never cleans it of hesitations.
  for (const asset of assets) useProject.getState().patchAsset(asset.id, { origin: "presenter" });
  let placed = 0;
  let stale = false;
  for (const asset of assets) {
    const jobId = newId("job");
    startJob(jobId, `Encaixando ${asset.name}`);
    try {
      const p = useProject.getState().project;
      if (!p || p.id !== start.id) return;
      const locate = async (list: HeygenCandidate[]) => {
        const found = await window.api.locateHeygen(
          jobId,
          asset.path,
          list.map((c) => c.piece.file),
        );
        return { found, plan: planHeygenVideo(p, list, found.ranked, found.duration) };
      };
      let { found, plan } = await locate(candidates);
      // The voice those files were made from is no longer on the timeline: the voice of now.
      if (plan && !plan.placements.length && plan.candidate.master)
        ({ found, plan } = await locate(await currentCandidates()));
      if (!plan) continue;
      stale ||= plan.stale;
      useProject
        .getState()
        .patchAsset(asset.id, { name: `HeyGen · ${plan.candidate.piece.label}` });
      if (plan.doubtful) {
        const chosen = plan;
        useHeygenReview.setState((s) => ({
          items: [
            ...s.items,
            {
              id: newId("hg"),
              assetId: asset.id,
              name: asset.name,
              candidate: chosen.candidate,
              match: chosen.match,
              duration: found.duration,
              at: pieceToTimeline(
                p,
                chosen.candidate.piece,
                Math.max(0, chosen.match.result.offset),
              ),
              why: chosen.ambiguous
                ? "parece com mais de um arquivo de voz"
                : !chosen.placements.length
                  ? "a voz dele não está mais na timeline"
                  : `confiança de ${Math.round(chosen.match.result.confidence * 100)}%`,
              useSound,
            },
          ],
        }));
        continue;
      }
      const fresh = useProject.getState().project?.assets.find((a) => a.id === asset.id) ?? asset;
      const next = placeVideo(p, fresh, plan.placements, useSound, plan.candidate.piece.label);
      if (!next) continue;
      if (useProject.getState().commit(() => next)) placed++;
      toast(
        `${asset.name} encaixado em ${clock(plan.placements[0].start)} (confiança de ${Math.round(plan.match.result.confidence * 100)}%${plan.candidate.master ? "" : ", pela voz atual"}).`,
        "success",
      );
    } catch (err) {
      toast(`Não consegui encaixar ${asset.name}: ${cleanError(err)}`, "error");
    } finally {
      endJob(jobId);
    }
  }
  if (stale)
    toast(
      "A voz mudou depois de ir para o HeyGen: o vídeo seguiu os cortes, mas confira os trechos que mudaram.",
      "info",
    );
  const doubtful = useHeygenReview.getState().items.length;
  if (doubtful)
    toast(
      `${doubtful} vídeo(s) com encaixe incerto: confira o palpite na barra acima da timeline.`,
      "info",
    );
  else if (placed) playback.seek(voiceSpan(start)?.[0] ?? 0);
}

/** The person checked a doubtful match and keeps it. */
export function acceptGuess(id: string): void {
  const guess = useHeygenReview.getState().items.find((g) => g.id === id);
  const p = useProject.getState().project;
  if (!guess || !p) return;
  const asset = p.assets.find((a) => a.id === guess.assetId);
  const placements = heygenPlacements(
    p,
    guess.candidate.piece,
    guess.match.result.offset,
    guess.match.result.scale,
    guess.duration,
  );
  const next =
    asset && placeVideo(p, asset, placements, guess.useSound, guess.candidate.piece.label);
  if (!next) {
    useApp.getState().toast("Este palpite não cai mais na voz da timeline.", "error");
    return;
  }
  useProject.getState().commit(() => next);
  dropGuess(id);
}

export function dropGuess(id: string): void {
  useHeygenReview.setState((s) => ({ items: s.items.filter((g) => g.id !== id) }));
}
