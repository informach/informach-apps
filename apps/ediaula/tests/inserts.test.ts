import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEFAULT_KEY } from "../src/shared/chroma.ts";
import { cutTargets, timelineWords } from "../src/shared/cleanup.ts";
import {
  findLine,
  INSERT_PAD,
  layoutInserts,
  lockedAfter,
  planInserts,
  voiceOverlaps,
} from "../src/shared/inserts.ts";
import { parseScript, type SpeechItem, speechItems } from "../src/shared/script.ts";
import { alignSection } from "../src/shared/scriptAlign.ts";
import { clipEnd } from "../src/shared/timeline.ts";
import type { Asset, Project, Transcript, Word } from "../src/shared/types.ts";

const doc = parseScript(
  readFileSync(new URL("./fixtures/roteiro-farol-dia1.md", import.meta.url), "utf8"),
);
/** Seção 4, "Faça o personagem andar": three Debinha lines between the teacher's. */
const s4 = doc.sections[3];
const items = speechItems(s4);
const avatarLines = items.filter((i) => i.avatar);

/** Words of a text said from `from`, 0.3 s each and 0.1 s apart. */
function say(text: string, from: number): Word[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((t, i) => ({ text: t, start: from + i * 0.4, end: from + i * 0.4 + 0.3, p: 0.9 }));
}

function transcript(words: Word[], duration: number): Transcript {
  const silences: [number, number][] = [];
  let at = 0;
  for (const w of words) {
    if (w.start - at >= 0.3) silences.push([at, w.start]);
    at = w.end;
  }
  if (duration - at >= 0.3) silences.push([at, duration]);
  return { version: 1, model: "m", language: "pt", duration, words, silences };
}

/**
 * The teacher's narration of the section: 0.8 s between paragraphs (too short for an avatar
 * line), except a long pause after "automáticos no celular" where F1P4-D01 fits as it is.
 * `aside` is said 2 s into that pause.
 */
function narration(aside?: string): { words: Word[]; end: number } {
  const words: Word[] = [];
  let at = 0;
  items.forEach((item, k) => {
    if (item.avatar) return;
    words.push(...say(item.text, at));
    at = words[words.length - 1].end + (items[k + 1]?.insertId === "F1P4-D01" ? 6 : 0.8);
    if (aside && items[k + 1]?.insertId === "F1P4-D01")
      words.push(...say(aside, words[words.length - 1].end + 2));
  });
  return { words, end: at };
}

/** The presenter's render with the three Debinha lines, 6 s apart. */
const render = (): Transcript => {
  const words = avatarLines.flatMap((item, k) => say(item.text, 1 + k * 6));
  return transcript(words, 20);
};

const asset = (id: string, kind: Asset["kind"], extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `${id}.${kind === "audio" ? "wav" : "mp4"}`,
  kind,
  duration: 600,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: kind !== "audio",
  hasAudio: kind === "audio",
  size: 1,
  proxyStatus: "none",
  ...extra,
});

function lesson(aside?: string): { project: Project; transcripts: Map<string, Transcript> } {
  const { words, end } = narration(aside);
  const project: Project = {
    version: 1,
    id: "p",
    name: "aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      asset("tela", "video"),
      asset("voz", "audio", { transcript: "voz.json", transcriptStatus: "ready" }),
      asset("deb", "video", {
        hasAudio: true,
        width: 1080,
        height: 1920,
        screen: "#0047bb",
        key: { color: "#0047bb", ...DEFAULT_KEY },
        transcript: "deb.json",
        transcriptStatus: "ready",
      }),
    ],
    tracks: [
      { id: "v1", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
      { id: "a1", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
    ],
    clips: [
      { id: "cv", assetId: "tela", trackId: "v1", start: 0, in: 0, duration: end, volume: 1 },
      { id: "ca", assetId: "voz", trackId: "a1", start: 0, in: 0, duration: end, volume: 1 },
    ],
  };
  const transcripts = new Map([
    ["voz", transcript(words, end)],
    ["deb", render()],
  ]);
  return { project, transcripts };
}

/** `value`, failing the test when it is missing. */
function must<T>(value: T | null | undefined, what: string): T {
  assert.ok(value !== null && value !== undefined, what);
  return value;
}

/** Where a script line is found in the transcripts (it has to be). */
const source = (text: string, transcripts: Map<string, Transcript>) =>
  must(findLine(text, transcripts), `"${text}" found`);

/** The avatar lines found in the render and planned on one alignment of the narration. */
function plan(project: Project, transcripts: Map<string, Transcript>, lines: SpeechItem[]) {
  const alignment = alignSection(s4, timelineWords(project, transcripts));
  const found = lines.map((item) => ({ item, src: source(item.text, transcripts) }));
  assert.ok(
    found.every((f) => f.src.assetId === "deb"),
    "every line is found in the render",
  );
  return planInserts(s4, alignment, found);
}

test("all avatar lines are placed at once, latest first, each between its two lines", () => {
  const { project, transcripts } = lesson();
  const { entries, errors } = plan(project, transcripts, avatarLines);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    entries.map((e) => [e.item.insertId, e.plan.gap > 0]),
    [
      ["F1P4-R01", true],
      ["F1P4-D01", false],
      ["F1P4-R02", true],
    ],
    "the short pauses are widened, the long one is used as it is",
  );
  const layout = layoutInserts(project, entries, cutTargets(project), new Set());
  assert.equal(layout.placed.length, 3);
  const after: Project = { ...project, tracks: layout.tracks, clips: layout.clips };
  const words = timelineWords(after, transcripts);
  const teacher = words.filter((w) => w.role === "teacher");
  const avatar = words.filter((w) => w.role === "avatar");
  assert.equal(
    avatar.length,
    avatarLines.reduce((n, i) => n + i.text.split(/\s+/).length, 0),
  );
  for (const { entry, clip } of layout.placed) {
    // Nobody talks while the avatar does, and it comes right after the line before it.
    const from = clip.start + INSERT_PAD;
    const to = clipEnd(clip) - INSERT_PAD;
    const under = teacher.filter((w) => w.end > from + 0.02 && w.start < to - 0.02);
    assert.deepEqual(
      under.map((w) => [w.text, w.start, w.end]),
      [],
      `${entry.item.insertId} at ${clip.start}-${clipEnd(clip)} over the narration`,
    );
    const before = teacher.filter((w) => w.end <= clip.start + 1e-6).pop();
    assert.ok(
      before && clip.start - before.end < 0.2,
      `${entry.item.insertId} after the line before`,
    );
  }
  // The screen and the voice were opened at the same points: they stay in sync piece by piece.
  const pieces = (track: string) =>
    after.clips
      .filter((c) => c.trackId === track)
      .sort((a, b) => a.start - b.start)
      .map((c) => [c.start, c.in, c.duration].map((v) => v.toFixed(6)).join("/"));
  assert.deepEqual(pieces("v1"), pieces("a1"));
  // One new track on top holds the three, beside the content.
  const tracks = new Set(layout.placed.map((p) => p.clip.trackId));
  assert.equal(tracks.size, 1);
  assert.equal(after.tracks[0].id, [...tracks][0]);
  assert.ok(layout.placed.every((p) => p.clip.transform && p.clip.transform.x > 0.5));
});

test("a locked track: the lines that would open the timeline are refused, the others placed", () => {
  const { project, transcripts } = lesson();
  project.tracks.push({
    id: "a9",
    kind: "audio",
    name: "Trilha",
    muted: false,
    hidden: false,
    locked: true,
  });
  project.assets.push(asset("mus", "audio"));
  const end = project.clips[0].duration;
  project.clips.push({
    id: "cm",
    assetId: "mus",
    trackId: "a9",
    start: 0,
    in: 0,
    duration: end,
    volume: 0.3,
  });
  const locked = new Set(["a9"]);
  const { entries } = plan(project, transcripts, avatarLines);
  const free = entries.filter((e) => !lockedAfter(project.clips, e.plan, locked).length);
  assert.deepEqual(
    free.map((e) => e.item.insertId),
    ["F1P4-D01"],
    "only the line that fits in the recorded pause",
  );
  const targets = new Set([...cutTargets(project)].filter((id) => !locked.has(id)));
  const layout = layoutInserts(project, free, targets, locked);
  assert.deepEqual(
    layout.clips.find((c) => c.id === "cm"),
    project.clips.find((c) => c.id === "cm"),
    "the locked clip is untouched",
  );
  assert.equal(
    layout.clips.filter((c) => c.trackId === "v1").length,
    1,
    "nothing was opened or split",
  );
});

test("a short avatar line is not taken for words of the narration", () => {
  const { project, transcripts } = lesson();
  const words = timelineWords(project, transcripts);
  // "Foi! Agora ele anda!": the narration says "Agora" and "anda" around it, far apart.
  const r02 = s4.items.indexOf(avatarLines[2]);
  const before = must(
    alignSection(s4, words).lines.find((l) => l.item === r02),
    "the line",
  );
  assert.ok(before.matched / before.total < 0.6, "not on the timeline yet: it can be placed");
  // Once placed, the line is where the avatar says it, not spread over the teacher's words.
  const { entries } = plan(project, transcripts, avatarLines);
  const layout = layoutInserts(project, entries, cutTargets(project), new Set());
  const after: Project = { ...project, tracks: layout.tracks, clips: layout.clips };
  const line = must(
    alignSection(s4, timelineWords(after, transcripts)).lines.find((l) => l.item === r02),
    "the line",
  );
  const { clip } = must(
    layout.placed.find((p) => p.entry.item.insertId === "F1P4-R02"),
    "F1P4-R02 placed",
  );
  assert.equal(line.matched, line.total);
  const [from, to] = [must(line.start, "start"), must(line.end, "end")];
  assert.ok(from >= clip.start && to <= clipEnd(clip), "inside the avatar clip");
});

test("an avatar line that would cover another voice comes with a warning", () => {
  const { project, transcripts } = lesson("hum, deixa eu ver aqui");
  const { entries } = plan(project, transcripts, avatarLines);
  const words = timelineWords(project, transcripts);
  const over = voiceOverlaps(words, entries);
  assert.deepEqual(
    over.map((o) => o.entry.item.insertId),
    ["F1P4-D01"],
  );
  assert.equal(over[0].words[0].text, "hum,");
  // Without the aside nothing overlaps.
  const clean = lesson();
  const plain = plan(clean.project, clean.transcripts, avatarLines).entries;
  assert.deepEqual(voiceOverlaps(timelineWords(clean.project, clean.transcripts), plain), []);
});

/** A teacher line, two Debinha lines in a row, then the teacher again, 0.8 s apart. */
function twoInARow() {
  const two = parseScript(
    [
      "## Seção 1. Teste",
      "**Professora:**",
      '> "Agora clique em Rodar e veja o que acontece com o personagem."',
      "**Na tela:** F1P9-D01 e F1P9-D02 entram juntas.",
      "**Debinha (avatar):**",
      '> "Ele andou sozinho até a borda!"',
      "**Debinha (avatar):**",
      '> "E depois ele sumiu da tela inteira!"',
      "**Professora:**",
      '> "Isso mesmo, e o motivo está na regra do movimento."',
    ].join("\n"),
  ).sections[0];
  const [a, d1, d2, b] = speechItems(two);
  const teacher = [...say(a.text, 0)];
  teacher.push(...say(b.text, teacher[teacher.length - 1].end + 0.8));
  const end = teacher[teacher.length - 1].end + 1;
  const { project } = lesson();
  project.clips = project.clips.map((c) => ({ ...c, duration: end }));
  const transcripts = new Map([
    ["voz", transcript(teacher, end)],
    ["deb", transcript([...say(d1.text, 1), ...say(d2.text, 6)], 20)],
  ]);
  return { two, d1, d2, project, transcripts };
}

test("two avatar lines in the same pause are not planned together", () => {
  const { two, d1, d2, project, transcripts } = twoInARow();
  const alignment = alignSection(two, timelineWords(project, transcripts));
  const found = [d1, d2].map((item) => ({ item, src: source(item.text, transcripts) }));
  const { entries, errors } = planInserts(two, alignment, found);
  assert.deepEqual(
    entries.map((e) => e.item.insertId),
    ["F1P9-D01"],
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].error, /mesmo lugar que F1P9-D01/);
});

test("the second avatar line placed later goes after the first, never over it", () => {
  const { two, d1, d2, transcripts } = twoInARow();
  let { project } = twoInARow();
  const placed: { start: number; end: number }[] = [];
  for (const item of [d1, d2]) {
    const words = timelineWords(project, transcripts);
    const { entries, errors } = planInserts(two, alignSection(two, words), [
      { item, src: source(item.text, transcripts) },
    ]);
    assert.deepEqual(errors, []);
    assert.deepEqual(voiceOverlaps(words, entries), [], `${item.insertId} talks over nobody`);
    const layout = layoutInserts(project, entries, cutTargets(project), new Set());
    project = { ...project, tracks: layout.tracks, clips: layout.clips };
    for (const p of layout.placed) placed.push({ start: p.clip.start, end: clipEnd(p.clip) });
  }
  // Where the first one is now (it moved with the gap opened for the second, if before it).
  const first = project.clips.find((c) => c.insertId === "F1P9-D01");
  const second = project.clips.find((c) => c.insertId === "F1P9-D02");
  assert.ok(first && second);
  assert.ok(second.start >= clipEnd(first) - 1e-6, "the clips do not overlap, fades included");
  // And the teacher's next line starts after the second one.
  const after = timelineWords(project, transcripts).filter(
    (w) => w.role === "teacher" && w.start > second.start,
  );
  assert.ok(after.length && after[0].start >= clipEnd(second) - INSERT_PAD - 1e-6);
  assert.equal(placed.length, 2);
});

test("an avatar line planned over another avatar is reported", () => {
  const { two, d1, d2, project, transcripts } = twoInARow();
  const plan = planInserts(two, alignSection(two, timelineWords(project, transcripts)), [
    { item: d2, src: source(d2.text, transcripts) },
  ]).entries;
  assert.equal(plan.length, 1);
  // Meanwhile the first line was put by hand right where the second is planned.
  const first = source(d1.text, transcripts);
  const busy: Project = {
    ...project,
    clips: [
      ...project.clips,
      {
        id: "manual",
        assetId: "deb",
        trackId: "v1",
        start: plan[0].plan.at,
        in: first.start - INSERT_PAD,
        duration: first.end - first.start + 2 * INSERT_PAD,
        volume: 1,
        insertId: d1.insertId,
      },
    ],
  };
  const over = voiceOverlaps(timelineWords(busy, transcripts), plan);
  assert.equal(over.length, 1);
  assert.ok(
    over[0].words.every((w) => w.role === "avatar"),
    "another avatar, not the teacher",
  );
});
