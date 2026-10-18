import { timelineWords } from "@shared/cleanup";
import { squareCrop, type Transform } from "@shared/compose";
import { normalizeGuidedRun } from "@shared/guidedCursor";
import { type GuidedReplace, planTiming } from "@shared/guidedPlan";
import { layoutOverNarration } from "@shared/overNarration";
import {
  type OverContext,
  type RecorderContext,
  type RecordingResult,
  type RecordMode,
  retakeCuts,
} from "@shared/recording";
import { layoutRecording, type RecordingLayout } from "@shared/recordingImport";
import { speechItems } from "@shared/script";
import { alignSection } from "@shared/scriptAlign";
import { clipEnd, timelineAt } from "@shared/timeline";
import type { Asset, Project } from "@shared/types";
import { voiceClips, voiceSegments, voiceSpan, voiceTakeStart } from "@shared/voiceMaster";
import { voiceTakes } from "@shared/voiceTakes";
import { useApp } from "@/state/app";
import { usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { enrich, importMedia } from "./importMedia";
import { loadWaveform, mediaUrl } from "./media";
import { requestMotion } from "./motion";
import { activePalette } from "./palettes";
import { showProposal } from "./proposals";
import { recorderKey } from "./recorderKeys";
import { recordingImported } from "./recordingHooks";
import { scriptDoc } from "./script";
import { loadProjectTranscripts } from "./transcripts";
import { proposeVoiceCleanup, treatVoices } from "./voice";

/** The take's folder name, which identifies it (Asset.recording.id). */
const basename = (dir: string): string => dir.split(/[\\/]/).filter(Boolean).at(-1) ?? dir;

export interface RecorderRequest {
  mode?: RecordMode;
  /** "Tela sobre a narração": from where (default: the playhead) and, to redo, up to where. */
  from?: number;
  to?: number;
  replace?: boolean;
  /** "Regravar e substituir": a guided take recorded again with its plan, in that media's place. */
  guidedReplace?: GuidedReplace;
}

/**
 * Most words handed to the recorder's karaoke, from a little before where the voice plays (a
 * long lesson has a few thousand): each word is four values of the IPC limit of 100 000.
 */
const MAX_WORDS = 12000;

/**
 * The lesson's voice for "Tela sobre a narração": its segments to render, its words for the
 * karaoke and the "Na tela" directions at the time the script puts them.
 */
async function overContext(p: Project, request: RecorderRequest): Promise<OverContext | undefined> {
  const span = voiceSpan(p);
  if (!span) return undefined;
  const playhead = usePlayback.getState().time;
  const from = Math.max(
    0,
    request.from ?? (playhead >= span[0] && playhead < span[1] - 1 ? playhead : span[0]),
  );
  const transcripts = await loadProjectTranscripts(p);
  const voice = new Set(voiceClips(p).map((c) => c.id));
  const words = timelineWords(p, transcripts).filter((w) => voice.has(w.clipId));
  const doc = scriptDoc(p);
  const section = doc?.sections[p.script?.section ?? 0];
  const cues: OverContext["cues"] = [];
  if (section) {
    // Each "Na tela" applies from the start of the line after it (or the end of the one before).
    const lines = alignSection(section, words).lines;
    section.items.forEach((item, index) => {
      if (item.kind !== "screen") return;
      const next = lines.find((l) => l.item > index && l.start !== undefined);
      const prev = [...lines].reverse().find((l) => l.item < index && l.end !== undefined);
      const t = next?.start ?? prev?.end;
      if (t !== undefined) cues.push({ t: Math.max(0, t - 0.5), text: item.text });
    });
  }
  return {
    from,
    ...(request.to !== undefined ? { to: request.to } : {}),
    ...(request.replace ? { replace: true } : {}),
    end: span[1],
    segments: voiceSegments(p, 0, span[1]),
    words: words
      .filter((w) => w.end >= from - 5)
      .slice(0, MAX_WORDS)
      .map((w) => ({ t: w.start, end: w.end, text: w.text })),
    cues,
  };
}

/** Opens the recorder over the screen, with the project's script as teleprompter. */
export async function openRecorder(request: RecorderRequest = {}): Promise<void> {
  const p = useProject.getState().project;
  const doc = scriptDoc(p);
  const section = doc && p ? doc.sections[p.script?.section ?? 0] : undefined;
  const teleprompter = section
    ? speechItems(section).map((i) => ({
        speaker: i.speaker,
        text: i.text,
        avatar: i.avatar,
        ...(i.insertId ? { insertId: i.insertId } : {}),
      }))
    : [];
  const screenNotes: RecorderContext["screenNotes"] = [];
  let spoken = 0;
  for (const item of section?.items ?? []) {
    if (item.kind === "speech") spoken++;
    else if (item.kind === "screen") screenNotes.push({ before: spoken, text: item.text });
  }
  const over = p ? await overContext(p, request) : undefined;
  if (request.mode === "over" && !over) {
    useApp
      .getState()
      .toast("Para gravar a tela sobre a narração, a aula precisa da faixa Voz.", "error");
    return;
  }
  await window.api.recorder.open({
    teleprompter,
    title: section?.videoTitle,
    screenNotes,
    ...(request.mode ? { mode: request.mode } : {}),
    ...(over ? { over } : {}),
    ...(p ? { projectId: p.id } : {}),
    ...(p?.guided ? { guided: p.guided } : {}),
    ...(request.guidedReplace ? { guidedReplace: request.guidedReplace } : {}),
  });
}

/** guided-run.json of a media, or why it cannot be read. */
async function guidedRunOf(path: string) {
  const response = await fetch(mediaUrl(path));
  if (!response.ok)
    throw new Error("O registro da demonstração (guided-run.json) não foi encontrado.");
  return normalizeGuidedRun(await response.json());
}

/**
 * "Regravar e substituir": the plan this media was recorded with runs again in the recorder;
 * the new take takes the media's place in every clip. Refused when the plan's tempos or times
 * changed since, because the clips' cuts would no longer fall on the same moments.
 */
export async function rerecordGuided(assetId: string): Promise<void> {
  const { toast } = useApp.getState();
  const p = useProject.getState().project;
  const asset = p?.assets.find((a) => a.id === assetId);
  if (!p || !asset?.guidedRun) return;
  try {
    const run = await guidedRunOf(asset.guidedRun);
    const plan = p.guided?.plans.find((x) => x.id === run.planId);
    if (!plan) throw new Error(`O plano “${run.planName}” não está mais neste projeto.`);
    if (planTiming(plan) !== run.timing)
      throw new Error(
        "Os tempos do plano mudaram desde esta gravação. Grave um take novo em vez de substituir.",
      );
    await openRecorder({
      guidedReplace: {
        assetId,
        assetName: asset.name,
        planId: plan.id,
        timing: run.timing,
        from: run.from,
        duration: asset.duration,
      },
    });
  } catch (error) {
    toast(`Não dá para regravar ${asset.name}: ${(error as Error).message}`, "error");
  }
}

/**
 * The new take of "Regravar e substituir" in the media's place: same id, so every clip keeps
 * its cuts, with the new video, cursor and guided-run.json. False when it cannot replace (the
 * take did not finish, or lasts another length): then it comes in as a new take.
 */
async function replaceGuidedTake(r: RecordingResult): Promise<boolean> {
  const { toast } = useApp.getState();
  const asset = useProject.getState().project?.assets.find((a) => a.id === r.replaceAsset);
  if (!asset || !r.screen || !r.guidedRun) return false;
  const info = await window.api.probe(r.screen);
  const run = await guidedRunOf(r.guidedRun);
  if (run.status !== "done") {
    toast("A demonstração não chegou ao fim: ela entrou como uma gravação nova.", "info");
    return false;
  }
  if (Math.abs(info.duration - asset.duration) > 0.1) {
    toast(
      `A nova gravação tem ${info.duration.toFixed(1)} s e a anterior ${asset.duration.toFixed(1)} s: ela entrou como uma gravação nova.`,
      "info",
    );
    return false;
  }
  const { relinkAsset, patchAsset } = useProject.getState();
  relinkAsset(asset.id, {
    path: r.screen,
    size: info.size,
    ...(r.cursor ? { cursor: r.cursor } : {}),
  });
  patchAsset(asset.id, {
    guidedRun: r.guidedRun,
    thumb: undefined,
    waveform: undefined,
    proxy: undefined,
    proxyStatus: "none",
    vfr: info.vfr,
    fps: info.fps,
    recording: { id: basename(r.dir), role: "screen" },
  });
  const updated = useProject.getState().project?.assets.find((a) => a.id === asset.id);
  if (updated) void enrich(updated, info.videoCodec);
  toast(`${asset.name} foi regravada: os clipes seguem nos mesmos pontos.`, "success");
  if (await useProject.getState().saveNow())
    await window.api.recorder.imported(r.dir).catch(() => undefined);
  return true;
}

/** Webcam in the bottom-right corner, in a circle with the course's lime border (as in the design). */
const cameraTransform = (a: Asset): Transform => ({
  x: 0.88,
  y: 0.76,
  scale: 0.28,
  opacity: 1,
  mask: "circle",
  border: activePalette(useProject.getState().project).roles.accent,
  crop: squareCrop(a.width, a.height),
});

const stamp = (): string =>
  new Date()
    .toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "");

/** A finished take goes into the open project (or a new one), every source cut at its pauses. */
export async function importRecording(r: RecordingResult): Promise<void> {
  const { toast, set } = useApp.getState();
  if (r.replaceAsset && useProject.getState().project) {
    try {
      if (await replaceGuidedTake(r)) return;
    } catch (error) {
      toast(
        `Não consegui substituir a gravação (${(error as Error).message}): ela entrou como nova.`,
        "info",
      );
    }
  }
  if (!useProject.getState().project) {
    const { path, project } = await window.api.createProject(
      `Gravação ${stamp()}`.replace(/[/:]/g, "-"),
      undefined,
      { width: 1920, height: 1080, fps: 30 },
    );
    useProject.getState().load(path, project);
  }
  set({ screen: "editor" });
  const screens = r.screen
    ? [{ path: r.screen, at: 0, duration: r.duration, cursor: r.cursor }]
    : (r.screenParts ?? []);
  const files = (list: { path: string }[] | undefined): string[] => [
    ...new Set((list ?? []).map((p) => p.path)),
  ];
  const cameraFiles = files(r.cameraParts);
  const micFiles = r.microphone ? [r.microphone] : files(r.microphoneParts);
  const systemFiles = r.systemAudio ? [r.systemAudio] : files(r.systemParts);
  const wanted = [
    ...screens.map((s) => s.path),
    ...cameraFiles,
    ...micFiles,
    ...systemFiles,
    ...(r.narration ? [r.narration] : []),
  ];
  const assets = await importMedia(wanted);
  const byPath = (path: string | undefined): Asset | undefined =>
    path ? assets.find((a) => a.path.toLowerCase() === path.toLowerCase()) : undefined;
  const when = stamp();
  const { patchAsset } = useProject.getState();
  screens.forEach((s, i) => {
    const asset = byPath(s.path);
    if (!asset) return;
    // Each part keeps the markers of its own stretch, in its own seconds.
    const markers = r.markers
      .filter((m) => m.t >= s.at && m.t <= s.at + s.duration)
      .map((m) => ({ ...m, t: Math.round((m.t - s.at) * 1000) / 1000 }));
    patchAsset(asset.id, {
      ...(s.cursor ? { cursor: s.cursor } : {}),
      ...(r.guidedRun && i === 0 ? { guidedRun: r.guidedRun } : {}),
      markers,
      name: screens.length > 1 ? `Tela ${when} · parte ${i + 1}` : `Tela ${when}`,
    });
  });
  for (const path of cameraFiles) {
    const asset = byPath(path);
    if (asset) patchAsset(asset.id, { name: `Câmera ${when}` });
  }
  const mic = byPath(r.microphone);
  for (const path of micFiles) {
    const asset = byPath(path);
    if (asset) patchAsset(asset.id, { name: `Voz ${when}` });
  }
  const system = byPath(r.systemAudio);
  for (const path of systemFiles) {
    const asset = byPath(path);
    if (asset) patchAsset(asset.id, { name: `Áudio do PC ${when}` });
  }

  // A "Só voz" take: each take of each script line, and the voice treated from the start.
  const voice = r.mode === "voice" && mic ? mic : undefined;
  if (voice) patchAsset(voice.id, { voiceTakes: voiceTakes(r) });
  let layout: RecordingLayout | undefined;
  useProject.getState().commit((p) => {
    const current = p.assets.filter((a) => assets.some((b) => b.id === a.id));
    // A screen kept in parts (no room to join them) goes end to end from where the voice played;
    // a new voice take goes after the voice already there, on the same "Voz" track.
    layout =
      r.mode === "over" && r.screen
        ? layoutOverNarration(p, current, r, { cameraTransform })
        : layoutRecording(p, current, r, voiceTakeStart(p, r) ?? r.over?.from, {
            cameraTransform,
          });
    return {
      ...p,
      tracks: layout.tracks,
      clips: layout.clips,
      ...(voice
        ? {
            assets: p.assets.map((a) =>
              a.id === voice.id ? { ...a, voicePreset: "teacher" as const } : a,
            ),
          }
        : {}),
    };
  });
  if (!layout) return;
  const take = basename(r.dir);
  for (const { assetId, role } of layout.roles)
    patchAsset(assetId, {
      recording: { id: take, role },
      // A narration taken from a presenter's video is the presenter's voice: never cleaned of
      // hesitations.
      ...(role === "narration" && r.narrationFromVideo ? { origin: "presenter" as const } : {}),
    });
  const roleIds = (role: string): string[] =>
    layout?.roles.filter((x) => x.role === role).map((x) => x.assetId) ?? [];
  // Where the screen stands still, found in the background for the cleanup.
  const now = useProject.getState().project;
  if (now) requestMotion(now);

  const markers = r.markers.filter((m) => m.kind === "marker").length;
  const camera = layout.placed.some((c) => roleIds("camera").includes(c.assetId));
  toast(
    `Gravação de ${Math.round(layout.duration)} s adicionada${camera ? " com a câmera" : ""}${markers ? ` · ${markers} marcador(es)` : ""}.`,
    "success",
  );
  const notes = [...(r.warnings ?? []), ...(r.encoderIssues ?? [])];
  if (notes.length) toast(`Avisos da gravação: ${notes.join(" ")}`, "info");
  const done = layout;
  if (voice) {
    // The takes become one cleanup proposal once the waveform is there (the silences).
    void treatVoices([voice.id], "teacher");
    void proposeTakes(voice.id);
  } else if (mic && r.markers.some((m) => m.kind === "retake"))
    void proposeRetakes(mic.id, done, r.markers);
  const failures = await recordingImported({
    result: r,
    layout: done,
    assets: {
      screen: roleIds("screen"),
      camera: roleIds("camera"),
      ...(mic ? { mic: mic.id } : {}),
      ...(system ? { system: system.id } : {}),
      ...(roleIds("narration")[0] ? { narration: roleIds("narration")[0] } : {}),
    },
  });
  for (const error of failures)
    toast(`Depois da gravação: ${error instanceof Error ? error.message : String(error)}`, "error");
  // Only a take whose every file came in, in a project that was saved, is not offered again.
  if (wanted.every((path) => byPath(path)) && (await useProject.getState().saveNow()))
    await window.api.recorder
      .imported(r.dir)
      .catch((error: unknown) =>
        toast(
          `A gravação entrou no projeto, mas a pasta dela vai aparecer de novo ao abrir: ${(error as Error).message}`,
          "info",
        ),
      );
}

/**
 * Redo presses (Ctrl+Shift+R by default) become a cut proposal once the voice's audio envelope is ready: each kept
 * stretch of the take gets the cuts of the presses inside it.
 */
async function proposeRetakes(
  voiceId: string,
  layout: RecordingLayout,
  markers: RecordingResult["markers"],
): Promise<void> {
  let asset: Asset | undefined;
  for (let i = 0; i < 120; i++) {
    asset = useProject.getState().project?.assets.find((a) => a.id === voiceId);
    if (asset?.waveform) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const p = useProject.getState().project;
  if (!p || !asset?.waveform) return;
  // The cut times are read from this state of the project; showProposal refuses them if it changed.
  const revision = useProject.getState().revision;
  const wave = await loadWaveform(asset.waveform);
  const cuts: [number, number][] = [];
  for (const piece of layout.pieces) {
    const clip = piece.voice && p.clips.find((c) => c.id === piece.voice?.id);
    if (!clip) continue;
    // The voice starts at the take's second 0: take seconds are its own seconds.
    const presses = markers.filter((m) => m.t >= piece.from && m.t <= piece.to);
    for (const [a, b] of retakeCuts(presses, wave.peaks, wave.peaksPerSecond)) {
      const range: [number, number] = [timelineAt(clip, a), timelineAt(clip, b)];
      if (range[0] >= clip.start && range[1] <= clipEnd(clip)) cuts.push(range);
    }
  }
  if (!cuts.length) return;
  const msg = await showProposal(
    p,
    `Trechos para refazer (${recorderKey("retake")})`,
    cuts.map(([start, end]) => ({
      start,
      end,
      reason: `marcado com ${recorderKey("retake")} durante a gravação`,
    })),
    revision,
    "gravacao",
  );
  useApp.getState().toast(msg.split("\n")[0], "info");
}

/** After a "Só voz" take: repeated and redone takes as the voice cleanup proposal. */
async function proposeTakes(voiceId: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const asset = useProject.getState().project?.assets.find((a) => a.id === voiceId);
    if (!asset) return;
    if (asset.waveform) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const asset = useProject.getState().project?.assets.find((a) => a.id === voiceId);
  const takes = asset?.voiceTakes ?? [];
  const seen = new Set<number>();
  let repeated = false;
  for (const t of takes) {
    if (t.retake || seen.has(t.line)) repeated = true;
    seen.add(t.line);
  }
  if (!repeated) return;
  const msg = await proposeVoiceCleanup("gravacao");
  useApp.getState().toast(msg.split("\n")[0], "info");
}

let listening = false;
export function listenRecordings(): void {
  if (listening) return;
  listening = true;
  window.api.recorder.onDone((r) => void importRecording(r));
  // Plans edited in the recorder belong to the lesson they were made for.
  window.api.recorder.onGuided(({ projectId, store }) => {
    if (useProject.getState().project?.id === projectId) useProject.getState().setGuided(store);
  });
}
