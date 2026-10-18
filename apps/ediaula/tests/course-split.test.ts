import assert from "node:assert/strict";
import { test } from "node:test";
import type { TimelineWord } from "../src/shared/cleanup.ts";
import { rangeProject, sectionProject, splitBySections } from "../src/shared/courseSplit.ts";
import { parseScript } from "../src/shared/script.ts";
import type { Asset, Project } from "../src/shared/types.ts";

const SCRIPT = `# Roteiro
## Seção 1. O farol
### \`F1P1-V01\` · A Chave do Farol
**Professora:**
> "Neste desafio você vai programar o jogo do farol que guia o barco até a costa."
>
> "Primeiro jogue a versão pronta para entender como o barco chega."
## Seção 2. Os blocos
### \`F1P1-V02\` · Blocos de repetição
**Professora:**
> "Agora arraste o bloco repita para dentro do evento quando clicar na bandeira."
>
> "Mude o número de vezes e veja o barco andar mais longe a cada volta."
## Seção 3. O desafio final
**Professora:**
> "Monte sozinho a sequência que acende o farol antes de o barco bater nas pedras."
`;

let n = 0;
/** The words of `text` said from `start`, 0.4 s each. */
function said(text: string, start: number): TimelineWord[] {
  return text
    .replace(/[".]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => ({
      key: `rec:${n++}`,
      clipId: "c",
      text: w,
      start: start + i * 0.4,
      end: start + i * 0.4 + 0.35,
      p: 0.9,
    }));
}

test("splitBySections finds each section in a long recording, borders in the pauses between", () => {
  const doc = parseScript(SCRIPT);
  const lines = doc.sections.map((s) =>
    s.items.flatMap((i) => (i.kind === "speech" ? [i.text] : [])),
  );
  // Section 1 from 2 s, section 2 from 40 s, section 3 from 80 s (with some chatter between).
  const words = [
    ...said(lines[0][0], 2),
    ...said(lines[0][1], 10),
    ...said("pronto vamos para a próxima parte", 25),
    ...said(lines[1][0], 40),
    ...said(lines[1][1], 50),
    ...said(lines[2][0], 80),
  ];
  const ranges = splitBySections(doc, words, { duration: 100 });
  assert.deepEqual(
    ranges.map((r) => r.section),
    [0, 1, 2],
  );
  assert.equal(ranges[0].start, 0);
  assert.equal(ranges.at(-1)?.end, 100);
  // Contiguous: each stretch starts where the one before ends, inside the pause between them.
  for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i].start, ranges[i - 1].end);
  assert.ok(ranges[0].end > 14 && ranges[0].end < 40, `${ranges[0].end}`);
  assert.ok(ranges[1].end > 56 && ranges[1].end < 80, `${ranges[1].end}`);
  assert.match(ranges[1].label, /Seção 2/);
  assert.ok(ranges.every((r) => r.coverage > 0.8));
});

test("a section barely said is not proposed as a lesson", () => {
  const doc = parseScript(SCRIPT);
  const first = doc.sections[0].items.flatMap((i) => (i.kind === "speech" ? [i.text] : []));
  const words = [...said(first[0], 0), ...said(first[1], 8), ...said("o barco", 30)];
  const ranges = splitBySections(doc, words);
  assert.deepEqual(
    ranges.map((r) => r.section),
    [0],
  );
});

const asset = (id: string): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}.mp4`,
  kind: "video",
  duration: 120,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
});

const lesson = (): Project => ({
  version: 1,
  id: "longa",
  name: "Gravação longa",
  course: "Sistema Zero",
  createdAt: 0,
  updatedAt: 5,
  exportedAt: 9,
  settings: { width: 1920, height: 1080, fps: 30 },
  script: { text: SCRIPT, section: 0, confirmed: true },
  publish: { title: "Tudo", chapters: [{ time: 0, title: "a" }], thumbnail: { time: 50 } },
  assets: [asset("tela"), { ...asset("balao"), kind: "image", generated: "annotation" }],
  tracks: [
    { id: "t1", kind: "video", name: "Anotações", muted: false, hidden: false, locked: false },
    { id: "t2", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
  ],
  clips: [
    { id: "a", assetId: "tela", trackId: "t2", start: 0, in: 0, duration: 30, volume: 1 },
    { id: "b", assetId: "tela", trackId: "t2", start: 30, in: 40, duration: 50, volume: 1 },
    {
      id: "k",
      assetId: "tela",
      trackId: "t1",
      start: 35,
      in: 0,
      duration: 10,
      volume: 1,
      keyframes: [
        { t: 0, x: 0.2, y: 0.5, scale: 1 },
        { t: 8, x: 0.8, y: 0.5, scale: 1 },
      ],
    },
    { id: "n", assetId: "balao", trackId: "t1", start: 90, in: 0, duration: 4, volume: 1 },
  ],
  proposals: [],
  reviewedSeams: ["x"],
});

test("rangeProject keeps the stretch, cut at its borders and moved to 0:00", () => {
  const part = rangeProject(lesson(), 20, 60);
  const byId = new Map(part.clips.map((c) => [c.id, c]));
  // "a" is cut at 20 s: 10 s of it, from second 20 of the file.
  const a = part.clips.find((c) => c.in === 20);
  assert.ok(a);
  assert.equal(a.start, 0);
  assert.equal(a.duration, 10);
  // "b" whole start (30 s) is now 10 s; it is cut at 60 s.
  const b = byId.get("b");
  assert.equal(b?.start, 10);
  assert.equal(b?.duration, 30);
  // The moving clip keeps its moments on its own clock.
  assert.equal(byId.get("k")?.start, 15);
  assert.deepEqual(
    byId.get("k")?.keyframes?.map((k) => k.t),
    [0, 8],
  );
  // The annotation at 90 s is outside, and so is its picture.
  assert.equal(byId.has("n"), false);
  assert.ok(!part.assets.some((x) => x.id === "balao"));
  // Times of the whole lesson are left out.
  assert.equal(part.proposals, undefined);
  assert.equal(part.reviewedSeams, undefined);
  assert.equal(part.exportedAt, undefined);
  assert.deepEqual(part.publish, { title: "Tudo" });
});

test("sectionProject is a lesson of its own with the section confirmed and its video id", () => {
  const doc = parseScript(SCRIPT);
  const p = sectionProject(
    lesson(),
    doc,
    { section: 1, label: "Seção 2", start: 30, end: 80, coverage: 1 },
    "Aula 2",
    1000,
  );
  assert.notEqual(p.id, "longa");
  assert.equal(p.name, "Aula 2");
  assert.equal(p.course, "Sistema Zero");
  assert.deepEqual(p.script, { text: SCRIPT, section: 1, confirmed: true });
  assert.deepEqual(p.publish, { videoId: "F1P1-V02", title: "Blocos de repetição" });
  assert.equal(p.createdAt, 1000);
  assert.ok(p.clips.every((c) => c.start >= 0 && c.start + c.duration <= 50 + 1e-6));
});
