import { squareCrop, type Transform } from "@shared/compose";
import { type RecordingResult, retakeCuts } from "@shared/recording";
import { layoutRecording, type RecordingLayout } from "@shared/recordingImport";
import { speechItems } from "@shared/script";
import { clipEnd, timelineAt } from "@shared/timeline";
import type { Asset } from "@shared/types";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { importMedia } from "./importMedia";
import { loadWaveform } from "./media";
import { activePalette } from "./palettes";
import { showProposal } from "./proposals";
import { recorderKey } from "./recorderKeys";
import { recordingImported } from "./recordingHooks";
import { scriptDoc } from "./script";

/** The take's folder name, which identifies it (Asset.recording.id). */
const basename = (dir: string): string => dir.split(/[\\/]/).filter(Boolean).at(-1) ?? dir;

/** Opens the recorder over the screen, with the project's script as teleprompter. */
export async function openRecorder(): Promise<void> {
  const p = useProject.getState().project;
  const doc = scriptDoc(p);
  const section = doc && p ? doc.sections[p.script?.section ?? 0] : undefined;
  const teleprompter = section
    ? speechItems(section).map((i) => ({ speaker: i.speaker, text: i.text, avatar: i.avatar }))
    : [];
  await window.api.recorder.open({ teleprompter, title: section?.videoTitle });
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

  let layout: RecordingLayout | undefined;
  useProject.getState().commit((p) => {
    const current = p.assets.filter((a) => assets.some((b) => b.id === a.id));
    layout = layoutRecording(p, current, r, undefined, { cameraTransform });
    return { ...p, tracks: layout.tracks, clips: layout.clips };
  });
  if (!layout) return;
  const take = basename(r.dir);
  for (const { assetId, role } of layout.roles)
    patchAsset(assetId, { recording: { id: take, role } });
  const roleIds = (role: string): string[] =>
    layout?.roles.filter((x) => x.role === role).map((x) => x.assetId) ?? [];

  const markers = r.markers.filter((m) => m.kind === "marker").length;
  const camera = layout.placed.some((c) => roleIds("camera").includes(c.assetId));
  toast(
    `Gravação de ${Math.round(layout.duration)} s adicionada${camera ? " com a câmera" : ""}${markers ? ` · ${markers} marcador(es)` : ""}.`,
    "success",
  );
  const notes = [...(r.warnings ?? []), ...(r.encoderIssues ?? [])];
  if (notes.length) toast(`Avisos da gravação: ${notes.join(" ")}`, "info");
  const done = layout;
  if (mic && r.markers.some((m) => m.kind === "retake"))
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

let listening = false;
export function listenRecordings(): void {
  if (listening) return;
  listening = true;
  window.api.recorder.onDone((r) => void importRecording(r));
}
