import assert from "node:assert/strict";
import { test } from "node:test";
import type { Asset, Clip, Track } from "../src/shared/types.ts";
import { layoutVoiceImport, voiceFileOrder } from "../src/shared/voiceImport.ts";
import { voiceClips, voiceSpan } from "../src/shared/voiceMaster.ts";

const audio = (id: string, duration: number, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: `${id}.mp3`,
  path: `C:/vozes/${id}.mp3`,
  kind: "audio",
  duration,
  width: 0,
  height: 0,
  fps: 0,
  hasVideo: false,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  ...extra,
});
const track = (id: string, kind: Track["kind"], name: string, extra: Partial<Track> = {}) => ({
  id,
  kind,
  name,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const project = (tracks: Track[], clips: Clip[], assets: Asset[]) => ({ tracks, clips, assets });

test("a voice in a lesson without one opens a Voz track from second 0, files one after another", () => {
  const a = audio("a", 30);
  const b = audio("b", 12.5);
  const p = project([track("tv", "video", "Faixa 1")], [], [a, b]);
  const out = layoutVoiceImport(p, [a, b]);
  assert.ok(out);
  const voz = out.tracks.find((t) => t.name === "Voz");
  assert.ok(voz);
  assert.equal(voz.kind, "audio");
  assert.deepEqual(
    out.placed.map((c) => [c.assetId, c.trackId, c.start, c.in, c.duration, c.volume]),
    [
      ["a", voz.id, 0, 0, 30, 1],
      ["b", voz.id, 30, 0, 12.5, 1],
    ],
  );
  assert.deepEqual([out.start, out.end], [0, 42.5]);
  // It is the lesson's voice now: "Tela sobre a narração" and the presenter's video find it.
  const after = { ...p, tracks: out.tracks, clips: out.clips };
  assert.deepEqual(voiceSpan(after), [0, 42.5]);
  assert.equal(voiceClips(after).length, 2);
});

test("a second voice goes after the voice already there, on the same track", () => {
  const first = audio("first", 20);
  const next = audio("next", 5);
  const p = project(
    [track("tv", "video", "Faixa 1"), track("tz", "audio", "Voz")],
    [{ id: "c1", assetId: "first", trackId: "tz", start: 3, in: 0, duration: 20, volume: 1 }],
    [first, next],
  );
  const out = layoutVoiceImport(p, [next]);
  assert.ok(out);
  assert.equal(out.tracks.length, 2);
  assert.deepEqual(
    out.placed.map((c) => [c.trackId, c.start]),
    [["tz", 23]],
  );
});

test("an empty Voz track is used, a locked one never, and files without sound are left out", () => {
  const v = audio("v", 8);
  const mute = audio("mute", 4, { hasAudio: false });
  const empty = project([track("tz", "audio", "Voz")], [], [v, mute]);
  assert.deepEqual(
    layoutVoiceImport(empty, [mute, v])?.placed.map((c) => [c.assetId, c.trackId]),
    [["v", "tz"]],
  );
  const locked = project([track("tz", "audio", "Voz", { locked: true })], [], [v]);
  const out = layoutVoiceImport(locked, [v]);
  assert.ok(out);
  assert.notEqual(out.placed[0].trackId, "tz");
  assert.equal(out.tracks.length, 2);
  assert.equal(layoutVoiceImport(empty, [mute]), null);
});

test("parts of a long voice picked together go in the order of their names", () => {
  assert.deepEqual(
    voiceFileOrder([
      "C:\\vozes\\Aula 3 parte 10.mp3",
      "C:\\vozes\\aula 3 parte 2.mp3",
      "C:/vozes/Aula 3 parte 1.mp3",
    ]),
    [
      "C:/vozes/Aula 3 parte 1.mp3",
      "C:\\vozes\\aula 3 parte 2.mp3",
      "C:\\vozes\\Aula 3 parte 10.mp3",
    ],
  );
});

test("a voz importada vai para a faixa Voz, não para o microfone de um take em outra faixa", () => {
  const mic = audio("mic", 10, { recording: { id: "take", role: "mic" } });
  const voz = audio("voz", 10);
  const next = audio("next", 4);
  const p = project(
    [track("tm", "audio", "Microfone"), track("tz", "audio", "Voz")],
    [
      { id: "c1", assetId: "mic", trackId: "tm", start: 0, in: 0, duration: 10, volume: 1 },
      { id: "c2", assetId: "voz", trackId: "tz", start: 0, in: 0, duration: 10, volume: 1 },
    ],
    [mic, voz, next],
  );
  assert.deepEqual(
    layoutVoiceImport(p, [next])?.placed.map((c) => [c.trackId, c.start]),
    [["tz", 10]],
  );
});
