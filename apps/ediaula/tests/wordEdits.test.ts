import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAss, buildCues, DEFAULT_CAPTION_STYLE, escapeAss } from "../src/shared/captions.ts";
import { applyCuts, cutTargets, type TimelineWord, timelineWords } from "../src/shared/cleanup.ts";
import { clipEnd, splitClip } from "../src/shared/timeline.ts";
import type { Project, Transcript, Word, WordEdit } from "../src/shared/types.ts";
import {
  applyWordEdits,
  nudged,
  removedWords,
  transcriptView,
  withEditEverywhere,
  withRestored,
  withShownEdit,
  wordsLike,
} from "../src/shared/wordEdits.ts";

const heard: Transcript = {
  version: 1,
  model: "large-v3-turbo",
  language: "pt",
  duration: 10,
  silences: [],
  words: [
    { text: "Olá,", start: 0.5, end: 0.9, p: 0.9 },
    { text: "Zapi.", start: 1.0, end: 1.4, p: 0.4 },
    { text: "tudo", start: 2.0, end: 2.3, p: 0.9 },
    { text: "bem?", start: 2.4, end: 2.8, p: 0.9 },
    { text: "A", start: 4.6, end: 4.8, p: 0.9 },
    { text: "de", start: 5.0, end: 5.2, p: 0.6 },
    { text: "binha", start: 5.2, end: 5.6, p: 0.6 },
    { text: "chegou.", start: 5.7, end: 6.1, p: 0.9 },
  ],
};
const TERMS = ["Zappy", "Debinha"];

const project = (wordEdits: WordEdit[] | undefined, speed?: number): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [
    {
      id: "voz",
      name: "voz.wav",
      path: "voz.wav",
      kind: "audio",
      duration: 10,
      width: 0,
      height: 0,
      fps: 0,
      hasVideo: false,
      hasAudio: true,
      size: 1,
      proxyStatus: "none",
      transcript: "t.json",
      transcriptStatus: "ready",
      ...(wordEdits ? { wordEdits } : {}),
    },
  ],
  tracks: [{ id: "a1", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false }],
  clips: [
    {
      id: "c1",
      assetId: "voz",
      trackId: "a1",
      start: 0,
      in: 0,
      duration: speed ? 10 / speed : 10,
      volume: 1,
      ...(speed ? { speed } : {}),
    },
  ],
});

const read = (p: Project, tr: Transcript = heard): TimelineWord[] =>
  timelineWords(p, new Map([["voz", transcriptView(tr, p.assets[0].wordEdits, TERMS)]]));
const say = (words: { text: string }[]): string => words.map((w) => w.text).join(" ");
const view = (edits: WordEdit[] | undefined, tr: Transcript = heard): Word[] =>
  transcriptView(tr, edits, TERMS).words;
const shown = (words: Word[], text: string): Word => {
  const w = words.find((x) => x.text.startsWith(text));
  assert.ok(w, `"${text}" is shown`);
  return w;
};

const EDITS: WordEdit[] = [
  { i: 2, text: "Tudo", was: "tudo", at: 2 },
  { i: 3, del: true, was: "bem?", at: 2.4 },
];

test("hand corrections and the glossary are applied where the words are read", () => {
  const words = read(project(EDITS));
  assert.equal(say(words), "Olá, Zappy. Tudo A Debinha chegou.");
  assert.deepEqual(
    words.map((w) => w.key),
    ["voz:0", "voz:1", "voz:2", "voz:4", "voz:5", "voz:7"],
    "keys keep the recognized index, so later corrections (and AI proposals) find their word",
  );
  const debinha = words.find((w) => w.text === "Debinha");
  assert.deepEqual([debinha?.start, debinha?.end], [5, 5.6], "the joined name spans both parts");
});

test("corrections follow cuts, splits and a clip played at another speed", () => {
  const p = project(EDITS);
  const targets = cutTargets(p);
  const cut = { ...p, clips: applyCuts(p.clips, [[0.95, 1.5]], targets) };
  const afterCut = read(cut);
  assert.equal(say(afterCut), "Olá, Tudo A Debinha chegou.");
  assert.equal(afterCut.find((w) => w.text === "Tudo")?.start, 2 - 0.55);

  const at = cut.clips.find((c) => c.start < 3 && clipEnd(c) > 3);
  assert.ok(at);
  const pieces = splitClip(at, 3);
  assert.ok(pieces);
  const [left, right] = pieces;
  const split = { ...cut, clips: [...cut.clips.filter((c) => c !== at), left, right] };
  const afterSplit = read(split);
  assert.equal(say(afterSplit), "Olá, Tudo A Debinha chegou.");
  assert.deepEqual(
    afterSplit.slice(1).map((w) => w.clipId),
    [left.id, right.id, right.id, right.id],
  );

  // At double speed, a new start in the media's seconds lands at half the time on the timeline.
  const timed = withShownEdit(EDITS, heard.words, shown(view(EDITS), "Tudo"), { start: 2.1 });
  const fast = read(project(timed, 2));
  assert.equal(fast.find((w) => w.text === "Tudo")?.start, 1.05);
  assert.deepEqual(nudged(shown(view(EDITS), "Tudo"), "start", 0.05 * 2), { start: 2.1 });
  assert.equal(
    nudged(shown(view(EDITS), "Tudo"), "end", -0.3),
    null,
    "the end stays after the start",
  );
});

test("a transcript made again gets each correction on the same word nearby", () => {
  const again: Transcript = {
    ...heard,
    words: [{ text: "Bom", start: 0.1, end: 0.3, p: 0.9 }, ...heard.words].map((w, k) =>
      k === 3 ? { ...w, start: 2.05 } : w,
    ),
  };
  const edits: WordEdit[] = [...EDITS, { i: 7, text: "Fim", was: "acabou", at: 6 }];
  const tr = transcriptView(again, edits, TERMS);
  assert.equal(say(tr.words), "Bom Olá, Zappy. Tudo A Debinha chegou.");
  assert.equal(tr.lostEdits, 1, "a correction with no word nearby is counted, not guessed");
  const legacy = applyWordEdits(again.words, [{ i: 2, text: "Tudo", was: "tudo" }]);
  assert.equal(legacy.lost, 1, "without its start an old correction cannot move");
});

test("new times are kept in source seconds and words stay in order", () => {
  const { words, edited } = applyWordEdits(heard.words, [{ i: 1, start: 1.1, end: 1.3 }]);
  assert.deepEqual([words[1].start, words[1].end], [1.1, 1.3]);
  assert.deepEqual([...edited], [1]);
  const moved = applyWordEdits(heard.words, [{ i: 0, start: 3, end: 3.2 }]).words;
  assert.deepEqual(
    moved.slice(0, 4).map((w) => w.i),
    [1, 2, 3, 0],
  );
});

test("editing a word the glossary corrected keeps the correction", () => {
  const before = view(undefined);
  const zappy = shown(before, "Zappy");
  // Moving its start keeps "Zappy" instead of falling back to "Zapi".
  const moved = withShownEdit(undefined, heard.words, zappy, nudged(zappy, "start", 0.05) ?? {});
  assert.equal(shown(view(moved), "Zappy").start, 1.05);

  // A joined word moves, changes and goes as a whole: "binha" never comes back alone.
  const debinha = shown(before, "Debinha");
  const longer = withShownEdit(undefined, heard.words, debinha, { end: 5.65 });
  assert.equal(say(view(longer)), "Olá, Zappy. tudo bem? A Debinha chegou.");
  assert.equal(shown(view(longer), "Debinha").end, 5.65);
  const typed = withShownEdit(undefined, heard.words, debinha, { text: "Debinha!" });
  assert.equal(say(view(typed)), "Olá, Zappy. tudo bem? A Debinha! chegou.");
  const gone = withShownEdit(undefined, heard.words, debinha, { del: true });
  assert.equal(say(view(gone)), "Olá, Zappy. tudo bem? A chegou.");
  assert.deepEqual(
    removedWords(heard.words, gone).map((w) => w.text),
    ["de", "binha"],
  );
  assert.equal(say(view(withRestored(gone, heard.words, 5))), "Olá, Zappy. tudo bem? A de chegou.");

  // Changing nothing changes nothing.
  assert.equal(withShownEdit(EDITS, heard.words, zappy, { text: "Zappy." }), EDITS);
});

test("typing what was said undoes a wrong glossary correction", () => {
  const zappy = shown(view(undefined), "Zappy");
  const edits = withShownEdit(undefined, heard.words, zappy, { text: "Zapi." });
  assert.deepEqual(edits, [{ i: 1, was: "Zapi.", at: 1, keep: true }]);
  assert.equal(say(view(edits)), "Olá, Zapi. tudo bem? A Debinha chegou.");
});

test("all occurrences: same letters and accents, joined words as a whole", () => {
  const twice: Transcript = {
    ...heard,
    words: [
      { text: "Está", start: 0, end: 0.3, p: 0.9 },
      { text: "esta", start: 0.4, end: 0.7, p: 0.9 },
      { text: "de", start: 1, end: 1.2, p: 0.6 },
      { text: "binha", start: 1.2, end: 1.5, p: 0.6 },
      { text: "e", start: 2, end: 2.1, p: 0.9 },
      { text: "de", start: 3, end: 3.2, p: 0.6 },
      { text: "binha.", start: 3.2, end: 3.5, p: 0.6 },
    ],
  };
  const words = view(undefined, twice);
  assert.equal(wordsLike(words, "está,").length, 1, '"esta" is another word');
  const accent = withEditEverywhere(undefined, twice.words, words, "está", "estará");
  assert.equal(say(view(accent, twice)), "estará esta Debinha e Debinha.");
  const both = withEditEverywhere(undefined, twice.words, words, "Debinha", "DEBINHA");
  assert.equal(say(view(both, twice)), "Está esta DEBINHA e DEBINHA.");
});

test("words set aside as hallucinations are hidden, listed and can come back", () => {
  const withNoise: Transcript = {
    ...heard,
    words: [...heard.words, { text: "Amara.org", start: 8, end: 8.4, p: 0.9, dropped: "credit" }],
  };
  assert.equal(say(view(undefined, withNoise)), "Olá, Zappy. tudo bem? A Debinha chegou.");
  assert.deepEqual(
    removedWords(withNoise.words, undefined).map((w) => [w.text, w.removed]),
    [["Amara.org", "dropped"]],
  );
  const back = withRestored(undefined, withNoise.words, 8);
  assert.equal(say(view(back, withNoise)), "Olá, Zappy. tudo bem? A Debinha chegou. Amara.org");
});

test("a backslash in a caption stays a backslash for libass", () => {
  assert.equal(escapeAss("C:\\Nova {pasta}"), "C:\\\u2060Nova pasta");
});

/* ----- Captions: forced breaks and per-cue looks ----- */

const said = (text: string): TimelineWord[] =>
  text.split(/\s+/).map((t, i) => ({
    key: `voz:${i}`,
    clipId: "c1",
    text: t,
    start: i * 0.4,
    end: i * 0.4 + 0.3,
    p: 0.9,
  }));

test("a forced break starts a caption and its own look reaches the ASS", () => {
  const words = said("olha só que legal agora vamos programar");
  assert.equal(buildCues(words, 42).length, 1);
  const cues = buildCues(words, 42, 2, {
    breaks: ["voz:4"],
    styles: [{ key: "voz:4", position: "top", size: 7, color: "#FF0000" }],
  });
  assert.equal(cues.length, 2);
  assert.equal(cues[1].key, "voz:4");
  assert.equal(cues[1].lines[0][0].text, "agora", "mid-sentence, a forced caption stays lowercase");
  assert.deepEqual(cues[1].style, { position: "top", size: 7, color: "#FF0000" });

  const ass = buildAss(cues, DEFAULT_CAPTION_STYLE, 1920, 1080).split("\n");
  const [first, second] = ass.filter((l) => l.startsWith("Dialogue: 0,"));
  assert.match(first, /,Cap,,0,0,0,,\{\\k/, "the other captions keep the project look");
  assert.match(
    second,
    /,Cap,,0,0,76,,\{\\an8\\fs76\\bord7\\2c&H0000FF&\}\{\\k/,
    "top, larger and red words still to come (karaoke)",
  );

  const box = buildAss(cues, { ...DEFAULT_CAPTION_STYLE, look: "box" }, 1920, 1080);
  assert.match(box, /\{\\an8\\fs76\\bord23\\1c&H0000FF&\}agora/, "box: text color and padding");
});
