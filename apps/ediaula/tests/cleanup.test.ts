import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  analyze,
  applyCuts,
  buildSrt,
  closeCommonGaps,
  cutTargets,
  findQuote,
  mergeRanges,
  paragraphs,
  protectedConflicts,
  rippleDeleteRange,
  timelineProtected,
  timelineSilences,
  timelineWords,
  wordsToSource,
} from "../src/shared/cleanup.ts";
import type { Clip, Project, Transcript } from "../src/shared/types.ts";
import { makeTranscript, parseSilences, parseWhisper } from "../src/shared/whisperParse.ts";

// Real whisper.cpp (large-v3-turbo + DTW) output for a synthetic lesson excerpt with a "Né,",
// a "tipo,", a repeated phrase and several pauses.
const json = JSON.parse(
  readFileSync(new URL("./fixtures/fala.whisper.json", import.meta.url), "utf8"),
);
const silences = parseSilences(
  readFileSync(new URL("./fixtures/fala.silences.txt", import.meta.url), "utf8"),
  37,
);
const transcript: Transcript = makeTranscript(json, silences, "large-v3-turbo", "pt", 37);

const text = (ws: { text: string }[]): string => ws.map((w) => w.text).join(" ");

test("silencedetect output is parsed into intervals", () => {
  assert.equal(silences.length, 7);
  assert.deepEqual(silences[0], [6.264, 9.652]);
});

test("whisper tokens become words with punctuation attached and sane timing", () => {
  const words = parseWhisper(json, silences);
  assert.match(
    text(words),
    /^Bom, pessoal, hoje a gente vai falar sobre o olhar e a escuta dentro da sala\. Né, então/,
  );
  for (let i = 1; i < words.length; i++) {
    assert.ok(
      words[i].start >= words[i - 1].end - 1e-9,
      `word ${i} starts after the previous one ends`,
    );
    assert.ok(words[i].end > words[i].start);
  }
  const sala = words.find((w) => w.text === "sala.")!;
  assert.equal(sala.end, 6.264, "end snapped to the start of the following silence");
  const ne = words.find((w) => w.text === "Né,")!;
  assert.ok(ne.start >= 9.652 && ne.start < 9.9, `Né starts right after the pause (${ne.start})`);
});

const project = (): Project => ({
  version: 1,
  id: "p",
  name: "t",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [
    {
      id: "voz",
      name: "voz",
      path: "voz.wav",
      kind: "audio",
      duration: 37,
      width: 0,
      height: 0,
      fps: 0,
      hasVideo: false,
      hasAudio: true,
      size: 1,
      proxyStatus: "none",
      transcript: "t.json",
    },
    {
      id: "tela",
      name: "tela",
      path: "tela.mp4",
      kind: "video",
      duration: 60,
      width: 1920,
      height: 1080,
      fps: 30,
      hasVideo: true,
      hasAudio: false,
      size: 1,
      proxyStatus: "none",
    },
    {
      id: "mus",
      name: "mus",
      path: "mus.mp3",
      kind: "audio",
      duration: 60,
      width: 0,
      height: 0,
      fps: 0,
      hasVideo: false,
      hasAudio: true,
      size: 1,
      proxyStatus: "none",
    },
  ],
  tracks: [
    { id: "v1", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
    { id: "a1", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
    { id: "a2", kind: "audio", name: "Música", muted: false, hidden: false, locked: false },
  ],
  clips: [
    { id: "cv", assetId: "tela", trackId: "v1", start: 0, in: 0, duration: 37, volume: 1 },
    { id: "ca", assetId: "voz", trackId: "a1", start: 0, in: 0, duration: 37, volume: 1 },
    { id: "cm", assetId: "mus", trackId: "a2", start: 0, in: 0, duration: 37, volume: 1 },
  ],
});

const transcripts = new Map([["voz", transcript]]);

test("analysis finds the filler words, the repeated phrase and the long pauses", () => {
  const p = project();
  const words = timelineWords(p, transcripts);
  const issues = analyze(words, timelineSilences(p, transcripts), {
    minSilence: 1,
    keepPause: 0.4,
  });
  const byKey = new Map(words.map((w) => [w.key, w]));
  const fillers = issues.filter((i) => i.kind === "filler").map((i) => byKey.get(i.words[0])!.text);
  assert.deepEqual(fillers, ["Né,", "tipo,"]);
  const repeats = issues
    .filter((i) => i.kind === "repeat")
    .flatMap((i) => i.words.map((k) => byKey.get(k)!.text));
  assert.deepEqual(repeats.sort(), ["Quem", "está", "está?", "participando,", "quem"].sort());
  const pauses = issues.filter((i) => i.kind === "silence");
  assert.equal(pauses.length, 5, "pauses of one second or more");
  for (const s of pauses) assert.ok(s.end > s.start);
});

test("removing the issues leaves the clean sentence, in sync on every speech track", () => {
  const p = project();
  const words = timelineWords(p, transcripts);
  const issues = analyze(words, timelineSilences(p, transcripts));
  const targets = cutTargets(p);
  assert.deepEqual([...targets].sort(), ["a1", "v1"], "music track is not cut");
  const clips = applyCuts(
    p.clips,
    issues.map((i) => [i.start, i.end]),
    targets,
  );
  const after = { ...p, clips };
  const cleanText = text(timelineWords(after, transcripts));
  assert.match(cleanText, /sala\. então antes de ensinar/);
  assert.match(cleanText, /pra turma\. Quem está participando\? Quem ficou de fora\?/);
  assert.match(cleanText, /etária, do infantil ao fundamental\./);
  // Video and voice stay aligned clip for clip.
  const v = clips.filter((c) => c.trackId === "v1").sort((a, b) => a.start - b.start);
  const a = clips.filter((c) => c.trackId === "a1").sort((a, b) => a.start - b.start);
  assert.equal(v.length, a.length);
  v.forEach((c, i) => {
    assert.ok(
      Math.abs(c.start - a[i].start) < 1e-9 &&
        Math.abs(c.in - a[i].in) < 1e-9 &&
        Math.abs(c.duration - a[i].duration) < 1e-9,
    );
  });
  const newEnd = Math.max(...a.map((c) => c.start + c.duration));
  const music = clips.filter((c) => c.trackId === "a2");
  assert.equal(music.length, 1, "music is not chopped");
  assert.equal(music[0].start, 0);
  assert.ok(Math.abs(music[0].duration - newEnd) < 1e-9, "music bed now ends with the lesson");
  const saved = 37 - newEnd;
  assert.ok(saved > 6 && saved < 12, `about 8 s removed (${saved.toFixed(2)})`);
});

test("rippleDeleteRange cuts and shifts only target tracks", () => {
  const clips: Clip[] = [
    { id: "x", assetId: "a", trackId: "t1", start: 0, in: 0, duration: 10, volume: 1 },
    { id: "y", assetId: "a", trackId: "t1", start: 10, in: 10, duration: 10, volume: 1 },
    { id: "z", assetId: "b", trackId: "t2", start: 12, in: 0, duration: 5, volume: 1 },
  ];
  const out = rippleDeleteRange(clips, 5, 12, new Set(["t1"]));
  const t1 = out.filter((c) => c.trackId === "t1").sort((a, b) => a.start - b.start);
  assert.deepEqual(
    t1.map((c) => [c.start, c.in, c.duration]),
    [
      [0, 0, 5],
      [5, 12, 8],
    ],
  );
  assert.equal(out.find((c) => c.id === "z")!.start, 12);
});

test("locked music keeps its length; short music that ended early is left alone", () => {
  const p = project();
  const ranges: [number, number][] = [[10, 20]];
  const targets = cutTargets(p);
  const locked = applyCuts(p.clips, ranges, targets, new Set(["a2"]));
  assert.equal(locked.find((c) => c.trackId === "a2")!.duration, 37);
  const shortMusic = p.clips.map((c) => (c.trackId === "a2" ? { ...c, duration: 8 } : c));
  const out = applyCuts(shortMusic, ranges, targets);
  assert.equal(out.find((c) => c.trackId === "a2")!.duration, 8);
});

test("mergeRanges joins overlapping cuts", () => {
  assert.deepEqual(
    mergeRanges([
      [5, 6],
      [1, 2],
      [1.5, 3],
      [3.01, 4],
    ]),
    [
      [1, 4],
      [5, 6],
    ],
  );
});

test("paragraphs and SRT captions", () => {
  const words = timelineWords(project(), transcripts);
  const paras = paragraphs(words);
  assert.ok(paras.length >= 3);
  const srt = buildSrt(words);
  assert.match(srt, /^1\n00:00:00,\d{3} --> 00:00:0\d,\d{3}\nBom, pessoal/);
  const ne = words.find((w) => w.text === "Né,")!;
  assert.match(
    buildSrt(words, new Set([ne.key])),
    /\nEntão antes de ensinar/,
    "sentence after a removed filler is capitalized",
  );
  for (const cue of srt.trim().split("\n\n")) {
    const lines = cue.split("\n").slice(2);
    assert.ok(lines.length <= 2);
    for (const l of lines) assert.ok(l.length <= 50, `line too long: ${l}`);
  }
});

test("findQuote matches spoken text ignoring case, accents and punctuation", () => {
  const words = timelineWords(project(), transcripts);
  const once = findQuote(words, "quem ficou de FORA");
  assert.equal(once.length, 1);
  assert.equal(words[once[0][0]].text, "Quem");
  assert.equal(
    findQuote(words, "Quem está participando").length,
    2,
    "repeated phrase is found twice",
  );
  assert.equal(
    findQuote(words, "faixa etaria tipo do infantil").length,
    1,
    "accents and commas are ignored",
  );
  assert.equal(findQuote(words, "frase inexistente").length, 0);
});

test("protected ranges follow the clip through cuts and block overlapping cuts", () => {
  const p = project();
  const words = timelineWords(p, transcripts);
  const [a, b] = findQuote(words, "Quem ficou de fora")[0];
  const src = wordsToSource(p, words.slice(a, b + 1));
  assert.equal(src.length, 1);
  const withProt: Project = {
    ...p,
    protected: [
      {
        id: "g1",
        assetId: src[0].assetId,
        start: src[0].start,
        end: src[0].end,
        label: "Pergunta-chave",
      },
    ],
  };
  const before = timelineProtected(withProt)[0];
  assert.ok(Math.abs(before.start - words[a].start) < 1e-9);
  // A cut earlier in the lesson shifts the protected range left by the same amount.
  const targets = cutTargets(withProt);
  const clips = applyCuts(withProt.clips, [[2, 4]], targets);
  const after = timelineProtected({ ...withProt, clips })[0];
  assert.ok(Math.abs(after.start - (before.start - 2)) < 1e-6);
  assert.equal(protectedConflicts(withProt, [[before.start - 0.5, before.start + 0.5]]).length, 1);
  assert.equal(protectedConflicts(withProt, [[0, 1]]).length, 0);
});

test("closing gaps keeps every track in sync and only removes stretches empty on all of them", () => {
  const at = (trackId: string, id: string, start: number, duration: number): Clip => ({
    id,
    assetId: "a",
    trackId,
    start,
    in: start,
    duration,
    volume: 1,
  });
  const clips = [
    at("voz", "v1", 2, 5),
    at("voz", "v2", 9, 4),
    at("voz", "v3", 20, 5),
    // A balloon over the second phrase and one in the pause before the third.
    at("baloes", "b1", 10, 2),
    at("baloes", "b2", 15, 1),
    at("musica", "m", 0, 25),
  ];
  const out = closeCommonGaps({ clips }, new Set(["voz", "baloes"]));
  const start = (id: string): number => out.find((c) => c.id === id)?.start ?? Number.NaN;
  // Empty everywhere: 0 to 2, 7 to 9, 13 to 15 and 16 to 20; the balloon at 15 keeps its spot.
  assert.deepEqual(["v1", "v2", "b1", "b2", "v3"].map(start), [0, 5, 6, 9, 10]);
  assert.equal(start("b1") - start("v2"), 1, "the balloon stays one second into the phrase");
  // The music bed is not shifted; it ends with the lesson.
  const music = out.find((c) => c.id === "m");
  assert.deepEqual([music?.start, music?.duration], [0, 15]);
  assert.equal(
    closeCommonGaps({ clips: out }, new Set(["voz", "baloes"])),
    out,
    "nothing left to close",
  );
});

test("closing gaps never cuts or shortens a locked track", () => {
  const at = (trackId: string, id: string, start: number, duration: number): Clip => ({
    id,
    assetId: "a",
    trackId,
    start,
    in: 0,
    duration,
    volume: 1,
  });
  // Voice at 0 to 10 and 15 to 25; a locked track with clips at 0 to 18 and 21 to 25.
  const locked = [at("travada", "l1", 0, 18), at("travada", "l2", 21, 4)];
  const out = closeCommonGaps(
    { clips: [at("voz", "v1", 0, 10), at("voz", "v2", 15, 10), ...locked] },
    new Set(["voz"]),
    new Set(["travada"]),
  );
  assert.deepEqual(
    out.filter((c) => c.trackId === "voz").map((c) => [c.start, c.duration]),
    [
      [0, 10],
      [10, 10],
    ],
  );
  assert.deepEqual(
    out.filter((c) => c.trackId === "travada"),
    locked,
  );
});
