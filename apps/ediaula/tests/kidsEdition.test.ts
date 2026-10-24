import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findPhrase,
  kidsEdition,
  kidsSpan,
  locateKids,
  type SourceWord,
} from "../src/shared/kidsEdition.ts";
import type { Substitution } from "../src/shared/script.ts";
import type { Asset, Clip, KidsPiece, Track } from "../src/shared/types.ts";

/** Words said one every 0.5 s from `from`, each lasting 0.4 s. */
const said = (text: string, from = 0): SourceWord[] =>
  text.split(/\s+/).map((w, i) => ({ text: w, start: from + i * 0.5, end: from + i * 0.5 + 0.4 }));

const VOICE = said(
  "Achei um! E repare no número Achados: ele mudou para 1. E os outros dois? Esses eu deixo para você descobrir. E os outros dois? Você vai ver.",
);

test("a fala é achada pelas palavras e, entre repetições, pelas âncoras", () => {
  // Said twice: the anchors pick the first one.
  const first = findPhrase(VOICE, "E os outros dois?", {
    before: "ele mudou para 1.",
    after: "Esses eu deixo",
  });
  assert.ok(first);
  // "E os outros dois?" is words 11 to 14; the 4 words before and the 3 after all match.
  assert.equal(first.start, VOICE[11].start);
  assert.equal(first.end, VOICE[14].end);
  assert.equal(first.anchors, 7);
  // Without anchors, the occurrence says which.
  const second = findPhrase(VOICE, "e os OUTROS dois", { occurrence: 2 });
  assert.equal(second?.start, VOICE[21].start);
  assert.equal(findPhrase(VOICE, "Cadê o coelho?"), null);
});

const subs: Substitution[] = [
  {
    id: "video-a1-abertura-K1",
    character: "Debinha",
    occurrence: 1,
    before: "ele mudou para 1.",
    text: "E os outros dois?",
    after: "Esses eu deixo para você descobrir.",
    tags: "[curious]",
  },
  {
    id: "video-a1-abertura-K2",
    character: "Dedé",
    occurrence: 1,
    before: "",
    text: "Cadê o coelho?",
    after: "",
    tags: "",
  },
];

test("cada linha da tabela é achada na voz e no vídeo do personagem, com um pouco de ar", () => {
  const debinha = said("Oi! E os outros dois? Tchau.", 1);
  const { pieces, problems } = locateKids(
    subs,
    new Map([["voz", VOICE]]),
    new Map([["deb", { name: "Debinha falas.mp4", duration: 6, words: debinha }]]),
  );
  assert.deepEqual(pieces, [
    {
      id: "video-a1-abertura-K1",
      character: "Debinha",
      assetId: "deb",
      // "E" at 1.5 s, "dois?" ends at 3.4 s: up to 0.15 s of air, never into the next word
      // ("Oi!" ends at 1.4 s, "Tchau." starts at 3.5 s).
      in: 1.4,
      out: 3.5,
      voice: { assetId: "voz", from: VOICE[11].start, to: VOICE[14].end },
    },
  ]);
  assert.deepEqual(problems, [
    { id: "video-a1-abertura-K2", why: "a fala não foi achada na voz da aula" },
  ]);
});

const media = (id: string, kind: Asset["kind"], duration: number, extra: Partial<Asset> = {}) =>
  ({
    id,
    name: id,
    path: `C:/aula/${id}`,
    kind,
    duration,
    width: 1920,
    height: 1080,
    fps: 30,
    hasVideo: kind !== "audio",
    hasAudio: kind !== "image",
    size: 1,
    proxyStatus: "none",
    ...extra,
  }) as Asset;
const track = (id: string, kind: Track["kind"], name: string): Track => ({
  id,
  kind,
  name,
  muted: false,
  hidden: false,
  locked: false,
});
const clip = (id: string, assetId: string, trackId: string, extra: Partial<Clip> = {}): Clip => ({
  id,
  assetId,
  trackId,
  start: 0,
  in: 0,
  duration: 20,
  volume: 1,
  ...extra,
});
const PLACE = { x: 0.8, y: 0.6, scale: 0.5, opacity: 1 };

test("a edição kids troca a fala em todas as faixas pelo trecho do personagem, com o som dele", () => {
  const lesson = {
    settings: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      track("tp", "video", "Apresentador"),
      track("tv", "video", "Tela"),
      track("tz", "audio", "Voz"),
    ],
    assets: [
      media("voz", "audio", 20),
      media("heygen", "video", 20, { origin: "presenter" }),
      media("tela", "video", 20),
      media("deb", "video", 6, { origin: "presenter" }),
      media("quadro", "image", 0),
    ],
    // The voice starts 2 s into the timeline; the presenter's video brings the sound.
    clips: [
      clip("cz", "voz", "tz", { start: 2, duration: 18, mutedFor: "presenter" }),
      clip("cp", "heygen", "tp", { start: 2, duration: 18, transform: PLACE }),
      clip("cv", "tela", "tv"),
    ],
  };
  const piece: KidsPiece = {
    id: "K1",
    character: "Debinha",
    assetId: "deb",
    in: 1.35,
    out: 3.55,
    voice: { assetId: "voz", from: 4.5, to: 6 },
  };
  assert.deepEqual(kidsSpan(lesson, piece), [6.5, 8]);
  const out = kidsEdition(
    lesson,
    new Set(["tp", "tv", "tz"]),
    [piece, { ...piece, id: "K9", voice: { assetId: "voz", from: 30, to: 31 } }],
    new Map([["K1", new Map([["tv", "quadro"]])]]),
  );
  // The line whose stretch is not on the timeline any more stays out.
  assert.deepEqual(out.skipped, ["K9"]);
  const on = (trackId: string) =>
    out.clips
      .filter((c) => c.trackId === trackId)
      .sort((a, b) => a.start - b.start)
      .map((c) => [c.assetId, round(c.start), round(c.in), round(c.duration), c.volume]);
  // 1.5 s of the teacher out, 2.2 s of the character in: everything after moves 0.7 s.
  assert.deepEqual(on("tp"), [
    ["heygen", 2, 0, 4.5, 1],
    ["deb", 6.5, 1.35, 2.2, 1],
    ["heygen", 8.7, 6, 12, 1],
  ]);
  assert.deepEqual(on("tz"), [
    ["voz", 2, 0, 4.5, 1],
    ["voz", 8.7, 6, 12, 1],
  ]);
  assert.deepEqual(on("tv"), [
    ["tela", 0, 0, 6.5, 1],
    ["quadro", 6.5, 0, 2.2, 0],
    ["tela", 8.7, 8, 12, 1],
  ]);
  // The character stands where the presenter was.
  assert.deepEqual(out.clips.find((c) => c.assetId === "deb")?.transform, PLACE);
});

const round = (v: number): number => Math.round(v * 1000) / 1000;

test("sem apresentador, várias falas kids ficam numa faixa só e cada uma no seu lugar", () => {
  const lesson = {
    settings: { width: 1920, height: 1080, fps: 30 },
    tracks: [track("tv", "video", "Tela"), track("tz", "audio", "Voz")],
    assets: [
      media("voz", "audio", 30),
      media("tela", "video", 30),
      media("deb", "video", 10, { origin: "presenter" }),
    ],
    clips: [clip("cz", "voz", "tz", { duration: 30 }), clip("cv", "tela", "tv", { duration: 30 })],
  };
  const piece = (
    id: string,
    from: number,
    to: number,
    start: number,
    length: number,
  ): KidsPiece => ({
    id,
    character: "Debinha",
    assetId: "deb",
    in: start,
    out: start + length,
    voice: { assetId: "voz", from, to },
  });
  const out = kidsEdition(lesson, new Set(["tv", "tz"]), [
    piece("K1", 5, 6, 0, 3),
    piece("K2", 20, 21, 4, 2),
  ]);
  const characters = out.tracks.filter((t) => t.name === "Apresentador");
  assert.equal(characters.length, 1);
  const deb = out.clips.filter((c) => c.assetId === "deb").sort((a, b) => a.start - b.start);
  // K1: 1 s out, 3 s in, so K2's line (20 s) is now at 22 s.
  assert.deepEqual(
    deb.map((c) => [round(c.start), round(c.duration)]),
    [
      [5, 3],
      [22, 2],
    ],
  );
  // The teacher's voice never plays under a character's line.
  const voice = out.clips.filter((c) => c.trackId === "tz");
  for (const c of deb)
    assert.ok(
      voice.every(
        (v) => v.start + v.duration <= c.start + 1e-6 || v.start >= c.start + c.duration - 1e-6,
      ),
    );
});

test("uma fala de duas linhas da tabela é o segundo take no vídeo, e um corte no meio da fala não a tira", () => {
  const twice: Substitution[] = [
    {
      id: "K1",
      character: "Dedé",
      occurrence: 1,
      before: "",
      text: "E agora?",
      after: "",
      tags: "",
    },
    {
      id: "K2",
      character: "Dedé",
      occurrence: 2,
      before: "",
      text: "E agora?",
      after: "",
      tags: "",
    },
  ];
  const voice = said("E agora? Vamos ver. E agora? Pronto.");
  const dede = said("E agora? Hum. E agora?", 1);
  const { pieces } = locateKids(
    twice,
    new Map([["voz", voice]]),
    new Map([["dd", { name: "Dedé.mp4", duration: 6, words: dede }]]),
  );
  assert.deepEqual(
    pieces.map((x) => [x.id, x.in < 2 ? "primeiro" : "segundo"]),
    [
      ["K1", "primeiro"],
      ["K2", "segundo"],
    ],
  );
  // The line's voice cut in two by a cleanup cut in the middle: it still has a place.
  const split = {
    clips: [
      clip("a", "voz", "tz", { start: 0, in: 0, duration: 5.2 }),
      clip("b", "voz", "tz", { start: 5.2, in: 5.5, duration: 10 }),
    ],
  };
  assert.deepEqual(
    kidsSpan(split, { ...pieces[0], voice: { assetId: "voz", from: 5, to: 6 } }),
    [5, 5.7],
  );
});
