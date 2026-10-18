import { LOW_CONFIDENCE, type SyncResult } from "@shared/audioSync";
import { timelineWords } from "@shared/cleanup";
import { AVATAR_FADE, defaultTransformFor, placementTransform } from "@shared/compose";
import { speechItems } from "@shared/script";
import { clipEnd, newId, newTrackName, splitClip } from "@shared/timeline";
import type { Asset, Clip, Project, Track, VoiceMaster, VoiceMasterPiece } from "@shared/types";
import { treatedPath, VOICE_PRESET_LABELS, type VoicePreset } from "@shared/voiceChain";
import { cleanupSummary, voiceCleanup, waveSilences } from "@shared/voiceCleanup";
import {
  type HeygenPlacement,
  heygenPlacements,
  insertPieces,
  lessonPieces,
  masterIsStale,
  type PieceSpec,
  pieceToTimeline,
  sectionPieces,
  sourceMapFor,
  voiceClips,
  voiceSegments,
  voiceSpan,
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
 * (shared/voiceMaster.ts, shared/audioSync.ts).
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

const running = new Map<string, string>();

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
  const { patchAsset } = useProject.getState();
  const { startJob, endJob, toast } = useApp.getState();
  for (const id of ids) {
    const asset = useProject.getState().project?.assets.find((a) => a.id === id);
    if (!asset || asset.missing || treatedPath(asset) || running.get(id) === preset) continue;
    const jobId = newId("job");
    running.set(id, preset);
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
      toast(
        `Voz tratada (${VOICE_PRESET_LABELS[preset]}): ${asset.name}${result.cached ? ", do cache" : ""}.`,
        "success",
      );
    } catch (err) {
      if (!/Cancelado/.test(cleanError(err))) {
        patchAsset(id, { treatStatus: "error" });
        toast(`Não foi possível tratar a voz de ${asset.name}: ${cleanError(err)}`, "error");
      }
    } finally {
      if (running.get(id) === preset) running.delete(id);
      endJob(jobId);
    }
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
  const message = await showProposal(
    p,
    `Limpeza da voz: ${parts.join(", ")}`,
    items.map((i) => ({ start: i.start, end: i.end, reason: i.reason })),
    revision,
    by,
  );
  return message;
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

/** Writes the voice for HeyGen beside the project and keeps the voice master in the lesson. */
export async function exportForHeygen(scope: VoiceMaster["scope"]): Promise<boolean> {
  const { toast, startJob, endJob } = useApp.getState();
  const state = useProject.getState();
  const p = state.project;
  if (!p || !state.path) return false;
  if (!(await state.saveNow())) {
    toast("Salve a aula antes de exportar a voz.", "error");
    return false;
  }
  // Voices still being treated are treated first: HeyGen gets the voice the lesson plays.
  const pending = voiceClips(p)
    .map((c) => p.assets.find((a) => a.id === c.assetId))
    .filter((a): a is Asset => !!a && (a.voicePreset ?? "off") !== "off" && !treatedPath(a));
  if (pending.length)
    await treatVoices(
      pending.map((a) => a.id),
      pending[0].voicePreset ?? "teacher",
    );
  const project = useProject.getState().project;
  if (!project || project.id !== p.id) return false;
  const { pieces, problem } = await heygenPieces(project, scope);
  if (!pieces.length) {
    toast(problem ?? "Nada para exportar.", "error");
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
    // A note of what was sent, not an edit: undo does not take it back.
    useProject.getState().patch((q) => ({ ...q, voiceMaster: master }));
    toast(
      `${master.pieces.length} arquivo(s) na pasta "Para o HeyGen". Leve estes arquivos ao HeyGen e traga o MP4 de volta com Importar vídeo do HeyGen.`,
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

/** A match found with too little confidence: shown for the person to check, never placed blind. */
export interface HeygenGuess {
  id: string;
  assetId: string;
  name: string;
  piece: Pick<VoiceMasterPiece, "label" | "sourceMap">;
  result: SyncResult;
  duration: number;
  /** Timeline second the best guess puts the video's start at (null: nowhere on it now). */
  at: number | null;
  useSound: boolean;
}

export const useHeygenReview = create<{ items: HeygenGuess[] }>(() => ({ items: [] }));

/** The person's answer when the voice changed after it went to HeyGen. */
type StaleChoice = "audio" | "export" | "cancel";
export const useHeygenAsk = create<{ ask: ((choice: StaleChoice) => void) | null }>(() => ({
  ask: null,
}));
const askStale = (): Promise<StaleChoice> =>
  new Promise((resolve) => useHeygenAsk.setState({ ask: resolve }));

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

/** The voice clips under [a, b] go silent there (split at the edges): HeyGen's sound plays. */
function silenceVoice(p: Project, clips: Clip[], a: number, b: number): Clip[] {
  const voice = new Set(voiceClips(p).map((c) => c.id));
  const out: Clip[] = [];
  for (const c of clips) {
    if (!voice.has(c.id) || clipEnd(c) <= a + 1e-3 || c.start >= b - 1e-3) {
      out.push(c);
      continue;
    }
    let rest: Clip | null = c;
    const left = splitClip(rest, a);
    if (left) {
      out.push(left[0]);
      rest = left[1];
    }
    const right = splitClip(rest, b);
    if (right) {
      out.push({ ...right[0], volume: 0 }, right[1]);
    } else out.push({ ...rest, volume: 0 });
  }
  return out;
}

/** The HeyGen video's clips on the timeline, as one edit. */
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
  let clips = useSound ? silenceVoice(p, p.clips, a, b) : p.clips;
  clips = [
    ...clips,
    ...placements.map(
      (x, i): Clip => ({
        id: newId("c"),
        assetId: asset.id,
        trackId: track.id,
        start: x.start,
        in: x.in,
        duration: x.duration,
        volume: useSound ? 1 : 0,
        ...(Math.abs(x.speed - 1) > 1e-4 ? { speed: x.speed } : {}),
        ...(transform ? { transform } : {}),
        ...(i === 0 ? { fadeIn: AVATAR_FADE } : {}),
        ...(i === placements.length - 1 ? { fadeOut: AVATAR_FADE } : {}),
        ...(/^[A-Z]\d+P\d+-[A-Z]\d+$/.test(label) ? { insertId: label } : {}),
      }),
    ),
  ];
  return { ...p, tracks, clips };
}

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/**
 * Brings HeyGen MP4s in: each is found in the voice it was made from by its sound and placed on
 * the avatar track at the voice's time, with the background removed when it is a solid screen,
 * and silent (the treated voice plays) unless `useSound`. A doubtful match becomes a guess to
 * check; a voice edited after the export asks first.
 */
export async function importHeygenVideos(useSound: boolean): Promise<void> {
  const { toast, startJob, endJob } = useApp.getState();
  const start = useProject.getState().project;
  if (!start) return;
  const span = voiceSpan(start);
  if (!span) {
    toast("Não há faixa Voz nesta aula para encaixar o vídeo do HeyGen.", "error");
    return;
  }
  const videos = await window.api.pickHeygenVideos();
  if (!videos.length) return;
  // What the videos are compared with: the files sent to HeyGen, or the voice as it is now.
  let pieces: Pick<VoiceMasterPiece, "label" | "sourceMap" | "file">[];
  const master = start.voiceMaster;
  let stale = !master || masterIsStale(start, master);
  if (master && stale) {
    const choice = await askStale();
    if (choice === "cancel") return;
    if (choice === "export") {
      await exportForHeygen(master.scope);
      return;
    }
  }
  if (master && !stale) pieces = master.pieces;
  else {
    const jobId = newId("job");
    startJob(jobId, "Preparando a voz para comparar");
    try {
      const file = await window.api.renderVoice(
        jobId,
        voiceSegments(start, span[0], span[1]),
        span[0],
        span[1],
      );
      pieces = [{ label: "voz atual", file, sourceMap: sourceMapFor(start, span[0], span[1]) }];
      stale = true;
    } catch (err) {
      toast(`Não consegui preparar a voz para comparar: ${cleanError(err)}`, "error");
      return;
    } finally {
      endJob(jobId);
    }
  }
  const assets = await importMedia(videos);
  let placed = 0;
  for (const asset of assets) {
    const jobId = newId("job");
    startJob(jobId, `Encaixando ${asset.name}`);
    try {
      const found = await window.api.locateHeygen(
        jobId,
        asset.path,
        pieces.map((x) => x.file),
      );
      const piece = pieces[found.piece];
      const p = useProject.getState().project;
      if (!p || p.id !== start.id) return;
      useProject.getState().patchAsset(asset.id, { name: `HeyGen · ${piece.label}` });
      if (found.result.confidence < LOW_CONFIDENCE) {
        const at = pieceToTimeline(p, piece, Math.max(0, found.result.offset));
        useHeygenReview.setState((s) => ({
          items: [
            ...s.items,
            {
              id: newId("hg"),
              assetId: asset.id,
              name: asset.name,
              piece,
              result: found.result,
              duration: found.duration,
              at,
              useSound,
            },
          ],
        }));
        continue;
      }
      const placements = heygenPlacements(
        p,
        piece,
        found.result.offset,
        found.result.scale,
        found.duration,
      );
      const fresh = useProject.getState().project?.assets.find((a) => a.id === asset.id) ?? asset;
      const next = placeVideo(p, fresh, placements, useSound, piece.label);
      if (!next) {
        toast(`${asset.name}: a voz dele não está mais na timeline.`, "error");
        continue;
      }
      if (useProject.getState().commit(() => next)) placed++;
      toast(
        `${asset.name} encaixado em ${clock(placements[0].start)} (confiança ${Math.round(found.result.confidence * 100)}%${stale ? ", pela voz atual" : ""}).`,
        "success",
      );
    } catch (err) {
      toast(`Não consegui encaixar ${asset.name}: ${cleanError(err)}`, "error");
    } finally {
      endJob(jobId);
    }
  }
  const doubtful = useHeygenReview.getState().items.length;
  if (doubtful)
    toast(
      `${doubtful} vídeo(s) com encaixe incerto: confira o palpite na barra acima da timeline.`,
      "info",
    );
  else if (placed) playback.seek(span[0]);
}

/** The person checked a doubtful match and keeps it. */
export function acceptGuess(id: string): void {
  const guess = useHeygenReview.getState().items.find((g) => g.id === id);
  const p = useProject.getState().project;
  if (!guess || !p) return;
  const asset = p.assets.find((a) => a.id === guess.assetId);
  const placements = heygenPlacements(
    p,
    guess.piece,
    guess.result.offset,
    guess.result.scale,
    guess.duration,
  );
  const next = asset && placeVideo(p, asset, placements, guess.useSound, guess.piece.label);
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
