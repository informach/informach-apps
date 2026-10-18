import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dtwPreset,
  helpHasVad,
  isJobId,
  whisperArgs,
  whisperPrompt,
  whisperThreads,
} from "../src/shared/whisperArgs.ts";
import {
  makeTranscript,
  parseVadSegments,
  parseWhisper,
  vadOutcome,
  vadToSource,
  type WhisperJson,
  WhisperLog,
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

const shownText = (words: { text: string; dropped?: string }[]): string[] =>
  words.filter((w) => !w.dropped).map((w) => w.text);

test("what whisper invents over silence is set aside, real speech stays", () => {
  const silences: [number, number][] = [
    [3, 8],
    [11.6, 11.8],
    [13, 16],
  ];
  const words = parseWhisper(
    json([
      [" Hoje", 50, 0.9],
      [" vamos", 100, 0.92],
      [" talvez", 150, 0.3],
      [" programar.", 200, 0.9],
      // A sign-off in the five seconds of silence, barely sure.
      [" Obrigado", 450, 0.6],
      [" por", 500, 0.65],
      [" assistir.", 550, 0.6],
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
      // In silence but heard with confidence: kept.
      [" Inscreva-se", 1400, 0.92],
      [" no", 1440, 0.95],
      [" canal.", 1480, 0.93],
    ]),
    silences,
  );
  assert.deepEqual(shownText(words), [
    "Hoje",
    "vamos",
    "talvez",
    "programar.",
    "Obrigado",
    "por",
    "assistir!",
    "Inscreva-se",
    "no",
    "canal.",
  ]);
  const marks = new Map(words.map((w) => [w.text, w.dropped]));
  assert.equal(marks.get("assistir."), "signoff");
  assert.equal(marks.get("hum"), "silence");
  assert.equal(marks.get("Amara.org"), "credit");
  assert.equal(words.length, 18, "set-aside words stay in the transcript to be restored");
  const hum = words.find((w) => w.text === "hum");
  const assistir = words.find((w) => w.text === "assistir!");
  assert.ok(hum && assistir && assistir.start > hum.end, "a set-aside word does not push others");
});

test("speech the VAD heard is never taken for silence", () => {
  const words = parseWhisper(
    json([
      [" baixinho", 450, 0.3],
      [" hum", 650, 0.3],
    ]),
    [[3, 8]],
    [[4, 5]],
  );
  assert.deepEqual(shownText(words), ["baixinho"]);
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

test("a VAD run is kept when its segment table is whole or when it found no speech", () => {
  const info = (o: number, v: number): string =>
    `whisper_vad: vad_segment_info: orig_start: ${o}.00, orig_end: ${o + 1}.00, vad_start: ${v}.00, vad_end: ${v + 1}.00`;
  const words = json([[" oi", 100, 0.9]]);
  const whole = ["whisper_vad: detected 2 speech segments", info(2, 0), info(9, 1)].join("\n");
  assert.equal(vadOutcome(whole, words).kind, "mapped");
  const cut = ["whisper_vad: detected 3 speech segments", info(2, 0), info(9, 1)].join("\n");
  assert.equal(vadOutcome(cut, words).kind, "unmapped", "a missing segment would move words");
  assert.equal(vadOutcome("", words).kind, "unmapped");
  const none = "whisper_vad_segments_from_probs: Final speech segments after filtering: 0";
  assert.equal(vadOutcome(none, { transcription: [] }).kind, "silent", "nothing to run again");
  assert.equal(vadOutcome("", { transcription: [] }).kind, "silent");
});

test("the log is split into lines per stream, even when they interleave mid-line", () => {
  const log = new WhisperLog();
  log.push("err", "whisper_vad: vad_segment_info: orig_start: 1.00, orig_");
  log.push("out", "[00:00.000 --> 00:01.000]  Oi\n");
  log.push("err", "end: 2.00, vad_start: 0.00, vad_end: 1.00\nwhisper_vad: detected 1 speech");
  log.push("err", " segments");
  const vad = log.vadLog();
  assert.deepEqual(parseVadSegments(vad), [{ origStart: 1, origEnd: 2, vadStart: 0, vadEnd: 1 }]);
  assert.match(vad, /detected 1 speech segments/, "a last line without a break is kept");
  assert.equal(isJobId("job_abc-123"), true);
  assert.equal(isJobId("x....Documents"), false);
  assert.equal(isJobId("../x"), false);
});
