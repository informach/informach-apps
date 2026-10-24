import { timelineWords } from "@shared/cleanup";
import { cameraPresenterTransform, squareCrop, type Transform } from "@shared/compose";
import { type GuidedRun, normalizeGuidedRun } from "@shared/guidedCursor";
import { applyResumeJoin, type ResumeJoin, resumeJoin } from "@shared/guidedJoin";
import {
  type GuidedReplace,
  type GuidedRunRecord,
  type GuidedStore,
  MAX_PLANS,
  MAX_RUNS,
  planTiming,
} from "@shared/guidedPlan";
import { layoutOverNarration, overEnd } from "@shared/overNarration";
import { pausedInMedia } from "@shared/pausedMedia";
import { plural } from "@shared/plural";
import {
  isVoiceMode,
  type OverContext,
  type RecorderContext,
  type RecordingResult,
  type RecordMode,
  retakeCuts,
  retakeCutsFromWords,
} from "@shared/recording";
import { layoutRecording, type RecordingLayout } from "@shared/recordingImport";
import { recordedStretches, scriptGuide } from "@shared/screenCues";
import { speechItems } from "@shared/script";
import { sourceEnd, timelineAt } from "@shared/timeline";
import type { Asset, Project, RecordingRole } from "@shared/types";
import { voiceClips, voiceSegments, voiceSpan, voiceTakeStart } from "@shared/voiceMaster";
import { voiceTakes } from "@shared/voiceTakes";
import { autoZoomRecording } from "@/editor/RecordingProps";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { placeTakeDrawing } from "./drawing";
import { enrich, importMedia } from "./importMedia";
import { loadWaveform, mediaUrl } from "./media";
import { requestMotion } from "./motion";
import { activePalette } from "./palettes";
import { showProposal } from "./proposals";
import { recorderKey } from "./recorderKeys";
import { recordingImported } from "./recordingHooks";
import { takeRetake } from "./retake";
import { scriptDoc } from "./script";
import { loadAssetTranscript, loadProjectTranscripts } from "./transcripts";
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
  /** "Regravar falas": only these teleprompter lines, in "Só voz" (lib/retake.ts). */
  retakeLines?: number[];
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
  // Every part of the script against the voice: each "Na tela" at its line (or each of its
  // pieces at the words it waits for), and each line said as a place to start a take from.
  const guide = doc ? scriptGuide(doc, words) : null;
  const firstWord = Math.max(0, words.findIndex((w) => w.end >= from) - Math.floor(MAX_WORDS / 4));
  return {
    from,
    ...(request.to !== undefined ? { to: request.to } : {}),
    ...(request.replace ? { replace: true } : {}),
    end: span[1],
    segments: voiceSegments(p, 0, span[1]),
    // All of them, as the recorder can go back to any line; a very long voice keeps the ones
    // around where the take starts.
    words: words
      .slice(firstWord, firstWord + MAX_WORDS)
      .map((w) => ({ t: w.start, end: w.end, text: w.text })),
    cues: guide?.cues ?? [],
    lines: (guide?.places ?? []).slice(0, 5000),
    recorded: recordedStretches(p).slice(0, 5000),
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
      .toast(
        "Para gravar a tela sobre a narração, traga a voz antes: Arquivo › Importar voz, ou grave no modo Só voz.",
        "error",
      );
    return;
  }
  await window.api.recorder.open({
    teleprompter,
    title: section?.videoTitle,
    screenNotes,
    ...(request.mode ? { mode: request.mode } : {}),
    ...(over ? { over } : {}),
    ...(p ? { projectId: p.id } : {}),
    // The lesson's frame (the "Resolução da aula" region) and its colors for drawing on screen.
    ...(p
      ? {
          lesson: {
            width: p.settings.width,
            height: p.settings.height,
            fps: p.settings.fps,
          },
          // The accent first: it is the pen's color over the screen.
          palette: [
            ...new Set(
              [activePalette(p).roles.accent, ...activePalette(p).colors.map((c) => c.hex)]
                .map((hex) => hex.slice(0, 7).toUpperCase())
                .filter((hex) => /^#[\dA-F]{6}$/.test(hex)),
            ),
          ].slice(0, 32),
        }
      : {}),
    ...(p?.guided ? { guided: p.guided } : {}),
    ...(request.guidedReplace ? { guidedReplace: request.guidedReplace } : {}),
    ...(request.retakeLines?.length ? { retakeLines: request.retakeLines } : {}),
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
  // The clips' cuts stay where they are only if the new take is the old one's twin.
  const before = asset.guidedRun ? await guidedRunOf(asset.guidedRun).catch(() => null) : null;
  if (!before || before.timing !== run.timing || before.from !== run.from) {
    toast(
      "Os tempos da demonstração mudaram desde a gravação anterior: ela entrou como uma gravação nova.",
      "info",
    );
    return false;
  }
  if (
    before.viewport.width !== run.viewport.width ||
    before.viewport.height !== run.viewport.height ||
    before.fps !== run.fps
  ) {
    toast(
      `A nova gravação tem ${run.viewport.width} × ${run.viewport.height} a ${run.fps} quadros e a anterior ${before.viewport.width} × ${before.viewport.height} a ${before.fps}: ela entrou como uma gravação nova.`,
      "info",
    );
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
    recording: withPauses({ id: basename(r.dir), role: "screen" }, r, r.screen),
  });
  const updated = useProject.getState().project?.assets.find((a) => a.id === asset.id);
  if (updated) void enrich(updated, info.videoCodec);
  toast(`${asset.name} foi regravada: os clipes seguem nos mesmos pontos.`, "success");
  if (await useProject.getState().saveNow())
    await window.api.recorder.imported(r.dir).catch(() => undefined);
  return true;
}

/**
 * A take's media with what it recorded during the pauses (shared/pausedMedia.ts): no trim may
 * reach those seconds, and the lesson package blanks them.
 */
function withPauses(
  recording: { id: string; role: RecordingRole },
  r: RecordingResult,
  path: string | undefined,
): NonNullable<Asset["recording"]> {
  const paused = path ? pausedInMedia(r, path) : [];
  return paused.length ? { ...recording, paused } : recording;
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

/**
 * A guided take's plan and how its run ended go into the project: the plan when the recorder
 * was opened without this lesson (it comes along with the take), the run when the recorder did
 * not note it (a take recovered after a crash).
 */
async function keepGuidedRun(run: GuidedRun, dir: string): Promise<void> {
  const p = useProject.getState().project;
  if (!p) return;
  let store: GuidedStore = p.guided ?? { plans: [] };
  if (!store.plans.some((plan) => plan.id === run.planId)) {
    const adopted = await window.api.recorder.guidedAdopt(p.id).catch(() => null);
    const plans = (adopted?.plans ?? []).filter((x) => !store.plans.some((y) => y.id === x.id));
    if (plans.length) store = { ...store, plans: [...store.plans, ...plans].slice(0, MAX_PLANS) };
  }
  if (!(store.runs ?? []).some((x) => x.dir === dir)) {
    const pending = run.steps.find((x) => x.status !== "done");
    const record: GuidedRunRecord = {
      planId: run.planId,
      step:
        run.status === "done"
          ? (run.steps.at(-1)?.index ?? run.from) + 1
          : (pending?.index ?? run.from),
      status: run.status,
      dir,
      at: Date.now(),
    };
    store = { ...store, runs: [...(store.runs ?? []), record].slice(-MAX_RUNS) };
  }
  if (store !== p.guided) useProject.getState().setGuided({ ...store, updatedAt: Date.now() });
}

/**
 * The earlier take of the same plan that stopped where this one ("Continuar da etapa k")
 * starts, and where the two join on the timeline.
 */
async function findResumeJoin(run: GuidedRun, take: string): Promise<ResumeJoin | null> {
  const p = useProject.getState().project;
  if (!p || run.from === 0) return null;
  const candidates = p.assets
    .filter((a) => a.guidedRun && a.recording?.role === "screen" && a.recording.id !== take)
    .sort((a, b) => (b.recording?.id ?? "").localeCompare(a.recording?.id ?? ""));
  for (const asset of candidates) {
    const earlier = await guidedRunOf(asset.guidedRun ?? "").catch(() => null);
    if (!earlier || earlier.planId !== run.planId || earlier.from >= run.from) continue;
    return resumeJoin(
      p,
      {
        take: asset.recording?.id ?? "",
        screen: asset.id,
        narrationOffset: earlier.narrationOffset,
      },
      run.narrationOffset,
    );
  }
  return null;
}

/** A finished take goes into the open project (or a new one), every source cut at its pauses. */
export async function importRecording(r: RecordingResult): Promise<boolean> {
  const { toast, set } = useApp.getState();
  // The lines recorded again for the lesson ("Regravar falas") go in as a draft of their own.
  if (takeRetake(r)) {
    set({ screen: "editor" });
    await useProject.getState().saveNow();
    await window.api.recorder
      .imported(r.dir)
      .catch((error: unknown) =>
        toast(
          `As falas regravadas entraram, mas a pasta da tomada vai aparecer de novo ao abrir: ${(error as Error).message}`,
          "info",
        ),
      );
    return true;
  }
  if (r.replaceAsset && useProject.getState().project) {
    try {
      if (await replaceGuidedTake(r)) return true;
    } catch (error) {
      toast(
        `Não consegui substituir a gravação (${(error as Error).message}): ela entrou como nova.`,
        "info",
      );
    }
  }
  if (!useProject.getState().project) {
    // "Gravação 18/10 07:06" on screen; the file cannot have the slash or the colon.
    const name = `Gravação ${stamp()}`;
    const { path, project } = await window.api.createProject(
      name,
      undefined,
      { width: 1920, height: 1080, fps: 30 },
      name.replace(/[/:]/g, "-"),
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
  // "Voz e câmera": the camera is the presenter.
  const presenter = r.mode === "voicecam";
  for (const path of cameraFiles) {
    const asset = byPath(path);
    if (asset)
      patchAsset(asset.id, {
        name: `${presenter ? "Apresentador" : "Câmera"} ${when}`,
        // The presenter, filmed with the voice: never cleaned of hesitations as a voice of its
        // own, and recognized as the presenter by the cleanup and "Preparar aula".
        ...(presenter ? { origin: "presenter" as const } : {}),
      });
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

  // A "Só voz" or "Voz e câmera" take: each take of each script line, and the voice treated from
  // the start (the camera plays muted: the treated voice is what is heard with it).
  const voice = isVoiceMode(r.mode) && mic ? mic : undefined;
  if (voice) patchAsset(voice.id, { voiceTakes: voiceTakes(r) });
  // A guided take: its plan and run in the project, and joined to the take it carries on.
  const run = r.guidedRun ? await guidedRunOf(r.guidedRun).catch(() => null) : null;
  if (run) await keepGuidedRun(run, r.dir);
  const join = run ? await findResumeJoin(run, basename(r.dir)) : null;
  let layout: RecordingLayout | undefined;
  useProject.getState().commit((before) => {
    // Nothing follows the earlier take: it is cut where this one starts, and this one goes there.
    const p = join?.clear ? applyResumeJoin(before, join) : before;
    const current = p.assets.filter((a) => assets.some((b) => b.id === a.id));
    // "Tela sobre a narração" goes where the voice heard is (whole or in parts, by its anchors);
    // a new voice take goes after the voice already there, on the same "Voz" track.
    layout =
      r.mode === "over" && (r.screen || r.screenParts?.length)
        ? layoutOverNarration(p, current, r, { cameraTransform })
        : layoutRecording(
            p,
            current,
            r,
            join?.clear ? join.at : (voiceTakeStart(p, r) ?? r.over?.from),
            { cameraTransform, presenterTransform: (a) => cameraPresenterTransform(a, p.settings) },
          );
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
  if (!layout) return false;
  // A part over the narration: the playhead waits where it ends, where the next part goes on
  // (the same end the recorder starts its next part from).
  const partEnd = r.mode === "over" ? overEnd(r) : null;
  if (partEnd !== null) playback.seek(partEnd);
  const take = basename(r.dir);
  const pathOf = new Map(useProject.getState().project?.assets.map((a) => [a.id, a.path]) ?? []);
  for (const { assetId, role } of layout.roles)
    patchAsset(assetId, {
      recording: withPauses({ id: take, role }, r, pathOf.get(assetId)),
      // A narration taken from a presenter's video is the presenter's voice: never cleaned of
      // hesitations.
      ...(role === "narration" && r.narrationFromVideo ? { origin: "presenter" as const } : {}),
    });
  const roleIds = (role: string): string[] =>
    layout?.roles.filter((x) => x.role === role).map((x) => x.assetId) ?? [];
  // What was drawn on the screen during the take, as "desenho" and "quadro" clips over it: its
  // video is drawn in the background, and the clips come in when it is ready.
  if (r.drawing?.strokes.length || r.drawing?.boards?.length)
    void placeTakeDrawing(r, layout, take).catch((error: unknown) =>
      toast(
        `O desenho feito na tela não entrou na aula: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      ),
    );
  // Where the screen stands still, found in the background for the cleanup.
  const now = useProject.getState().project;
  if (now) requestMotion(now);
  // The automatic zoom of the recorder's options, on each screen of the take that has a cursor.
  // The boards put over the screen while drawing get no zoom (the screen is under them).
  const zoomed = await autoZoomTake(
    roleIds("screen"),
    r.screen ? (r.drawing?.boards ?? []).map((b): [number, number] => [b.start, b.end]) : [],
  );

  const markers = r.markers.filter((m) => m.kind === "marker").length;
  const camera = layout.placed.some((c) => roleIds("camera").includes(c.assetId));
  toast(
    `Gravação de ${Math.round(layout.duration)} s adicionada${camera ? (presenter ? " com o vídeo do apresentador" : " com a câmera") : ""}${markers ? ` · ${plural(markers, "marcador", "marcadores")}` : ""}${zoomed ? ` · ${plural(zoomed, "zoom automático", "zooms automáticos")}` : ""}.`,
    "success",
  );
  const notes = [...(r.warnings ?? []), ...(r.encoderIssues ?? [])];
  if (notes.length) toast(`Avisos da gravação: ${notes.join(" ")}`, "info");
  // The capture goes on through a pause (the resume is instant): those seconds stay in the take's
  // files, never in the lesson, in a trim or in a package.
  if (r.pauses.length)
    toast(
      `${plural(r.pauses.length, "pausa foi cortada", "pausas foram cortadas")} da aula. Os arquivos originais na pasta da gravação ainda guardam esses trechos: a aula, os aparos e o pacote da aula nunca os mostram. Se precisar compartilhar a pasta da gravação, use o pacote da aula.`,
      "info",
    );
  if (run && join?.clear)
    toast(
      `O take continua o anterior na etapa ${run.from + 1}: a narração segue sem salto.`,
      "info",
    );
  else if (run && join) {
    // Something follows the earlier take: the cut is proposed, the new take went to the end.
    const now = useProject.getState().project;
    if (now) {
      const msg = await showProposal(
        now,
        `Encaixe da etapa ${run.from + 1}`,
        [
          {
            start: join.cut[0],
            end: join.cut[1],
            reason: `o take novo refaz a demonstração a partir da etapa ${run.from + 1}`,
          },
        ],
        useProject.getState().revision,
        "gravacao",
      );
      toast(msg.split("\n")[0], "info");
    }
  }
  const done = layout;
  if (voice) {
    // The takes become one cleanup proposal once the waveform is there (the silences).
    void treatVoices([voice.id], "teacher");
    void proposeTakes(voice.id);
  } else if (mic && r.markers.some((m) => m.kind === "retake"))
    void proposeRetakes(mic.id, r.markers);
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
  return true;
}

/**
 * The automatic zoom of a new take on each of its screens with a cursor, when the recorder's
 * options ask for it (on by default). Returns how many zooms it made.
 */
async function autoZoomTake(
  screenIds: string[],
  exclude: readonly [number, number][],
): Promise<number> {
  const settings = await window.api.recorder.settings();
  if (!settings.autoZoom) return 0;
  let total = 0;
  for (const id of screenIds) {
    const asset = useProject.getState().project?.assets.find((a) => a.id === id);
    if (!asset?.cursor) continue;
    try {
      total += await autoZoomRecording(asset, exclude);
    } catch (error) {
      useApp
        .getState()
        .toast(`O zoom automático de ${asset.name} não saiu: ${(error as Error).message}`, "error");
    }
  }
  return total;
}

/**
 * Redo presses (Ctrl+Shift+R by default) become a cut proposal: by the voice's words when it is
 * already transcribed (shared/recording.ts retakeCutsFromWords), otherwise by its volume once the
 * audio envelope is ready, replaced by the words if the voice is transcribed while that proposal
 * still waits. Each clip of the voice gets the cuts it holds whole.
 */
async function proposeRetakes(voiceId: string, markers: RecordingResult["markers"]): Promise<void> {
  let asset: Asset | undefined;
  for (let i = 0; i < 120; i++) {
    asset = useProject.getState().project?.assets.find((a) => a.id === voiceId);
    if (asset?.waveform || asset?.transcriptStatus === "ready") break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const p = useProject.getState().project;
  if (!p || !asset) return;
  const title = `Trechos para refazer (${recorderKey("retake")})`;
  // With the words of the voice, the cut starts where the passage said again was first said.
  const fromWords = await retakeWordCuts(p, asset, markers);
  if (fromWords) {
    await showRetakes(p, asset.id, title, fromWords, "pelas palavras");
    return;
  }
  if (!asset.waveform) return;
  const wave = await loadWaveform(asset.waveform);
  await showRetakes(
    p,
    asset.id,
    title,
    retakeCuts(markers, wave.peaks, wave.peaksPerSecond),
    "pelo volume",
  );
  // When the voice is transcribed later and that proposal is still waiting, the words take its
  // place (a proposal applied or thrown away is left alone).
  const id = asset.id;
  const projectId = p.id;
  const waiting = (q: Project): boolean =>
    (q.proposals ?? []).some((x) => x.by === "gravacao" && x.title === title);
  const stop = useProject.subscribe((s) => {
    const now = s.project;
    const voice = now?.assets.find((a) => a.id === id);
    // Another lesson, the voice gone, or the proposal applied or thrown away: nothing to replace.
    if (!now || now.id !== projectId || !voice || !waiting(now)) {
      stop();
      return;
    }
    if (voice.transcriptStatus !== "ready") return;
    stop();
    void retakeWordCuts(now, voice, markers).then((cuts) =>
      cuts ? showRetakes(now, id, title, cuts, "pelas palavras") : undefined,
    );
  });
}

/** The cuts of the presses by the voice's words, or null when it has no transcript yet. */
async function retakeWordCuts(
  p: Project,
  asset: Asset,
  markers: RecordingResult["markers"],
): Promise<[number, number][] | null> {
  if (asset.transcriptStatus !== "ready" || !asset.transcript) return null;
  const transcript = await loadAssetTranscript(p, asset);
  const words = transcript.words.filter((w) => !w.dropped);
  return words.length ? retakeCutsFromWords(markers, words) : null;
}

/** Shows cuts made in the voice's own seconds, through every clip of it that holds them whole. */
async function showRetakes(
  p: Project,
  voiceId: string,
  title: string,
  cuts: [number, number][],
  how: string,
): Promise<void> {
  // The cut times are read from this state of the project; showProposal refuses them if it changed.
  const now = useProject.getState().project;
  if (!now || now.id !== p.id) return;
  const revision = useProject.getState().revision;
  const ranges: [number, number][] = [];
  for (const clip of now.clips) {
    if (clip.assetId !== voiceId) continue;
    for (const [a, b] of cuts)
      if (a >= clip.in && b <= sourceEnd(clip))
        ranges.push([timelineAt(clip, a), timelineAt(clip, b)]);
  }
  if (!ranges.length) return;
  const msg = await showProposal(
    now,
    title,
    ranges.map(([start, end]) => ({
      start,
      end,
      reason: `marcado com ${recorderKey("retake")} durante a gravação (corte achado ${how})`,
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
  window.api.recorder.onDone((r) => {
    // A part over the narration waits in the recorder for this answer: it only moves on to the
    // next part once this one is in the lesson.
    const answer = (ok: boolean, message?: string): void => {
      if (r.mode === "over")
        void window.api.recorder
          .partResult(r.dir, ok, message)
          .catch((error: unknown) => console.warn("[recorder] resposta da parte:", error));
    };
    importRecording(r).then(
      (placed) => answer(placed, placed ? undefined : "nada da gravação coube na aula"),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        useApp.getState().toast(`A gravação não entrou na aula: ${message}`, "error");
        answer(false, message);
      },
    );
  });
  // Plans edited in the recorder belong to the lesson they were made for.
  window.api.recorder.onGuided(({ projectId, store }) => {
    if (useProject.getState().project?.id === projectId) useProject.getState().setGuided(store);
  });
}
