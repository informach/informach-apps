import assert from "node:assert/strict";
import { test } from "node:test";
import type { TimelineWord } from "../src/shared/cleanup.ts";
import { applyCuts } from "../src/shared/cleanup.ts";
import { intervalLines, NARRATION_EDGE, placeNarration } from "../src/shared/guidedNarration.ts";
import { INSERT_PAD, layoutInserts, planInsert, planLineInsert } from "../src/shared/inserts.ts";
import {
  LINE_MISSING,
  LINE_PARTIAL,
  retakeLines,
  retakePlan,
  takeOfLine,
} from "../src/shared/retake.ts";
import { parseScript, speechItems } from "../src/shared/script.ts";
import { alignSection } from "../src/shared/scriptAlign.ts";
import type { Asset, Project, Transcript } from "../src/shared/types.ts";

const SCRIPT = `## Seção 1. O farol
**Professora:**
> "Neste desafio você vai programar o jogo do farol."
>
> "Antes de montar o seu você vai jogar a versão pronta."
>
> "A história começa com um barco perdido no mar escuro."
>
> "Sem a luz do farol o barco não acha o caminho de casa."
**Debinha (avatar):**
> "Eu vou te ajudar a acender o farol!"
**Zappy:**
> "Clique em começar para jogar."
`;

const section = parseScript(SCRIPT).sections[0];
const lines = speechItems(section);
let n = 0;
function said(text: string, start: number, words = Number.POSITIVE_INFINITY): TimelineWord[] {
  return text
    .replace(/[".!]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, words)
    .map((w, i) => ({
      key: `voz:${n++}`,
      clipId: "c",
      text: w,
      start: start + i * 0.4,
      end: start + i * 0.4 + 0.35,
      p: 0.9,
    }));
}

/** Line 1 at 0 s, line 2 missing, line 3 with 6 of its 10 words at 8 s, line 4 at 15 s. */
const words = [...said(lines[0].text, 0), ...said(lines[2].text, 8, 6), ...said(lines[3].text, 15)];
const alignment = alignSection(section, words);
const item = (i: number): number => section.items.indexOf(lines[i]);

test("retakeLines: the teacher's lines missing or partly said, never the presenter's nor the Zappy's", () => {
  const list = retakeLines(section, alignment);
  assert.deepEqual(
    list.map((l) => [l.line, l.state]),
    [
      [1, "missing"],
      [2, "partial"],
    ],
  );
  assert.ok(list[0].share < LINE_MISSING);
  assert.ok(list[1].share >= LINE_MISSING && list[1].share < LINE_PARTIAL);
});

test("planLineInsert places a line between the ones around it; skipped lines are not anchors", () => {
  const prevEnd = alignment.lines.find((l) => l.item === item(0))?.end ?? 0;
  // Line 3 is being recorded again too, so its incomplete take is no anchor: the line after it
  // (15 s) is, and the missing line 2 fits after line 1 without opening the timeline.
  const skipping = planLineInsert(section, alignment, item(1), 6, new Set([item(2)]));
  assert.ok(!("error" in skipping));
  assert.deepEqual([skipping.gap, skipping.at], [0, prevEnd]);
  // An avatar line is planned the same way as before.
  const avatar = lines.find((l) => l.avatar);
  assert.ok(avatar);
  assert.deepEqual(
    planInsert(section, alignment, avatar, 2),
    planLineInsert(section, alignment, section.items.indexOf(avatar), 2),
  );
  assert.ok("error" in planLineInsert(section, alignSection(section, []), item(1), 2));
});

test("a partly said line is replaced in place: the old take goes, the new one starts there", () => {
  const old = alignment.lines.find((l) => l.item === item(2));
  assert.ok(old?.start !== undefined && old.end !== undefined);
  const planned = retakePlan(section, alignment, item(2), 4);
  assert.ok(!("error" in planned));
  assert.deepEqual(planned.replace, [old.start, old.end]);
  assert.equal(planned.plan.at, old.start);
  assert.equal(planned.plan.cut, old.start);
  assert.equal(planned.plan.gap, planned.plan.duration);
  // A missing line is planned between its neighbours, as before.
  const missing = retakePlan(section, alignment, item(1), 2, new Set([item(2)]));
  assert.ok(!("error" in missing) && missing.replace === undefined);

  // Laid out in one go: the old take is cut from every track and the new take sits in its place.
  const project: Project = {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      media("tela", { kind: "video", hasVideo: true, width: 1920, height: 1080, fps: 30 }),
      media("voz"),
      media("nova"),
    ],
    tracks: [
      { id: "v1", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
      { id: "a1", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
    ],
    clips: [
      { id: "s", assetId: "tela", trackId: "v1", start: 0, in: 0, duration: 20, volume: 1 },
      { id: "v", assetId: "voz", trackId: "a1", start: 0, in: 0, duration: 20, volume: 1 },
    ],
  };
  const replace = planned.replace;
  assert.ok(replace);
  const targets = new Set(["v1", "a1"]);
  const cut = { ...project, clips: applyCuts(project.clips, [replace], targets) };
  const layout = layoutInserts(
    cut,
    [{ item: lines[2], src: { assetId: "nova", start: 1, end: 5 }, plan: planned.plan }],
    targets,
    new Set(),
    new Map(),
    "a1",
  );
  const added = layout.placed[0].clip;
  assert.equal(added.start, old.start);
  const voice = layout.clips.filter((c) => c.assetId === "voz").sort((a, b) => a.start - b.start);
  // Nothing of the old take plays any more, and the new take is not cut.
  assert.ok(voice.every((c) => c.in + c.duration <= old.start + 1e-6 || c.in >= old.end - 1e-6));
  assert.ok(Math.abs(voice[1].start - (old.start + added.duration)) < 1e-6);
  assert.equal(added.duration, planned.plan.duration);
});

const media = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/${id}`,
  kind: "audio",
  duration: 60,
  width: 0,
  height: 0,
  fps: 0,
  hasVideo: false,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  ...extra,
});

test("layoutInserts with a voice track: the line goes on it as sound, the timeline opened for it", () => {
  const project: Project = {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      media("tela", { kind: "video", hasVideo: true, width: 1920, height: 1080, fps: 30 }),
      media("voz"),
      media("nova"),
    ],
    tracks: [
      { id: "v1", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
      { id: "a1", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
    ],
    clips: [
      { id: "s", assetId: "tela", trackId: "v1", start: 0, in: 0, duration: 20, volume: 1 },
      { id: "v", assetId: "voz", trackId: "a1", start: 0, in: 0, duration: 20, volume: 1 },
    ],
  };
  const plan = { at: 5, duration: 3, gap: 3, cut: 5 };
  const layout = layoutInserts(
    project,
    [{ item: lines[1], src: { assetId: "nova", start: 2, end: 4.5 }, plan }],
    new Set(["v1", "a1"]),
    new Set(),
    new Map(),
    "a1",
  );
  const placed = layout.placed[0].clip;
  assert.equal(placed.trackId, "a1");
  assert.equal(placed.start, 5);
  assert.equal(placed.in, 2 - INSERT_PAD);
  assert.equal(placed.transform, undefined);
  assert.equal(placed.fadeIn, undefined);
  // The screen and the voice after 5 s moved 3 s to make room.
  const after = layout.clips.filter((c) => c.assetId !== "nova" && c.start >= 5);
  assert.ok(after.length === 2 && after.every((c) => c.start === 8));
  assert.equal(layout.tracks.length, 2, "no new track");
});

test("takeOfLine: the last take of the line not thrown away, cut to its words when transcribed", () => {
  const takes = [
    { line: 0, start: 0, end: 4 },
    { line: 1, start: 4, end: 7, retake: true },
    { line: 1, start: 7, end: 12 },
  ];
  assert.deepEqual(takeOfLine("nova", takes, 1, lines[1].text), {
    assetId: "nova",
    start: 7,
    end: 12,
  });
  assert.equal(takeOfLine("nova", takes, 3, lines[3].text), null);
  // The line said in both takes: only the words of the kept take count.
  const sayAt = (start: number) =>
    said(lines[1].text, start).map((w) => ({ start: w.start, end: w.end, text: w.text, p: 0.9 }));
  const transcript: Transcript = {
    version: 1,
    model: "test",
    language: "pt",
    duration: 12,
    words: [...sayAt(4.2), ...sayAt(7.5)].filter((w) => w.end <= 12),
    silences: [],
  };
  const found = takeOfLine("nova", takes, 1, lines[1].text, transcript);
  assert.ok(found && found.start >= 7.4 && found.start < 7.6, JSON.stringify(found));
});

test("intervalLines: the lines said in the stretch and the missing ones whose place is in it", () => {
  // Line 2 is missing between line 1 (0 s) and line 3 (8 s): it belongs to a stretch from 4 s.
  assert.deepEqual(
    intervalLines(section, alignment, 4, 12).map((l) => l.line),
    [1, 2],
  );
  assert.deepEqual(
    intervalLines(section, alignment, 14, 30).map((l) => l.line),
    [3],
  );
  // Nothing said yet (a silent screen recording): every line the teacher reads.
  assert.deepEqual(
    intervalLines(section, null, 0, 30).map((l) => l.line),
    [0, 1, 2, 3],
  );
});

test("placeNarration: each line where it was said, moved to a nearby step, never over the last", () => {
  const marks = [
    { item: 1, text: "a", mark: 0 },
    { item: 2, text: "b", mark: 3 },
    { item: 3, text: "c", mark: 6.5 },
  ];
  // The stretch starts at 20 s; a click at 23.8 s and another at 40 s.
  const placed = placeNarration({ start: 20, marks, takeLength: 10, anchors: [23.8, 40] });
  assert.deepEqual(
    placed.map((p) => [p.item, Math.round(p.at * 100) / 100, p.snapped]),
    [
      [1, 20, false],
      // Said at 23 s, moved to the click at 23.8 s.
      [2, 23.8, true],
      // Said at 26.5 s, but the line before (and its clip's edges) ends later: it waits for it.
      [3, 27.69, false],
    ],
  );
  assert.deepEqual(placed[1].src, { start: 3, end: 6.5 });
  // Each line's clip, edges included, ends before the next one starts.
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1];
    const prevEnd = prev.at + (prev.src.end - prev.src.start) + NARRATION_EDGE;
    assert.ok(prevEnd <= placed[i].at - NARRATION_EDGE + 1e-9, `${i}`);
  }
  // With the take transcribed, a line is cut to its words.
  const found = placeNarration({
    start: 0,
    marks: marks.slice(0, 1),
    takeLength: 3,
    anchors: [],
    find: () => ({ start: 0.6, end: 2.1 }),
  });
  assert.deepEqual([found[0].src, found[0].at], [{ start: 0.6, end: 2.1 }, 0.6]);
});
