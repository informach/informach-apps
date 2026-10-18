import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dtwPreset,
  helpHasVad,
  whisperArgs,
  whisperPrompt,
  whisperThreads,
} from "../src/shared/whisperArgs.ts";
import {
  makeTranscript,
  parseVadSegments,
  parseWhisper,
  vadToSource,
  type WhisperJson,
} from "../src/shared/whisperParse.ts";

/** whisper.cpp full JSON: one token per word, DTW mark in centiseconds. */
const json = (tokens: [string, number, number][]): WhisperJson => ({
  transcription: [
    {
      tokens: tokens.map(([text, cs, p]) => ({
        text,
        offsets: { from: cs * 10, to: cs * 10 + 300 },
        p,
        t_dtw: cs,
      })),
    },
  ],
});

test("what whisper invents over silence goes, real speech stays", () => {
  const silences: [number, number][] = [
    [3, 8],
    [11.6, 11.8],
  ];
  const words = parseWhisper(
    json([
      [" Hoje", 50, 0.9],
      [" vamos", 100, 0.92],
      [" talvez", 150, 0.3],
      [" programar.", 200, 0.9],
      // A sign-off in the five seconds of silence, heard with confidence.
      [" Obrigado", 450, 0.8],
      [" por", 500, 0.85],
      [" assistir.", 550, 0.8],
      // A barely heard word in the middle of the silence.
      [" hum", 650, 0.3],
      // The teacher really says it, over sound.
      [" Obrigado", 900, 0.9],
      [" por", 950, 0.9],
      [" assistir!", 1000, 0.9],
      // Subtitle credits are never part of a lesson.
      [" Legendas", 1100, 0.9],
      [" pela", 1130, 0.9],
      [" comunidade", 1160, 0.9],
      [" Amara", 1190, 0.9],
      [".org", 1200, 0.9],
    ]),
    silences,
  );
  assert.deepEqual(
    words.map((w) => w.text),
    ["Hoje", "vamos", "talvez", "programar.", "Obrigado", "por", "assistir!"],
    "a low-confidence word over sound is kept: it is not in a silence",
  );
});

test("word times measured on the audio VAD shortened go back onto the file", () => {
  const log = [
    "whisper_vad: detected 2 speech segments",
    "whisper_vad: vad_segment_info: orig_start: 2.00, orig_end: 4.00, vad_start: 0.00, vad_end: 2.00",
    "whisper_vad: vad_segment_info: orig_start: 10.00, orig_end: 12.00, vad_start: 2.20, vad_end: 4.20",
  ].join("\n");
  const segs = parseVadSegments(log);
  assert.equal(segs.length, 2);
  assert.equal(vadToSource(1, segs), 3, "inside a segment it is interpolated");
  assert.equal(vadToSource(2.05, segs), 4, "in the gap it snaps to the nearer edge");
  assert.equal(vadToSource(2.15, segs), 10);
  assert.ok(Math.abs(vadToSource(3, segs) - 10.8) < 1e-9);

  const tr = makeTranscript(
    json([
      [" um", 100, 0.9],
      [" dois", 300, 0.9],
    ]),
    [[4, 10]],
    "large-v3-turbo",
    "pt",
    14,
    segs,
  );
  assert.deepEqual(
    tr.words.map((w) => [w.text, w.start, w.end]),
    [
      ["um", 2.85, 3.1],
      ["dois", 10.65, 10.9],
    ],
  );
});

test("whisper-cli gets VAD when the build has it, threads from the cores and twenty names", () => {
  assert.equal(
    helpHasVad("  -nfa,      --no-flash-attn\n             --vad      [false  ] enable"),
    true,
  );
  assert.equal(helpHasVad("  -vm FNAME, --vad-model FNAME"), false, "only the --vad switch counts");
  assert.equal(whisperThreads(12), 10);
  assert.equal(whisperThreads(2), 2);
  assert.equal(whisperThreads(64), 16);
  assert.equal(dtwPreset("large-v3-turbo-q5_0"), "large.v3.turbo");

  const terms = Array.from({ length: 30 }, (_, i) => `Nome${i}`);
  const prompt = whisperPrompt(terms);
  assert.match(prompt, /Nome19\.$/);
  assert.doesNotMatch(prompt, /Nome20/);

  const base = {
    modelPath: "m.bin",
    modelName: "large-v3-turbo-q5_0",
    wav: "a.wav",
    language: "pt",
    out: "out",
    terms: [],
    threads: 10,
    cpu: false,
  };
  const args = whisperArgs({ ...base, vadModel: "silero.bin" });
  assert.deepEqual(args.slice(-3), ["--vad", "--vad-model", "silero.bin"]);
  assert.equal(args[args.indexOf("-t") + 1], "10");
  assert.ok(args.includes("-nfa"), "DTW needs flash attention off");
  const cpu = whisperArgs({ ...base, cpu: true });
  assert.ok(cpu.includes("-ng"));
  assert.ok(!cpu.includes("--vad"));
});
