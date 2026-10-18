import assert from "node:assert/strict";
import { test } from "node:test";
import type { SpeechItem } from "../src/shared/script.ts";
import type { Asset, Clip, Project, Track, Transcript } from "../src/shared/types.ts";
import {
  cleanupSummary,
  discardedTakes,
  voiceCleanup,
  waveSilences,
} from "../src/shared/voiceCleanup.ts";
import { voiceTakes } from "../src/shared/voiceTakes.ts";

const speech = (text: string): SpeechItem => ({
  kind: "speech",
  speaker: "Professora",
  avatar: false,
  text,
});
const LINES = [
  speech("Bom dia, turma."),
  speech("Hoje vamos programar o robô."),
  speech("Abram a plataforma."),
];

const voice: Asset = {
  id: "voz",
  name: "Voz",
  path: "C:/aula/voz.wav",
  kind: "audio",
  duration: 30,
  width: 0,
  height: 0,
  fps: 0,
  hasVideo: false,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  recording: { id: "take", role: "mic" },
};
const track: Track = {
  id: "tv",
  kind: "audio",
  name: "Voz",
  muted: false,
  hidden: false,
  locked: false,
};
const clip: Clip = {
  id: "c1",
  assetId: "voz",
  trackId: "tv",
  start: 10,
  in: 0,
  duration: 30,
  volume: 1,
};
const project = (asset: Asset, clips: Clip[] = [clip]): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [asset],
  tracks: [track],
  clips,
});

/** Words said at given times (start, text), 0.3 s each. */
const transcript = (words: [number, string][], silences: [number, number][] = []): Transcript => ({
  version: 1,
  model: "t",
  language: "pt",
  duration: 30,
  words: words.map(([start, text]) => ({ start, end: start + 0.3, text, p: 0.9 })),
  silences,
});

test("as tomadas saem do diário: troca de fala, Ctrl+Shift+R e pausas", () => {
  const takes = voiceTakes({
    duration: 20,
    pauses: [[12, 14]],
    markers: [{ t: 9, kind: "retake" }],
    lines: [
      { t: 0.1, index: 0 },
      { t: 3, index: 1 },
      { t: 6, index: 1 },
      { t: 15, index: 2 },
    ],
  });
  assert.deepEqual(takes, [
    { line: 0, start: 0, end: 3 },
    { line: 1, start: 3, end: 9, retake: true },
    { line: 1, start: 9, end: 15 },
    { line: 2, start: 15, end: 20 },
  ]);
});

test("takes repetidos: fica a última tomada completa, e a incompleta do fim sai", () => {
  const takes = [
    { line: 1, start: 2, end: 5 },
    { line: 1, start: 5, end: 8 },
    { line: 1, start: 8, end: 9.5 },
    { line: 2, start: 9.5, end: 12 },
  ];
  // Without a transcript: the last take of each line stays.
  assert.deepEqual(
    discardedTakes(takes, LINES, undefined).map((d) => d.take.start),
    [2, 5],
  );
  // With one: the last take only said "Hoje vamos", so the one before it is the complete one.
  const tr = transcript([
    [2.1, "Hoje"],
    [2.5, "vamos"],
    [2.9, "programar"],
    [3.3, "o"],
    [3.6, "robô."],
    [5.1, "Hoje"],
    [5.5, "vamos"],
    [5.9, "programar"],
    [6.3, "o"],
    [6.6, "robô."],
    [8.1, "Hoje"],
    [8.5, "vamos"],
  ]);
  assert.deepEqual(
    discardedTakes(takes, LINES, tr).map((d) => [d.take.start, d.kind]),
    [
      [2, "take"],
      [8, "take"],
    ],
  );
});

test("a proposta da voz corta tomadas, vício e silêncio no tempo da timeline", () => {
  const asset: Asset = {
    ...voice,
    voiceTakes: [
      { line: 0, start: 0, end: 3 },
      { line: 1, start: 3, end: 6, retake: true },
      { line: 1, start: 6, end: 10 },
      { line: 1, start: 10, end: 14 },
      { line: 2, start: 14, end: 30 },
    ],
    transcript: "C:/aula/voz.json",
    transcriptStatus: "ready",
  };
  const tr = transcript(
    [
      [0.3, "Bom"],
      [0.7, "dia,"],
      [1.1, "turma."],
      [6.2, "Hoje"],
      [6.6, "vamos"],
      [7, "programar"],
      [7.4, "o"],
      [7.8, "robô."],
      [10.2, "Hoje"],
      [10.6, "vamos"],
      [11, "programar"],
      [11.4, "o"],
      [11.8, "robô."],
      [14.2, "Ahn,"],
      [14.8, "abram"],
      [15.2, "a"],
      [18.6, "plataforma."],
    ],
    [[15.5, 18.6]],
  );
  const items = voiceCleanup({
    project: project(asset),
    transcripts: new Map([["voz", tr]]),
    lines: LINES,
  });
  const kinds = items.map((i) => [i.kind, i.start, i.end]);
  assert.deepEqual(kinds, [
    ["retake", 13, 16],
    ["take", 16, 20],
    ["filler", 24.2, 24.77],
    ["silence", 25.7, 28.4],
  ]);
  const summary = cleanupSummary(items);
  assert.equal(summary.take + summary.retake, 2);
  assert.equal(summary.filler, 1);
  assert.equal(summary.silence, 1);
  // The pause left in place of the silence: 0.4 s (0.2 on each side).
  const silence = items.find((i) => i.kind === "silence");
  assert.ok(silence && Math.abs(10 + 15.5 + 0.2 - silence.start) < 1e-6);
});

test("sem transcrição, o silêncio vem da forma de onda", () => {
  const peaks = [...Array(100).fill(0.5), ...Array(150).fill(0.01), ...Array(100).fill(0.4)];
  assert.deepEqual(waveSilences(peaks, 100), [[1, 2.5]]);
  const items = voiceCleanup({
    project: project(voice),
    transcripts: new Map(),
    silences: new Map([["voz", waveSilences(peaks, 100)]]),
  });
  assert.deepEqual(
    items.map((i) => [i.kind, i.start, i.end]),
    [["silence", 11.2, 12.3]],
  );
});
