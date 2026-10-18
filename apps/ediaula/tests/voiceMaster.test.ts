import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCuts } from "../src/shared/cleanup.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";
import { VOICE_CHAIN_VERSION } from "../src/shared/voiceChain.ts";
import {
  HEYGEN_MAX_SECONDS,
  heygenPlacements,
  masterIsStale,
  pieceFileName,
  pieceToTimeline,
  renderPlan,
  sourceMapFor,
  splitLong,
  voiceClips,
  voiceHash,
} from "../src/shared/voiceMaster.ts";

const asset: Asset = {
  id: "voz",
  name: "Voz",
  path: "C:/aula/voz.wav",
  kind: "audio",
  duration: 120,
  width: 0,
  height: 0,
  fps: 0,
  hasVideo: false,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  recording: { id: "take", role: "mic" },
  voicePreset: "teacher",
  treated: { path: "C:/cache/voz-tratada.wav", preset: "teacher", version: VOICE_CHAIN_VERSION },
};
const tracks: Track[] = [
  { id: "tv", kind: "video", name: "F1", muted: false, hidden: false, locked: false },
  { id: "ta", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
];
const base = (clips: Clip[]): Project => ({
  version: 1,
  id: "p",
  name: "Aula 3",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [asset],
  tracks,
  clips,
});
const voice = (id: string, start: number, inPoint: number, duration: number): Clip => ({
  id,
  assetId: "voz",
  trackId: "ta",
  start,
  in: inPoint,
  duration,
  volume: 1,
});

test("o mapa do pedaço leva o tempo do arquivo exportado ao tempo da timeline depois de cortes", () => {
  // The lesson was cut before the export: 0–20 s and 35–80 s of the recording are left.
  const before = base([voice("a", 0, 0, 20), voice("b", 20, 35, 45)]);
  const map = sourceMapFor(before, 0, 65);
  assert.deepEqual(map, [
    { at: 0, duration: 20, start: 0, assetId: "voz", in: 0 },
    { at: 20, duration: 45, start: 20, assetId: "voz", in: 35 },
  ]);
  // Second 30 of the file is second 45 of the recording, at 30 s on the timeline.
  assert.equal(pieceToTimeline(before, { sourceMap: map }, 30), 30);
  // Cut 10 s more (5–15 s of the timeline) after the export: the same moment moved 10 s left,
  // and what was cut is no longer anywhere.
  const after = { ...before, clips: applyCuts(before.clips, [[5, 15]], new Set(["ta"])) };
  assert.equal(pieceToTimeline(after, { sourceMap: map }, 30), 20);
  assert.equal(pieceToTimeline(after, { sourceMap: map }, 10), null);
});

test("o vídeo do HeyGen segue os cortes: cada pedaço da voz recebe o vídeo feito dele", () => {
  const before = base([voice("a", 0, 0, 20), voice("b", 20, 35, 45)]);
  const piece = { sourceMap: sourceMapFor(before, 0, 65) };
  // The MP4 starts 0.7 s before the voice (offset -0.7) and runs at the same pace.
  const whole = heygenPlacements(before, piece, -0.7, 1, 65.7);
  assert.deepEqual(whole, [{ start: 0, in: 0.7, duration: 65, speed: 1 }]);
  const after = { ...before, clips: applyCuts(before.clips, [[5, 15]], new Set(["ta"])) };
  assert.deepEqual(heygenPlacements(after, piece, -0.7, 1, 65.7), [
    { start: 0, in: 0.7, duration: 5, speed: 1 },
    { start: 5, in: 15.7, duration: 50, speed: 1 },
  ]);
  // A render 0.1% slower: the clip plays it a little faster to keep the mouth on the voice.
  const slow = heygenPlacements(before, piece, 0, 1 / 1.001, 65 * 1.001);
  assert.equal(slow.length, 1);
  assert.ok(Math.abs(slow[0].speed - 1.001) < 1e-6);
});

test("a voz exportada sai tratada, cortada e em mono 48 kHz 16 bits; o hash muda com a edição", () => {
  const p = base([voice("a", 2, 0, 20), voice("b", 22, 35, 10)]);
  const plan = renderPlan(p, 0, 32, "C:/saida.wav");
  assert.deepEqual(plan.inputs, ["C:/cache/voz-tratada.wav", "C:/cache/voz-tratada.wav"]);
  const args = plan.args.join(" ");
  assert.match(args, /-ss 0 -t 20 -i C:\/cache\/voz-tratada\.wav/);
  assert.match(args, /-ss 35 -t 10 -i/);
  assert.match(args, /adelay=2000:all=1/);
  assert.match(args, /adelay=22000:all=1/);
  assert.match(args, /-ar 48000 -ac 1 -c:a pcm_s16le -f wav C:\/saida\.wav$/);
  const h = voiceHash(p);
  assert.equal(masterIsStale(p, { hash: h }), false);
  const cut = { ...p, clips: applyCuts(p.clips, [[4, 5]], new Set(["ta"])) };
  assert.equal(masterIsStale(cut, { hash: h }), true);
  assert.equal(voiceClips(cut).length, 3);
  assert.equal(
    pieceFileName("Aula 3: robôs/blocos", "F1P1-D01"),
    "Aula 3 robôsblocos - F1P1-D01.wav",
  );
});

test("um trecho maior que o HeyGen aceita é dividido numa pausa", () => {
  const long = { label: "Aula", start: 0, end: HEYGEN_MAX_SECONDS + 200 };
  const parts = splitLong([long], [[400, 402]]);
  assert.deepEqual(
    parts.map((p) => [p.label, p.start, p.end]),
    [
      ["Aula · parte 1", 0, 401],
      ["Aula · parte 2", 401, 680],
    ],
  );
  assert.ok(parts.every((p) => p.end - p.start <= HEYGEN_MAX_SECONDS));
});
