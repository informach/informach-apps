import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCuts, cutTargets } from "../src/shared/cleanup.ts";
import type { RecordingResult } from "../src/shared/recording.ts";
import { layoutRecording } from "../src/shared/recordingImport.ts";
import { clipEnd, defaultTracks } from "../src/shared/timeline.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const asset = (id: string, path: string, kind: Asset["kind"], duration: number): Asset => ({
  id,
  name: id,
  path,
  kind,
  duration,
  width: kind === "video" ? 1920 : 0,
  height: kind === "video" ? 1080 : 0,
  fps: 30,
  hasVideo: kind === "video",
  hasAudio: kind === "audio",
  size: 1,
  proxyStatus: "none",
});
const assets = [
  asset("screen", "C:/take/tela.mp4", "video", 10),
  asset("mic", "C:/take/microfone.m4a", "audio", 10),
  asset("system", "C:/take/sistema.m4a", "audio", 10),
  asset("cam", "C:/take/camera-0.mp4", "video", 9.5),
  asset("voice", "C:/take/narracao.wav", "audio", 20),
];
const result: RecordingResult = {
  version: 2,
  dir: "C:/take",
  screen: "C:/take/tela.mp4",
  cursor: "C:/take/cursor.json",
  microphone: "C:/take/microfone.m4a",
  systemAudio: "C:/take/sistema.m4a",
  cameraParts: [{ path: "C:/take/camera-0.mp4", at: 0.4, in: 0, duration: 9.5 }],
  duration: 10,
  pauses: [[3, 5]],
  markers: [],
};
const project = (tracks: Track[] = defaultTracks(), clips: Clip[] = []): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets,
  tracks,
  clips,
});
const on = (clips: Clip[], track: Track | undefined) =>
  clips
    .filter((c) => c.trackId === track?.id)
    .map((c) => [c.assetId, c.start, c.in, Math.round(c.duration * 1000) / 1000]);

test("pauses become cuts on every source at once; each source gets a track of its own", () => {
  const p = project();
  const layout = layoutRecording(p, assets, result);
  assert.equal(layout.duration, 8);
  assert.equal(layout.at, 0);
  const main = layout.tracks.find((t) => t.name === "Faixa 3");
  const above = layout.tracks.find((t) => t.name === "Faixa 4");
  const voice = layout.tracks.find((t) => t.name === "Voz");
  const system = layout.tracks.find((t) => t.name === "Áudio do PC");
  assert.deepEqual(on(layout.clips, main), [
    ["screen", 0, 0, 3],
    ["screen", 3, 5, 5],
  ]);
  // The camera started 0.4 s into the take and ended at 9.9 s.
  assert.deepEqual(on(layout.clips, above), [
    ["cam", 0.4, 0, 2.6],
    ["cam", 3, 4.6, 4.9],
  ]);
  assert.deepEqual(on(layout.clips, voice), [
    ["mic", 0, 0, 3],
    ["mic", 3, 5, 5],
  ]);
  assert.deepEqual(on(layout.clips, system), [
    ["system", 0, 0, 3],
    ["system", 3, 5, 5],
  ]);
  assert.ok(layout.clips.filter((c) => c.trackId === system?.id).every((c) => c.volume === 0.8));
  assert.equal(layout.pieces.length, 2);
  assert.equal(layout.pieces[1].voice?.in, 5);
  assert.deepEqual(
    layout.roles.map((r) => [r.assetId, r.role]),
    [
      ["screen", "screen"],
      ["cam", "camera"],
      ["mic", "mic"],
      ["system", "system"],
    ],
  );
});

test("with one video track the camera gets a track of its own above it, and it shows", () => {
  const tracks = defaultTracks().filter((t) => t.name !== "Faixa 4");
  const layout = layoutRecording(project(tracks), assets, result);
  const index = layout.tracks.findIndex((t) => t.name === "Câmera");
  assert.ok(index >= 0);
  assert.equal(layout.tracks[index].kind, "video");
  // Above the screen: the higher layer comes first.
  assert.equal(layout.tracks[index + 1].name, "Faixa 3");
  assert.equal(layout.clips.filter((c) => c.trackId === layout.tracks[index].id).length, 2);
});

test("a locked main track is left alone: the screen gets its own, after everything", () => {
  const tracks = defaultTracks().map((t) => (t.name === "Faixa 3" ? { ...t, locked: true } : t));
  const lesson: Clip = {
    id: "music",
    assetId: "voice",
    trackId: tracks[3].id,
    start: 0,
    in: 0,
    duration: 12,
    volume: 1,
  };
  const layout = layoutRecording(project(tracks, [lesson]), assets, result);
  const screenTrack = layout.tracks.find((t) => t.name === "Tela");
  assert.ok(screenTrack, "a new track for the screen");
  // Below the other video tracks, not on the one above the locked main.
  const videos = layout.tracks.filter((t) => t.kind === "video");
  assert.equal(videos.at(-1)?.id, screenTrack.id);
  assert.equal(layout.at, 12);
  assert.ok(layout.placed.every((c) => c.start >= 12));
  const locked = tracks.find((t) => t.name === "Faixa 3");
  assert.equal(layout.clips.filter((c) => c.trackId === locked?.id).length, 0);
});

test("sound kept in parts (no room to line it up) is placed piece by piece", () => {
  const parts = [
    asset("m0", "C:/take/microfone-0.m4a", "audio", 4),
    asset("sys", "C:/take/sistema.webm", "audio", 0),
  ];
  const layout = layoutRecording(project(), [...assets, ...parts], {
    ...result,
    microphone: undefined,
    systemAudio: undefined,
    microphoneParts: [{ path: "C:/take/microfone-0.m4a", at: 0.2, in: 0, duration: 4 }],
    systemParts: [{ path: "C:/take/sistema.webm", at: 0, in: 0.1, duration: 9.8 }],
  });
  const voice = layout.tracks.find((t) => t.name === "Voz");
  const system = layout.tracks.find((t) => t.name === "Áudio do PC");
  // The part ends at 4.2 s of the take, inside the pause: only the first stretch has it.
  assert.deepEqual(on(layout.clips, voice), [["m0", 0.2, 0, 2.8]]);
  // The WebM without a known length lasts as its piece says.
  assert.deepEqual(on(layout.clips, system), [
    ["sys", 0, 0.1, 3],
    ["sys", 3, 5.1, 4.8],
  ]);
  assert.ok(layout.roles.some((r) => r.assetId === "m0" && r.role === "mic"));
});

test("the voice track is reused when free and a new one is made when it is not", () => {
  const first = layoutRecording(project(), assets, result);
  const voice = first.tracks.find((t) => t.name === "Voz");
  // A second take after the first one: the same "Voz" is free from 8 s on.
  const second = layoutRecording(project(first.tracks, first.clips), assets, result);
  assert.equal(second.at, 8);
  assert.equal(second.tracks.filter((t) => t.name === "Voz").length, 1);
  assert.ok(second.placed.some((c) => c.trackId === voice?.id && c.start === 8));
  // Placed over the first take, the voice needs another track.
  const over = layoutRecording(project(first.tracks, first.clips), assets, result, 2);
  assert.equal(over.tracks.filter((t) => t.name === "Voz").length, 2);
});

test("the guided narration starts on the recorder's clock, which skipped the pauses", () => {
  const layout = layoutRecording(project(), assets, {
    ...result,
    narration: "C:/take/narracao.wav",
    narrationOffset: 2,
  });
  const track = layout.tracks.find((t) => t.name === "Narração guiada");
  assert.deepEqual(on(layout.clips, track), [["voice", 2, 0, 6]]);
});

test("screen parts kept apart are laid on the take's clock with their own seconds", () => {
  const parts = [
    asset("p0", "C:/take/tela-0.mp4", "video", 4),
    asset("p1", "C:/take/tela-1.mp4", "video", 3),
  ];
  const layout = layoutRecording(project(), parts, {
    version: 2,
    dir: "C:/take",
    screenParts: [
      { path: "C:/take/tela-0.mp4", at: 0, in: 0, duration: 4, cursor: "c0" },
      { path: "C:/take/tela-1.mp4", at: 4, in: 0, duration: 3, cursor: "c1" },
    ],
    duration: 7,
    pauses: [[2, 5]],
    markers: [],
  });
  const main = layout.tracks.find((t) => t.name === "Faixa 3");
  assert.deepEqual(on(layout.clips, main), [
    ["p0", 0, 0, 2],
    ["p1", 2, 1, 2],
  ]);
});

test("cuts reach the microphone and the computer's sound of a take before any transcript", () => {
  const layout = layoutRecording(project(), assets, result);
  const marked: Asset[] = assets.map((a) => {
    const role = layout.roles.find((r) => r.assetId === a.id)?.role;
    return role ? { ...a, recording: { id: "take", role } } : a;
  });
  const p = { ...project(layout.tracks, layout.clips), assets: marked };
  const targets = cutTargets(p);
  const voice = layout.tracks.find((t) => t.name === "Voz");
  const system = layout.tracks.find((t) => t.name === "Áudio do PC");
  assert.ok(voice && targets.has(voice.id));
  assert.ok(system && targets.has(system.id));
  // Cutting a second from the screen cuts the same second from the sound.
  const cut = applyCuts(p.clips, [[1, 2]], targets);
  const end = (track: Track | undefined) =>
    Math.max(...cut.filter((c) => c.trackId === track?.id).map(clipEnd));
  assert.equal(end(system), 7);
  assert.equal(end(voice), 7);
  // A music bed stays out, as before.
  const music = {
    ...p,
    tracks: p.tracks.map((t) => (t.id === system?.id ? { ...t, music: true } : t)),
  };
  assert.equal(cutTargets(music).has(system?.id ?? ""), false);
});
