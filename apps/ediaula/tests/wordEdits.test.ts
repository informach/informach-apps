import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAss, buildCues, DEFAULT_CAPTION_STYLE } from "../src/shared/captions.ts";
import { applyCuts, cutTargets, type TimelineWord, timelineWords } from "../src/shared/cleanup.ts";
import { clipEnd, splitClip } from "../src/shared/timeline.ts";
import type { Project, Transcript } from "../src/shared/types.ts";
import {
  applyWordEdits,
  transcriptView,
  withEditEverywhere,
  withWordEdit,
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

const project = (wordEdits: Project["assets"][number]["wordEdits"]): Project => ({
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
  clips: [{ id: "c1", assetId: "voz", trackId: "a1", start: 0, in: 0, duration: 10, volume: 1 }],
});

const read = (p: Project): TimelineWord[] =>
  timelineWords(p, new Map([["voz", transcriptView(heard, p.assets[0].wordEdits, TERMS)]]));
const say = (words: TimelineWord[]): string => words.map((w) => w.text).join(" ");

const EDITS = [
  { i: 2, text: "Tudo", was: "tudo" },
  { i: 3, del: true, was: "bem?" },
];

test("hand corrections and the glossary are applied where the words are read", () => {
  const words = read(project(EDITS));
  assert.equal(say(words), "Olá, Zappy. Tudo A Debinha chegou.");
  assert.deepEqual(
    words.map((w) => w.key),
    ["voz:0", "voz:1", "voz:2", "voz:4", "voz:5", "voz:7"],
    "keys keep the recognized index, so later corrections still find their word",
  );
  const debinha = words.find((w) => w.text === "Debinha");
  assert.deepEqual([debinha?.start, debinha?.end], [5, 5.6], "the joined name spans both parts");
});

test("corrections follow cuts and splits", () => {
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
});

test("a correction made on another transcript of the media is not applied", () => {
  const again = {
    ...heard,
    words: heard.words.map((w, i) => (i === 2 ? { ...w, text: "todo" } : w)),
  };
  const { words } = applyWordEdits(again.words, [{ i: 2, text: "Tudo", was: "tudo" }]);
  assert.equal(words[2].text, "todo");
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

test("editing merges into earlier corrections and drops the ones that change nothing", () => {
  let edits = withWordEdit(undefined, heard.words, 1, { text: "Zappy." });
  edits = withWordEdit(edits, heard.words, 1, { start: 1.05 });
  assert.deepEqual(edits, [{ i: 1, was: "Zapi.", text: "Zappy.", start: 1.05 }]);
  edits = withWordEdit(edits, heard.words, 1, { text: "Zapi.", start: 1 });
  assert.deepEqual(edits, [], "back to what whisper heard: nothing to keep");

  const everywhere = withEditEverywhere(
    undefined,
    heard.words,
    applyWordEdits(heard.words, undefined).words,
    "TUDO",
    "Tudo",
  );
  assert.deepEqual(everywhere, [{ i: 2, was: "tudo", text: "Tudo" }]);
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
