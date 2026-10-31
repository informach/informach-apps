import assert from "node:assert/strict";
import { test } from "node:test";
import { pendingSpeech, voiceToTranscribe } from "../src/shared/speechSources.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const media = (
  id: string,
  path: string,
  kind: "video" | "audio",
  extra: Partial<Asset> = {},
): Asset => ({
  id,
  name: id,
  path,
  kind,
  duration: 60,
  width: kind === "video" ? 1920 : 0,
  height: kind === "video" ? 1080 : 0,
  fps: kind === "video" ? 30 : 0,
  hasVideo: kind === "video",
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  ...extra,
});

const track = (id: string, kind: "video" | "audio", muted = false): Track => ({
  id,
  kind,
  name: id,
  muted,
  hidden: false,
  locked: false,
});

const on = (assetId: string, trackId: string, volume = 1): Clip => ({
  id: `c-${assetId}`,
  assetId,
  trackId,
  start: 0,
  in: 0,
  duration: 30,
  volume,
});

const project = (assets: Asset[], clips: Clip[], tracks: Track[]): Project => ({
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

const tracks = [track("v2", "video"), track("v1", "video"), track("a1", "audio")];

test("with the avatar already transcribed, the narration is still transcribed", () => {
  const avatar = media("avatar", "C:/aulas/F1P1-D01.mp4", "video", { transcriptStatus: "ready" });
  const narration = media("narracao", "C:/aulas/narracao.wav", "audio");
  const screen = media("tela", "C:/aulas/tela.mp4", "video");
  const p = project(
    [avatar, narration, screen],
    [on("avatar", "v2"), on("tela", "v1"), on("narracao", "a1")],
    tracks,
  );
  assert.deepEqual(
    pendingSpeech(p).map((a) => a.id),
    ["tela", "narracao"],
    "every pending medium, not only the first candidate",
  );
  assert.deepEqual(
    pendingSpeech(p, new Set(["tela"])).map((a) => a.id),
    ["narracao"],
    "one being transcribed now is not started again",
  );
});

test("silent clips and the voice extracted from a presenter video are transcribed once", () => {
  // The presenter video plays muted and its extracted voice plays on an audio track.
  const heygen = media("heygen", "C:/aulas/F1P2.mp4", "video");
  const voice = media("voz", "C:/cache/F1P2-voz.wav", "audio");
  const camera = media("camera", "C:/gravacoes/camera.mp4", "video");
  const p = project(
    [heygen, voice, camera],
    [on("heygen", "v2", 0), on("voz", "a1"), on("camera", "v1", 0)],
    tracks,
  );
  assert.deepEqual(
    pendingSpeech(p).map((a) => a.id),
    ["voz"],
  );
  // Both heard: still only the extracted voice.
  const both = project([heygen, voice], [on("heygen", "v2"), on("voz", "a1")], tracks);
  assert.deepEqual(
    pendingSpeech(both).map((a) => a.id),
    ["voz"],
  );
  // The video already transcribed: its voice is not transcribed again.
  const done = project(
    [{ ...heygen, transcriptStatus: "ready" }, voice],
    [on("heygen", "v2"), on("voz", "a1")],
    tracks,
  );
  assert.deepEqual(pendingSpeech(done), []);
  // Only the video is on the timeline: the video is transcribed.
  const alone = project([heygen, voice], [on("heygen", "v2")], tracks);
  assert.deepEqual(
    pendingSpeech(alone).map((a) => a.id),
    ["heygen"],
  );
  // A muted track counts as silent.
  const muted = project([voice], [on("voz", "a1")], [track("a1", "audio", true)]);
  assert.deepEqual(pendingSpeech(muted), []);
});

test("a voice heard only under the presenter's own sound is not transcribed again", () => {
  const voice = media("voz", "C:/aulas/voz.wav", "audio");
  const presenter = media("apresentador", "C:/aulas/apresentador.mp4", "video", {
    origin: "presenter",
  });
  // The voice plays muted under the presenter's sound (Clip.mutedFor, older lessons too).
  const muted = project(
    [voice, presenter],
    [{ ...on("voz", "a1"), mutedFor: "presenter" }, on("apresentador", "v2")],
    tracks,
  );
  assert.deepEqual(
    pendingSpeech(muted).map((a) => a.id),
    ["apresentador"],
  );
  // The presenter placed without its sound: only the voice is transcribed.
  const quiet = project([voice, presenter], [on("voz", "a1"), on("apresentador", "v2", 0)], tracks);
  assert.deepEqual(
    pendingSpeech(quiet).map((a) => a.id),
    ["voz"],
  );
});

test("the voice to transcribe for the recorder: the Voz track, muted or not, once per file", () => {
  const voz = track("voz", "audio");
  voz.name = "Voz";
  const part1 = media("parte1", "C:/aulas/parte 1.mp3", "audio");
  const part2 = media("parte2", "C:/aulas/parte 2.mp3", "audio");
  const music = media("musica", "C:/aulas/musica.mp3", "audio");
  const p = project(
    [part1, part2, music],
    [
      { ...on("parte2", "voz"), id: "b", start: 60 },
      // Under the presenter's sound it is still the voice the screen follows.
      { ...on("parte1", "voz"), id: "a", start: 0, mutedFor: "presenter" },
      { ...on("parte1", "voz"), id: "a2", start: 120 },
      on("musica", "a1"),
    ],
    [voz, track("a1", "audio")],
  );
  assert.deepEqual(
    voiceToTranscribe(p).map((a) => a.id),
    ["parte1", "parte2"],
  );
  // Done, running or missing: left out.
  const later = {
    ...p,
    assets: [{ ...part1, transcriptStatus: "ready" as const }, { ...part2, missing: true }, music],
  };
  assert.deepEqual(voiceToTranscribe(later), []);
  assert.deepEqual(
    voiceToTranscribe(p, new Set(["parte1"])).map((a) => a.id),
    ["parte2"],
  );
});
