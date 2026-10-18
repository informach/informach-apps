import { squareCrop, type Transform } from "@shared/compose";
import { type RecordingResult, retakeCuts } from "@shared/recording";
import { speechItems } from "@shared/script";
import { clipEnd, newId, timelineAt, trackEnd } from "@shared/timeline";
import type { Asset, Clip } from "@shared/types";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { importMedia } from "./importMedia";
import { loadWaveform } from "./media";
import { activePalette } from "./palettes";
import { showProposal } from "./proposals";
import { scriptDoc } from "./script";

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

/** A finished recording goes into the open project (or a new one), screen and camera in sync. */
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
  const assets = await importMedia([
    r.screen,
    ...(r.camera ? [r.camera] : []),
    ...(r.systemAudio ? [r.systemAudio] : []),
    ...(r.narration ? [r.narration] : []),
  ]);
  const system = assets.find((a) => a.path === r.systemAudio);
  const narration = assets.find((a) => a.path === r.narration);
  const screen = assets.find((a) => a.path === r.screen);
  if (!screen) return;
  const when = stamp();
  useProject
    .getState()
    .patchAsset(screen.id, { cursor: r.cursor, markers: r.markers, name: `Tela ${when}` });
  if (r.camera && assets[1])
    useProject.getState().patchAsset(assets[1].id, { name: `Câmera ${when}` });
  if (system) useProject.getState().patchAsset(system.id, { name: `Áudio do PC ${when}` });
  const camera = assets.find((a) => a.path === r.camera);

  let placed: Clip | undefined;
  useProject.getState().commit((p) => {
    const videoTracks = p.tracks.filter((t) => t.kind === "video" && !t.locked);
    const main = videoTracks[videoTracks.length - 1];
    if (!main) return p;
    const start = Math.max(
      trackEnd(p.clips, main.id),
      ...(camera ? [trackEnd(p.clips, videoTracks[0].id)] : []),
    );
    placed = {
      id: newId("c"),
      assetId: screen.id,
      trackId: main.id,
      start,
      in: 0,
      duration: screen.duration,
      volume: 1,
    };
    const clips = [...p.clips, placed];
    if (camera && videoTracks.length > 1)
      clips.push({
        id: newId("c"),
        assetId: camera.id,
        trackId: videoTracks[0].id,
        start,
        in: 0,
        duration: Math.min(camera.duration, screen.duration),
        volume: 0,
        transform: cameraTransform(camera),
      });
    // The computer's sound on its own track, lined up with the screen (it may start a little later or earlier).
    let tracks = p.tracks;
    if (narration && (r.narrationOffset ?? 0) < screen.duration) {
      const track = {
        id: newId("t"),
        kind: "audio" as const,
        name: "Narração guiada",
        muted: false,
        hidden: false,
        locked: false,
      };
      tracks = [...tracks, track];
      const offset = Math.max(0, r.narrationOffset ?? 0);
      clips.push({
        id: newId("c"),
        assetId: narration.id,
        trackId: track.id,
        start: start + offset,
        in: 0,
        duration: Math.min(narration.duration, screen.duration - offset),
        volume: 1,
      });
    }
    if (system) {
      let track = tracks.find((t) => t.kind === "audio" && t.name === "Áudio do PC");
      if (!track) {
        track = {
          id: newId("t"),
          kind: "audio",
          name: "Áudio do PC",
          muted: false,
          hidden: false,
          locked: false,
        };
        tracks = [...tracks, track];
      }
      const offset = r.systemOffset ?? 0;
      const skip = Math.max(0, -offset);
      clips.push({
        id: newId("c"),
        assetId: system.id,
        trackId: track.id,
        start: start + Math.max(0, offset),
        in: skip,
        duration: Math.max(
          0.1,
          Math.min(system.duration - skip, screen.duration - Math.max(0, offset)),
        ),
        volume: 0.8,
      });
    }
    return { ...p, tracks, clips };
  });
  const markers = r.markers.filter((m) => m.kind === "marker").length;
  toast(
    `Gravação de ${Math.round(r.duration)} s adicionada${camera ? " com a câmera" : ""}${markers ? ` · ${markers} marcador(es)` : ""}.`,
    "success",
  );
  if (placed && r.markers.some((m) => m.kind === "retake"))
    void proposeRetakes(screen.id, placed.id);
}

/** Ctrl+R presses become a cut proposal once the audio envelope of the recording is ready. */
async function proposeRetakes(assetId: string, clipId: string): Promise<void> {
  let asset: Asset | undefined;
  for (let i = 0; i < 120; i++) {
    asset = useProject.getState().project?.assets.find((a) => a.id === assetId);
    if (asset?.waveform) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const p = useProject.getState().project;
  const clip = p?.clips.find((c) => c.id === clipId);
  if (!p || !asset?.waveform || !clip) return;
  // The cut times are read from this state of the project; showProposal refuses them if it changed.
  const revision = useProject.getState().revision;
  const wave = await loadWaveform(asset.waveform);
  const cuts = retakeCuts(asset.markers ?? [], wave.peaks, wave.peaksPerSecond)
    .map(([a, b]) => [timelineAt(clip, a), timelineAt(clip, b)] as [number, number])
    .filter(([a, b]) => a >= clip.start && b <= clipEnd(clip));
  if (!cuts.length) return;
  const msg = await showProposal(
    p,
    "Trechos para refazer (Ctrl+R)",
    cuts.map(([start, end]) => ({ start, end, reason: "marcado com Ctrl+R durante a gravação" })),
    revision,
  );
  useApp.getState().toast(msg.split("\n")[0], "info");
}

let listening = false;
export function listenRecordings(): void {
  if (listening) return;
  listening = true;
  window.api.recorder.onDone((r) => void importRecording(r));
}
