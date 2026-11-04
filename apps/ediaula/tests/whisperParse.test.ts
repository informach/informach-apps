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
  fillHoles,
  makeTranscript,
  parseVadSegments,
  parseWhisper,
  transcriptHoles,
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

test("a subtitle credit with any name at the end, and words after the audio, are set aside", () => {
  // Farol Aula 3, Parte 8: "... em Concluir aula. Legenda por Sônia Ruberti", depois do fim.
  const t = makeTranscript(
    json([
      [" Concluir", 7400, 0.98],
      [" aula.", 7660, 0.98],
      [" Legenda", 7710, 0.52],
      [" por", 7722, 0.69],
      [" Sônia", 7727, 0.98],
      [" Ruberti", 7732, 1],
    ]),
    [],
    "m",
    "pt",
    77.13,
  );
  assert.deepEqual(shownText(t.words), ["Concluir", "aula."]);
  // "Legenda" dito no meio de uma aula não é crédito.
  const meio = makeTranscript(
    json([
      [" A", 100, 0.9],
      [" legenda", 140, 0.9],
      [" por", 180, 0.9],
      [" baixo", 220, 0.9],
      [" aparece", 400, 0.9],
      [" quando", 700, 0.9],
      [" você", 1000, 0.9],
      [" fala.", 1300, 0.9],
    ]),
    [],
    "m",
    "pt",
    20,
  );
  assert.equal(shownText(meio.words).length, 8);
});

test("a stretch whisper skipped is heard again with the words next to it, in order", () => {
  // Farol Aula 3, Parte 3: o "O" de "O segundo bloco" saiu antes do buraco, e no buraco havia
  // "Solte em cima do número e deixe em verdadeiro".
  const t = makeTranscript(
    json([
      [" verdadeiro.", 6751, 0.9],
      [" O", 6918, 0.6],
      [" segundo", 7208, 0.9],
      [" bloco", 7242, 0.9],
    ]),
    [],
    "m",
    "pt",
    80,
  );
  const holes = transcriptHoles(t);
  const janela = holes.find(([a, b]) => a <= 69.1 && b >= 72.1);
  assert.ok(janela, JSON.stringify(holes));
  const [ws, we] = janela as [number, number];
  // A janela vai da palavra de antes do buraco ("O") até a de depois ("segundo").
  const filled = fillHoles(t, [
    {
      hole: [ws, we],
      words: [
        { text: "Solte", start: 69.2, end: 69.45, p: 0.9 },
        { text: "em", start: 69.45, end: 69.6, p: 0.9 },
        { text: "cima", start: 69.6, end: 69.83, p: 0.9 },
        { text: "do", start: 69.83, end: 69.95, p: 0.9 },
        { text: "número", start: 69.95, end: 70.2, p: 0.9 },
        { text: "e", start: 70.2, end: 70.4, p: 0.9 },
        { text: "deixe", start: 70.5, end: 70.9, p: 0.9 },
        { text: "em", start: 70.9, end: 71.0, p: 0.9 },
        { text: "verdadeiro.", start: 71.0, end: 71.6, p: 0.9 },
        { text: "O", start: 72.0, end: 72.08, p: 0.9 },
        { text: "segundo", start: 72.08, end: 72.33, p: 0.9 },
      ],
    },
  ]);
  assert.deepEqual(shownText(filled.words), [
    "verdadeiro.",
    "Solte",
    "em",
    "cima",
    "do",
    "número",
    "e",
    "deixe",
    "em",
    "verdadeiro.",
    "O",
    "segundo",
    "bloco",
  ]);
  // Ouvido de novo com menos palavras, fica como estava.
  assert.equal(fillHoles(t, [{ hole: [ws, we], words: [] }]), t);
  // Um silêncio longo não é buraco.
  const calada = makeTranscript(
    json([
      [" Oi.", 100, 0.9],
      [" Tchau.", 900, 0.9],
    ]),
    [[1.5, 8.7]],
    "m",
    "pt",
    10,
  );
  assert.deepEqual(transcriptHoles(calada), []);
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
