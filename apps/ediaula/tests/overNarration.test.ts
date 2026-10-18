import assert from "node:assert/strict";
import { test } from "node:test";
import { cameraPresenterTransform } from "../src/shared/compose.ts";
import {
  clockOffset,
  layoutOverNarration,
  overAnchor,
  overPieces,
} from "../src/shared/overNarration.ts";
import type { RecordingResult } from "../src/shared/recording.ts";
import { layoutRecording } from "../src/shared/recordingImport.ts";
import { momentInTake } from "../src/shared/recordingJournal.ts";
import { defaultTracks } from "../src/shared/timeline.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

/**
 * A take whose first frame came at QPC 1000 ms. The voice was asked to play from 12 s of the
 * timeline at QPC 1800, but the sound card puts it in the headphones 40 ms later; the window's
 * clock runs 5000 ms behind the main process's.
 */
const FIRST_FRAME = 1000;
const LATENCY = 0.04;
const WINDOW_BEHIND = 5000;

/** The anchors the recorder window would send every half second of playback. */
function anchors(from: number, playAt: number, pauses: [number, number][], until: number) {
  const out: { qpc: number; at: number }[] = [];
  for (let qpc = playAt + 100; qpc < until; qpc += 500) {
    if (pauses.some(([a, b]) => qpc >= a && qpc < b)) continue;
    // Seconds of voice played so far (it stops during the pauses).
    const paused = pauses.reduce(
      (s, [a, b]) => s + Math.max(0, Math.min(qpc, b) - a) * (qpc > a ? 1 : 0),
      0,
    );
    // Where the audio element is; what reaches the ears is LATENCY behind it.
    const currentTime = (qpc - playAt - paused) / 1000;
    out.push(
      overAnchor({
        now: qpc - WINDOW_BEHIND,
        currentTime,
        fileStart: from,
        latency: LATENCY,
        offset: WINDOW_BEHIND,
      }),
    );
  }
  return out;
}

test("o relógio da janela é medido pela ida e volta mais curta", () => {
  const offset = clockOffset([
    { sent: 0, got: 30, qpc: 5020 },
    { sent: 100, got: 104, qpc: 5102 },
    { sent: 200, got: 260, qpc: 5250 },
  ]);
  assert.equal(offset, 5000);
});

test("o take entra no tempo certo da narração, compensando a latência e as pausas", () => {
  const segments = [{ start: FIRST_FRAME, duration: 20 }];
  // Paused from 6 s to 9 s of the take (QPC 7000 to 10000): the voice paused with it.
  const pauseQpc: [number, number] = [7000, 10000];
  const journal = anchors(12, 1800, [pauseQpc], FIRST_FRAME + 20000);
  const result: Pick<RecordingResult, "duration" | "pauses" | "over"> = {
    duration: 20,
    pauses: [[6, 9]],
    over: {
      from: 12,
      anchors: journal.map((a) => ({ t: momentInTake(segments, a.qpc), at: a.at })),
    },
  };
  const pieces = overPieces(result);
  // The first 0.84 s of the take came before the voice was heard (0.8 s until it played, 40 ms
  // in the sound card): they are left out, and second 0.84 of the take is second 12.
  assert.equal(pieces.length, 2);
  assert.ok(Math.abs(pieces[0].from - 0.84) < 0.002, String(pieces[0].from));
  assert.ok(Math.abs(pieces[0].start - 12) < 0.002, String(pieces[0].start));
  assert.equal(pieces[0].to, 6);
  // After the pause the screen goes on where the voice went on: no gap, no overlap.
  assert.ok(Math.abs(pieces[1].start - (12 + 6 - 0.84)) < 0.002, String(pieces[1].start));
  assert.equal(pieces[1].from, 9);
});

const videoTrack = (id: string, name: string): Track => ({
  id,
  kind: "video",
  name,
  muted: false,
  hidden: false,
  locked: false,
});

const screenAsset = (id: string, role?: "screen" | "camera"): Asset => ({
  id,
  name: id,
  path: `C:/${id}.mp4`,
  kind: "video",
  duration: 60,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: false,
  size: 1,
  proxyStatus: "none",
  ...(role ? { recording: { id: "gravacao", role } } : {}),
});

const wholeClip = (id: string, assetId: string, trackId: string): Clip => ({
  id,
  assetId,
  trackId,
  start: 0,
  in: 0,
  duration: 40,
  volume: 1,
});

/**
 * A redo of 12 to 20 s: the voice plays from 10 s (two seconds of lead-in) at QPC 1800, and the
 * take lasts `seconds` (15 covers the whole stretch; less is a take stopped early).
 */
function redo(seconds: number): RecordingResult {
  const segments = [{ start: FIRST_FRAME, duration: seconds }];
  const journal = anchors(10, 1800, [], FIRST_FRAME + seconds * 1000);
  return {
    version: 2,
    dir: "C:/take",
    screen: "C:/nova.mp4",
    duration: seconds,
    pauses: [],
    markers: [],
    mode: "over",
    over: {
      from: 12,
      to: 20,
      replace: true,
      anchors: journal.map((a) => ({ t: momentInTake(segments, a.qpc), at: a.at })),
    },
  };
}

const onTrack = (clips: readonly Clip[], trackId: string) =>
  clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start)
    .map((c) => [
      c.assetId,
      Math.round(c.start * 1000) / 1000,
      Math.round(c.duration * 1000) / 1000,
    ]);

test("regravar a tela num intervalo troca só aquele trecho da faixa da tela", () => {
  const old = screenAsset("antiga", "screen");
  const project: Pick<Project, "tracks" | "clips" | "assets"> = {
    tracks: [videoTrack("tv", "F1")],
    clips: [wholeClip("old", "antiga", "tv")],
    assets: [old],
  };
  const layout = layoutOverNarration(project, [old, screenAsset("nova")], redo(15));
  assert.deepEqual(onTrack(layout.clips, "tv"), [
    ["antiga", 0, 12],
    ["nova", 12, 8],
    ["antiga", 20, 20],
  ]);
  const placed = layout.clips.find((c) => c.assetId === "nova");
  // Timeline 12 s was heard 2 s into the voice, 0.84 + 2 s into the take.
  assert.ok(placed && Math.abs(placed.in - 2.84) < 0.002, String(placed?.in));
});

test("uma regravação parada antes do fim troca só o que gravou", () => {
  const old = screenAsset("antiga", "screen");
  const project: Pick<Project, "tracks" | "clips" | "assets"> = {
    tracks: [videoTrack("tv", "F1")],
    clips: [wholeClip("old", "antiga", "tv")],
    assets: [old],
  };
  // Stopped 5 s into the take: the voice was at 14.16 s, and 14.16 to 20 s keeps the old screen.
  const layout = layoutOverNarration(project, [old, screenAsset("nova")], redo(5));
  assert.deepEqual(onTrack(layout.clips, "tv"), [
    ["antiga", 0, 12],
    ["nova", 12, 2.16],
    ["antiga", 14.16, 25.84],
  ]);
});

test("a regravação troca a tela na faixa em que a tela está, não na principal", () => {
  // The screen of the first take on a "Tela" track; the main track holds something else (a
  // camera) that the redo must leave alone.
  const old = screenAsset("antiga", "screen");
  const camera = screenAsset("camera", "camera");
  const project: Pick<Project, "tracks" | "clips" | "assets"> = {
    tracks: [videoTrack("ts", "Tela"), videoTrack("tv", "F1")],
    clips: [wholeClip("old", "antiga", "ts"), wholeClip("cam", "camera", "tv")],
    assets: [old, camera],
  };
  const layout = layoutOverNarration(project, [old, camera, screenAsset("nova")], redo(15));
  assert.deepEqual(onTrack(layout.clips, "ts"), [
    ["antiga", 0, 12],
    ["nova", 12, 8],
    ["antiga", 20, 20],
  ]);
  assert.deepEqual(onTrack(layout.clips, "tv"), [["camera", 0, 40]]);
});

test("Voz e câmera e depois a tela sobre a narração: o apresentador no canto e a tela visível embaixo", () => {
  // The "Voz e câmera" take: a landscape camera without its background removed.
  const voice: Asset = { ...screenAsset("voz"), kind: "audio", hasVideo: false, hasAudio: true };
  const camera = screenAsset("cam");
  const frame = { width: 1920, height: 1080 };
  const take: RecordingResult = {
    version: 2,
    dir: "C:/vc",
    microphone: "C:/voz.mp4",
    cameraParts: [{ path: "C:/cam.mp4", at: 0, in: 0, duration: 30 }],
    duration: 30,
    pauses: [],
    markers: [],
    mode: "voicecam",
  };
  const first = layoutRecording({ tracks: defaultTracks(), clips: [] }, [voice, camera], take, 0, {
    presenterTransform: (a) => cameraPresenterTransform(a, frame),
  });
  const presenterTrack = first.tracks.find((t) => t.name === "Apresentador");
  const presenter = first.clips.find((c) => c.assetId === "cam");
  assert.ok(presenterTrack && presenter?.transform);
  const t = presenter.transform;
  // In the corner, inside the frame: never over the whole lesson.
  assert.ok(t.scale < 0.5, `scale ${t.scale}`);
  assert.ok(t.x + t.scale / 2 <= 1 && t.y + t.scale / 2 <= 1, JSON.stringify(t));
  assert.ok(t.x > 0.5 && t.y > 0.5, "on the lower right");

  // Then the screen over that narration.
  const segments = [{ start: FIRST_FRAME, duration: 20 }];
  const journal = anchors(0, 1800, [], FIRST_FRAME + 20000);
  const over: RecordingResult = {
    version: 2,
    dir: "C:/over",
    screen: "C:/tela.mp4",
    duration: 20,
    pauses: [],
    markers: [],
    mode: "over",
    over: {
      from: 0,
      anchors: journal.map((a) => ({ t: momentInTake(segments, a.qpc), at: a.at })),
    },
  };
  const screen = screenAsset("tela");
  const second = layoutOverNarration(
    { tracks: first.tracks, clips: first.clips, assets: [voice, camera] },
    [voice, camera, screen],
    over,
  );
  const screenClip = second.clips.find((c) => c.assetId === "tela");
  assert.ok(screenClip, "the screen came in");
  const order = second.tracks.map((tr) => tr.id);
  // Tracks above come first: the presenter stays above the screen, which shows around it.
  assert.ok(
    order.indexOf(presenterTrack.id) < order.indexOf(screenClip.trackId),
    "the presenter's track is above the screen's",
  );
  assert.ok(second.clips.some((c) => c.assetId === "cam" && c.transform?.scale === t.scale));
});
