import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { TimelineWord } from "../src/shared/cleanup.ts";
import { parseScript, parseTarget, speechItems, speechSeconds } from "../src/shared/script.ts";
import { alignSection, bestSection } from "../src/shared/scriptAlign.ts";

const md = readFileSync(new URL("./fixtures/roteiro-farol-dia1.md", import.meta.url), "utf8");
const doc = parseScript(md);

test("reads title, rules, six sections with video ids and target durations", () => {
  assert.equal(doc.title, "Roteiro de gravação · A Chave do Farol · Dia 1");
  assert.equal(doc.wordsPerMinute, 137);
  assert.ok(doc.notes.some((n) => n.startsWith("Edição: o avatar entra, fala e sai")));
  assert.equal(doc.sections.length, 6);
  assert.deepEqual(
    doc.sections.map((s) => s.videoId),
    [
      "video-intro-farol",
      "video-intro-caderno",
      "video-d1-quadro",
      "video-d1-andar",
      "video-d1-limite",
      "video-d1-borda",
    ],
  );
  assert.deepEqual(doc.sections[0].target, [80, 100]);
  assert.deepEqual(doc.sections[3].target, [300, 360]);
  assert.equal(doc.sections[0].videoTitle, "Seu primeiro jogo: A Chave do Farol");
  assert.deepEqual(
    doc.sections.map((s) => s.number),
    ["1", "2", "3", "4", "5", "6"],
  );
});

test("speech, screen directions, avatar inserts, Zappy bridges and notes are told apart", () => {
  const s1 = doc.sections[0];
  const speech = speechItems(s1);
  assert.equal(speech[0].speaker, "Professora");
  assert.ok(speech[0].text.startsWith("Oi! Neste desafio"));
  assert.equal(
    speech.filter((i) => i.speaker === "Professora").length,
    6,
    "one item per paragraph",
  );
  const deb = speech.find((i) => i.avatar)!;
  assert.equal(deb.speaker, "Debinha");
  assert.equal(deb.insertId, "F1P1-D01");
  assert.equal(deb.text, "E como eu levo o personagem até a chave?");
  assert.ok(s1.items.some((i) => i.kind === "bridge" && i.text.startsWith("Sua vez!")));
  assert.ok(s1.items.some((i) => i.kind === "note" && i.label === "Conferência de produção"));
  const allInserts = doc.sections.flatMap((s) =>
    speechItems(s)
      .filter((i) => i.insertId)
      .map((i) => i.insertId),
  );
  assert.deepEqual(allInserts, [
    "F1P1-D01",
    "F1P3-D01",
    "F1P4-R01",
    "F1P4-D01",
    "F1P4-R02",
    "F1P5-D01",
    "F1P6-D01",
    "F1P6-R01",
  ]);
  // Zappy texts never count as narration.
  assert.ok(!speechItems(s1).some((i) => i.text.includes("Jogue a versão pronta: pegue a chave")));
  assert.ok(speechSeconds(s1) > 60 && speechSeconds(s1) < 100);
});

test("target durations in seconds or minutes", () => {
  assert.deepEqual(parseTarget("30 a 40 segundos."), [30, 40]);
  assert.deepEqual(parseTarget("5 a 6 minutos, incluindo encaixes"), [300, 360]);
  assert.deepEqual(parseTarget("90 segundos"), [90, 90]);
});

/** Timeline words from a text, one word every 0.4 s. */
function said(text: string, from = 0): TimelineWord[] {
  return text.split(/\s+/).map((t, i) => ({
    key: `k${from}-${i}`,
    clipId: "c",
    text: t,
    start: from + i * 0.4,
    end: from + i * 0.4 + 0.3,
    p: 0.9,
  }));
}

test("alignment finds each line in the recording and keeps the last take of a retake", () => {
  const s1 = doc.sections[0];
  const first = speechItems(s1)[0].text;
  const words = [
    ...said("Oi! Neste desafio, você vai programar o jogo", 0),
    ...said("ai, errei, vou de novo", 5),
    ...said(first, 10),
    ...said("A história é assim: um barco precisa chegar à costa", 40),
  ];
  const a = alignSection(s1, words);
  const line0 = a.lines[0];
  assert.equal(line0.matched, line0.total);
  assert.ok(line0.start! >= 10, "matched the second take");
  // The false start and the comment after a pause come back as two runs to cut.
  assert.equal(a.offScript.length, 2);
  assert.ok(a.offScript[0].text.startsWith("Oi! Neste desafio"));
  assert.equal(a.offScript[1].text, "ai, errei, vou de novo");
  assert.equal(bestSection(doc, words), 0);
});

import { findLine, openGap, planInsert } from "../src/shared/inserts.ts";
import type { Clip, Transcript } from "../src/shared/types.ts";

test("an avatar insert goes after the line before it, opening the timeline when the pause is short", () => {
  const s1 = doc.sections[0];
  const [p1, p2, , p3] = speechItems(s1);
  // The two paragraphs before the Debinha line end at ~20 s; the next line starts 1 s later.
  const words = [
    ...said(p1.text, 0),
    ...said(p2.text, 12),
    ...said(p3.text, 12 + p2.text.split(/\s+/).length * 0.4 + 1),
  ];
  const a = alignSection(s1, words);
  const deb = speechItems(s1).find((i) => i.insertId === "F1P1-D01")!;
  const prevEnd = a.lines[1].end!;
  const plan = planInsert(s1, a, deb, 3);
  assert.ok(!("error" in plan));
  if ("error" in plan) return;
  assert.equal(plan.duration, 3.5, "the line plus a short pad on each side");
  assert.ok(plan.at >= prevEnd && plan.at < prevEnd + 0.2, "right after the previous line");
  assert.ok(plan.gap > 2, "the 1 s pause is widened");

  // With a long pause nothing is opened.
  const roomy = [...said(p1.text, 0), ...said(p2.text, 12), ...said(p3.text, 40)];
  const plan2 = planInsert(s1, alignSection(s1, roomy), deb, 3);
  assert.ok(!("error" in plan2) && plan2.gap === 0);
});

test("opening the timeline splits speech and video tracks and leaves a music bed alone", () => {
  const clips: Clip[] = [
    { id: "v", assetId: "a", trackId: "video", start: 0, in: 0, duration: 10, volume: 1 },
    { id: "m", assetId: "b", trackId: "music", start: 0, in: 0, duration: 30, volume: 0.3 },
    { id: "x", assetId: "c", trackId: "video", start: 12, in: 0, duration: 2, volume: 1 },
  ];
  const { clips: out, split } = openGap(clips, 4, 3, new Set(["video"]));
  assert.equal(split.length, 1);
  const v = out.filter((c) => c.assetId === "a").sort((x, y) => x.start - y.start);
  assert.deepEqual(
    v.map((c) => [c.start, c.duration, c.in]),
    [
      [0, 4, 0],
      [7, 6, 4],
    ],
  );
  assert.equal(out.find((c) => c.id === "m")!.duration, 30, "music untouched");
  assert.equal(out.find((c) => c.id === "x")!.start, 15, "later clips move right");
});

test("the avatar line is found in the HeyGen transcript, in source time", () => {
  const tr = (text: string, from: number): Transcript => ({
    version: 1,
    model: "m",
    language: "pt",
    duration: 60,
    silences: [],
    words: said(text, from).map((w) => ({ start: w.start, end: w.end, text: w.text, p: 0.9 })),
  });
  const transcripts = new Map([
    ["narr", tr("Oi! Neste desafio você vai programar o jogo", 0)],
    ["deb", tr("E como eu levo o personagem até a chave? E se eu clicar em Rodar?", 2)],
  ]);
  const src = findLine("E como eu levo o personagem até a chave?", transcripts)!;
  assert.equal(src.assetId, "deb");
  assert.ok(Math.abs(src.start - 2) < 0.01);
  assert.ok(src.end < 2 + 9 * 0.4 + 0.01, "stops at the end of the line");
  assert.equal(findLine("Uma frase que ninguém falou nunca", transcripts), null);
});
