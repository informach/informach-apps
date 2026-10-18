import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCues } from "../src/shared/captions.ts";
import type { TimelineWord } from "../src/shared/cleanup.ts";
import {
  CURSOR_MISSING,
  chapterProblems,
  type Finding,
  type FindingKind,
  PREFLIGHT,
  type PreflightContext,
  parseLoudness,
  preflight,
  withoutMissingCursors,
  worstReading,
} from "../src/shared/preflight.ts";
import { parseScript } from "../src/shared/script.ts";
import type { Alignment } from "../src/shared/scriptAlign.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";

const media = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}`,
  kind: "video",
  duration: 60,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
  ...extra,
});

const lesson = (clips: Clip[] = [], extra: Partial<Project> = {}): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [
    media("tela"),
    media("voz", { kind: "audio", hasVideo: false, width: 0, height: 0 }),
    media("musica", { kind: "audio", hasVideo: false, width: 0, height: 0 }),
    media("balao", {
      kind: "image",
      generated: "annotation",
      width: 400,
      height: 200,
      hasAudio: false,
    }),
  ],
  tracks: [
    { id: "t1", kind: "video", name: "Anotações", muted: false, hidden: false, locked: false },
    { id: "t2", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
    { id: "t3", kind: "audio", name: "Voz", muted: false, hidden: false, locked: false },
    {
      id: "t4",
      kind: "audio",
      name: "Música",
      muted: false,
      hidden: false,
      locked: false,
      music: true,
    },
  ],
  clips: [
    { id: "s", assetId: "tela", trackId: "t2", start: 0, in: 0, duration: 30, volume: 1 },
    { id: "v", assetId: "voz", trackId: "t3", start: 0, in: 0, duration: 30, volume: 1 },
    ...clips,
  ],
  ...extra,
});

const kinds = (list: Finding[]): FindingKind[] => list.map((f) => f.kind);
const has = (p: Project, ctx: PreflightContext, kind: FindingKind): Finding | undefined =>
  preflight(p, ctx).find((f) => f.kind === kind);

const speech: [number, number][] = [[0.5, 29.5]];
const word = (text: string, start: number, extra: Partial<TimelineWord> = {}): TimelineWord => ({
  key: `voz:${start}`,
  clipId: "v",
  text,
  start,
  end: start + 0.4,
  p: 1,
  source: "voz",
  role: "teacher",
  ...extra,
});

test("a clean lesson has nothing to say", () => {
  assert.deepEqual(kinds(preflight(lesson(), { speech })), []);
  // No transcript yet: the checks that need speech say nothing, the others still run.
  assert.deepEqual(preflight(lesson(), {}), []);
});

test("silence over 1.5 s at the start or at the end", () => {
  const start = has(lesson(), { speech: [[2.4, 29.5]] }, "silence-start");
  assert.match(start?.message ?? "", /começa com 2,4 s sem som/);
  assert.deepEqual(start?.fix, { label: "Cortar o silêncio", action: "cut", ranges: [[0, 1.9]] });
  assert.ok(!has(lesson(), { speech: [[1.4, 29.5]] }, "silence-start"));
  const end = has(lesson(), { speech: [[0.5, 27]] }, "silence-end");
  assert.match(end?.message ?? "", /termina com 3,0 s sem som/);
  // Music playing to the end is not silence; quiet under an opening card is on purpose.
  const music: Clip = {
    id: "m",
    assetId: "musica",
    trackId: "t4",
    start: 0,
    in: 0,
    duration: 30,
    volume: 0.3,
  };
  assert.ok(!has(lesson([music]), { speech: [[3, 27]] }, "silence-end"));
  const card: Clip = {
    id: "card",
    assetId: "balao",
    trackId: "t1",
    start: 0,
    in: 0,
    duration: 4,
    volume: 1,
    annotation: { kind: "card", text: "Abertura", color: "#121A30" },
  };
  assert.ok(!has(lesson([card]), { speech: [[3, 29.5]] }, "silence-start"));
  // A card shorter than the quiet leaves the rest of it silent.
  assert.ok(has(lesson([{ ...card, duration: 1 }]), { speech: [[3, 29.5]] }, "silence-start"));
});

test("volume: soft, loud or peaking is a warning, unless the export normalizes it", () => {
  const soft = has(lesson(), { speech, loudness: { lufs: -26, peak: -9 } }, "loudness");
  assert.equal(soft?.severity, "warn");
  assert.match(soft?.message ?? "", /baixo: −26,0 LUFS/);
  assert.equal(soft?.fix?.action, "normalize");
  assert.ok(has(lesson(), { speech, loudness: { lufs: -6, peak: -3 } }, "loudness"));
  assert.ok(has(lesson(), { speech, loudness: { lufs: -14, peak: -0.2 } }, "peak"));
  assert.ok(!has(lesson(), { speech, loudness: { lufs: -14, peak: -2 } }, "loudness"));
  assert.ok(!has(lesson(), { speech, loudness: { lufs: -14, peak: -2 } }, "peak"));
  const normalized = has(
    lesson(),
    { speech, normalize: true, loudness: { lufs: -26, peak: 0 } },
    "loudness",
  );
  assert.equal(normalized?.severity, "info");
  assert.ok(!has(lesson(), { speech, normalize: true, loudness: { lufs: -26, peak: 0 } }, "peak"));
});

test("the ebur128 summary is read, silence included", () => {
  const out = `[Parsed_ebur128_0 @ 0] Summary:\n\n  Integrated loudness:\n    I:         -21.8 LUFS\n    Threshold: -31.8 LUFS\n\n  Loudness range:\n    LRA:        20.0 LU\n\n  True peak:\n    Peak:      -18.1 dBFS`;
  assert.deepEqual(parseLoudness(out), { lufs: -21.8, peak: -18.1 });
  assert.deepEqual(parseLoudness(out.replace("-18.1", "-inf")), {
    lufs: -21.8,
    peak: Number.NEGATIVE_INFINITY,
  });
  assert.equal(parseLoudness("nada"), null);
});

const SCRIPT = `# Roteiro

## Seção 1: O farol

**Duração:** 40 a 60 segundos

**Professora:**
> Vamos jogar a versão pronta.

**Professora:**
> Agora é a sua vez de testar o jogo.

**Zappy na página (não gravar):** Clique no botão verde para começar a missão.
`;
const section = parseScript(SCRIPT).sections[0];
const at = (text: string): number =>
  section.items.findIndex((it) => it.kind === "speech" && it.text.startsWith(text));
const aligned = (second: number): Alignment => ({
  lines: [
    { item: at("Vamos"), matched: 5, total: 5, start: 1, end: 3 },
    { item: at("Agora"), matched: second, total: 8, start: 5, end: 8 },
  ],
  offScript: [],
  substitutions: [],
  coverage: 1,
  content: 1,
  spoken: 12,
  unaligned: 0,
});
const said = [word("Vamos", 1), word("jogar", 1.5)];

test("duration outside the script's target", () => {
  const d = has(lesson(), { speech, section }, "duration");
  assert.match(d?.message ?? "", /A aula tem 0:30; o roteiro pede 40 a 60 segundos/);
  const long = lesson([], {
    clips: [
      { id: "s", assetId: "tela", trackId: "t2", start: 0, in: 0, duration: 50, volume: 1 },
      { id: "v", assetId: "voz", trackId: "t3", start: 0, in: 0, duration: 50, volume: 1 },
    ],
  });
  assert.ok(!has(long, { speech: [[0.5, 49.5]], section }, "duration"));
});

test("script lines not recorded, or recorded halfway", () => {
  const missing = has(
    lesson(),
    { speech, section, alignment: aligned(1), words: said },
    "line-missing",
  );
  assert.match(missing?.message ?? "", /fala 2 do roteiro \(Professora\) não está na aula/);
  const partial = has(
    lesson(),
    { speech, section, alignment: aligned(5), words: said },
    "line-partial",
  );
  assert.match(partial?.message ?? "", /pela metade \(63% das palavras\)/);
  const ctx = { speech, section, alignment: aligned(8), words: said };
  assert.ok(!has(lesson(), ctx, "line-missing"));
  assert.ok(!has(lesson(), ctx, "line-partial"));
});

test("the Zappy bridge spoken in the video is an error with a proposal to cut it", () => {
  const bridge = "clique no botão verde para começar"
    .split(" ")
    .map((w, i) => word(w, 10 + i * 0.5));
  const f = has(
    lesson(),
    { speech, section, alignment: aligned(8), words: [...said, ...bridge] },
    "bridge-spoken",
  );
  assert.equal(f?.severity, "error");
  assert.equal(f?.at, 10);
  assert.equal(f?.fix?.action, "propose-cut");
  // Two words of it said in passing are not the bridge.
  const passing = [word("botão", 10), word("verde", 10.5)];
  assert.ok(
    !has(lesson(), { speech, section, alignment: aligned(8), words: passing }, "bridge-spoken"),
  );
  // Four words of it in order (less than 60% of it): only a note to check, with no cut.
  const some = "clique no botão verde".split(" ").map((w, i) => word(w, 10 + i * 0.5));
  const note = has(
    lesson(),
    { speech, section, alignment: aligned(8), words: [...said, ...some] },
    "bridge-spoken",
  );
  assert.equal(note?.severity, "info");
  assert.equal(note?.fix, undefined);
  assert.equal(PREFLIGHT.bridgeWords, 6);
});

test("two voices at once for more than 0.3 s", () => {
  const teacher = [word("eu", 4), word("falo", 4.4), word("aqui", 4.8)];
  const avatar = [
    word("e", 4.6, { source: "avatar", role: "avatar" }),
    word("eu", 5, { source: "avatar", role: "avatar" }),
  ];
  const f = has(lesson(), { speech, words: [...teacher, ...avatar] }, "voices-overlap");
  assert.match(f?.message ?? "", /Duas vozes ao mesmo tempo por 0,6 s em 0:04/);
  const short = [word("oi", 5.1, { source: "avatar", role: "avatar" })];
  assert.ok(
    !has(
      lesson(),
      { speech, words: [word("eu", 4), word("falo", 4.4), ...short] },
      "voices-overlap",
    ),
  );
  // The computer's own sound and a voice that is not heard are not voices over the teacher.
  const other = [
    word("vídeo", 4.5, { source: "pc", role: "other" }),
    word("mudo", 4.6, { source: "x", silent: true }),
  ];
  assert.ok(!has(lesson(), { speech, words: [...teacher, ...other] }, "voices-overlap"));
});

const burned = { look: "karaoke" as const, position: "bottom" as const, size: 5.2, burn: true };
const cueWords = (text: string, start: number, per: number): TimelineWord[] =>
  text.split(" ").map((w, i) => word(w, start + i * per, { key: `voz:${start}:${i}` }));

test("captions out of the 90% safe area, smaller than 5% or too fast to read", () => {
  const long = "palavrasmuitolongas ".repeat(2).trim();
  const wide = buildCues(cueWords(`${long} ${long}`, 1, 0.5), 200, 1);
  const big = lesson([], { captions: { ...burned, size: 9 } });
  const safe = has(big, { speech, cues: wide }, "caption-safe");
  assert.match(safe?.message ?? "", /área segura de 90%/);
  assert.ok(
    !has(
      lesson([], { captions: burned }),
      { speech, cues: buildCues(cueWords("oi tudo bem", 1, 0.5)) },
      "caption-safe",
    ),
  );
  // Not burned into the picture: its size and place do not matter.
  assert.ok(
    !has(
      lesson([], { captions: { ...burned, burn: false, size: 9 } }),
      { speech, cues: wide },
      "caption-safe",
    ),
  );
  const small = has(lesson([], { captions: { ...burned, size: 4 } }), { speech }, "caption-small");
  assert.deepEqual(small?.fix, { label: "Aumentar para 5%", action: "caption-size", size: 5.2 });
  assert.ok(!has(lesson([], { captions: burned }), { speech }, "caption-small"));
});

/** `n` words of `text` (repeated) said every `per` seconds from second 1. */
const spoken = (text: string, n: number, per: number): TimelineWord[] => {
  const list = text.split(" ");
  return Array.from({ length: n }, (_, i) =>
    word(list[i % list.length], 1 + i * per, { key: `voz:${i}` }),
  );
};

test("captions too fast to read: a whole 10 s stretch over 17 characters per second", () => {
  const fast = buildCues(spoken("programação computacional", 60, 0.2));
  const withBurned = lesson([], { captions: burned });
  const f = has(withBurned, { speech, cues: fast }, "caption-fast");
  assert.equal(f?.severity, "warn");
  assert.match(f?.message ?? "", /Entre 0:01 e 0:11 a legenda pede \d+ caracteres por segundo/);
  assert.match(f?.message ?? "", /9 a 14 anos/);
  assert.ok(!/Corte palavras/.test(f?.message ?? ""));
  // Captions nobody reads (not burned, no .srt) are not checked; the .srt alone is.
  assert.ok(!has(lesson(), { speech, cues: fast }, "caption-fast"));
  assert.ok(has(lesson(), { speech, cues: fast, srt: true }, "caption-fast"));
  // One fast line in a calm stretch is not a fast stretch.
  const burst = buildCues([
    ...spoken("vamos aprender programação com blocos hoje", 6, 0.1),
    ...spoken("e agora vamos testar", 4, 2).map((w) => ({
      ...w,
      key: `${w.key}b`,
      start: w.start + 2,
      end: w.end + 2,
    })),
  ]);
  assert.ok(!has(withBurned, { speech, cues: burst }, "caption-fast"));
});

test("speech at a normal rate (155 words a minute) reads well", () => {
  const phrase =
    "vamos jogar o jogo pronto e depois criar uma fase nova com blocos para o farol acender";
  const words = spoken(phrase, 80, 60 / 155);
  const cues = buildCues(words);
  const reading = worstReading(cues);
  assert.ok(reading);
  assert.ok(reading.cps <= PREFLIGHT.captionCps, `${reading.cps} cps`);
  assert.ok(!has(lesson([], { captions: burned }), { speech, cues }, "caption-fast"));
});

test("annotation letters under 3.3% of the frame height, with the size that fixes them", () => {
  const balloon = (scale: number, fontSize?: number): Clip => ({
    id: "b",
    assetId: "balao",
    trackId: "t1",
    start: 5,
    in: 0,
    duration: 3,
    volume: 1,
    annotation: {
      kind: "balloon",
      text: "Olha aqui!",
      color: "#12140A",
      ...(fontSize ? { fontSize } : {}),
    },
    // Natural size: the picture is drawn at 2 pixels per frame pixel.
    transform: {
      x: 0.5,
      y: 0.5,
      scale: scale / (2 * Math.min(1920 / 400, 1080 / 200)),
      opacity: 1,
    },
  });
  // The default letters (36 px in 1080p) are big enough.
  assert.ok(!has(lesson([balloon(1)]), { speech }, "annotation-small"));
  const small = has(lesson([balloon(1, 32)]), { speech }, "annotation-small");
  assert.equal(small?.severity, "warn");
  assert.match(small?.message ?? "", /3,0% da altura; o mínimo é 3,3%/);
  assert.deepEqual(small?.fix, {
    label: "Aumentar a letra",
    action: "annotation-size",
    clipId: "b",
    fontSize: 36,
  });
  // Much smaller is a problem.
  assert.equal(has(lesson([balloon(1, 26)]), { speech }, "annotation-small")?.severity, "error");
  assert.ok(!has(lesson([balloon(1, 36)]), { speech }, "annotation-small"));
  // Made bigger on screen, the same letters are big enough.
  assert.ok(!has(lesson([balloon(1.3, 32)]), { speech }, "annotation-small"));
  // Measured at rest: a movement passing through a smaller size on its way does not count.
  const moving: Clip = {
    ...balloon(1),
    keyframes: [
      { t: 0, x: 0.5, y: 0.5, scale: 0.05 },
      { t: 1, x: 0.5, y: 0.5, scale: 0.2 },
    ],
  };
  assert.ok(!has(lesson([moving]), { speech }, "annotation-small"));
});

test("missing media and missing cursor data", () => {
  const p = lesson();
  const gone = {
    ...p,
    assets: p.assets.map((a) => (a.id === "tela" ? { ...a, missing: true } : a)),
  };
  const f = has(gone, { speech }, "media-missing");
  assert.equal(f?.severity, "error");
  assert.equal(f?.fix?.action, "relink");
  const cursor = {
    ...p,
    assets: p.assets.map((a) => (a.id === "tela" ? { ...a, cursor: "x", cursorMissing: true } : a)),
  };
  const noCursor = has(cursor, { speech }, "cursor-missing");
  // A warning: the person may export without the pointer, by choosing it.
  assert.equal(noCursor?.severity, "warn");
  assert.equal(noCursor?.fix?.action, "without-cursor");
  assert.equal(noCursor?.fix?.label, "Exportar sem o cursor");
  assert.ok(noCursor?.message.includes(CURSOR_MISSING));
  // Chosen: the export's copy of the lesson has those recordings as plain videos.
  const plain = withoutMissingCursors(cursor);
  const tela = plain.assets.find((a) => a.id === "tela");
  assert.ok(tela && !tela.cursor && !tela.cursorMissing);
  assert.equal(has(plain, { speech }, "cursor-missing"), undefined);
  assert.equal(withoutMissingCursors(p), p, "nothing to drop: the same lesson");
  // A missing file nobody uses is not a problem of this export.
  const unused = {
    ...p,
    assets: p.assets.map((a) => (a.id === "musica" ? { ...a, missing: true } : a)),
  };
  assert.ok(!has(unused, { speech }, "media-missing"));
});

test("YouTube chapters: first at 0:00, at least 3, each 10 s or longer", () => {
  const bad = lesson([], {
    publish: {
      chapters: [
        { time: 2, title: "Início" },
        { time: 15, title: "Jogo" },
        { time: 20, title: "Desafio" },
      ],
    },
  });
  const f = has(bad, { speech }, "chapters");
  assert.match(f?.message ?? "", /primeiro começa em 0:02/);
  assert.match(f?.message ?? "", /um tem menos de 10 s/);
  const good = lesson([], {
    publish: {
      chapters: [
        { time: 0, title: "Início" },
        { time: 10, title: "Jogo" },
        { time: 20, title: "Desafio" },
      ],
    },
  });
  assert.ok(!has(good, { speech }, "chapters"));
  const fixed = chapterProblems(
    [
      { time: 3, title: "a" },
      { time: 12, title: "b" },
      { time: 15, title: "c" },
      { time: 30, title: "d" },
    ],
    45,
  ).fixed;
  assert.deepEqual(
    fixed?.map((c) => c.time),
    [0, 12, 30],
  );
});

test("black gaps in the picture and pieces shorter than 3 frames", () => {
  const gap = lesson([], {
    clips: [
      { id: "s1", assetId: "tela", trackId: "t2", start: 0, in: 0, duration: 10, volume: 1 },
      { id: "s2", assetId: "tela", trackId: "t2", start: 11, in: 12, duration: 19, volume: 1 },
      { id: "v", assetId: "voz", trackId: "t3", start: 0, in: 0, duration: 30, volume: 1 },
    ],
  });
  const black = has(gap, { speech: [[0.5, 9]] }, "black-gap");
  assert.match(black?.message ?? "", /Tela preta por 1,0 s em 0:10/);
  assert.deepEqual(black?.fix, { label: "Fechar a lacuna", action: "cut", ranges: [[10, 11]] });
  assert.equal(has(gap, { speech }, "black-gap")?.fix, undefined);
  const tiny: Clip = {
    id: "t",
    assetId: "tela",
    trackId: "t2",
    start: 30,
    in: 40,
    duration: 2 / 30,
    volume: 1,
  };
  const short = has(lesson([tiny]), { speech }, "short-piece");
  assert.match(short?.message ?? "", /Pedaço de 2 quadros/);
  assert.ok(!has(lesson(), { speech }, "short-piece"));
});

test("errors come first, then the rest in timeline order", () => {
  const p = lesson();
  const gone = {
    ...p,
    captions: { ...burned, size: 4 },
    assets: p.assets.map((a) => (a.id === "voz" ? { ...a, missing: true } : a)),
  };
  const list = preflight(gone, { speech: [[2.5, 26]] });
  assert.equal(list[0].severity, "error");
  for (const f of list) assert.ok(!/—|\(s\)/.test(f.message), f.message);
});

test("a track heard alone in the editor is told: the export mixes every track", () => {
  assert.equal(has(lesson(), { speech }, "solo"), undefined);
  const one = has(lesson(), { speech, solo: ["t3"] }, "solo");
  assert.equal(one?.severity, "info");
  assert.match(one?.message ?? "", /só Voz está tocando/);
  assert.deepEqual(one?.fix, { label: "Ouvir todas as faixas", action: "solo-off" });
  const two = has(lesson(), { speech, solo: ["t3", "t4"] }, "solo");
  assert.match(two?.message ?? "", /só Voz e Música estão tocando/);
  // A track that is gone is not named.
  assert.equal(has(lesson(), { speech, solo: ["nope"] }, "solo"), undefined);
});
