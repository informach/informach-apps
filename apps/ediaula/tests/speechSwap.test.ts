import assert from "node:assert/strict";
import { test } from "node:test";
import { cutTargets } from "../src/shared/cleanup.ts";
import { heldClips, swapSpeech } from "../src/shared/speechSwap.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const media = (id: string, kind: Asset["kind"], duration: number, extra: Partial<Asset> = {}) =>
  ({
    id,
    name: id,
    path: `C:/aula/${id}`,
    kind,
    duration,
    width: kind === "audio" ? 0 : 1920,
    height: kind === "audio" ? 0 : 1080,
    fps: kind === "video" ? 30 : 0,
    hasVideo: kind !== "audio",
    hasAudio: kind !== "image",
    size: 1,
    proxyStatus: "none",
    ...extra,
  }) as Asset;

const track = (id: string, kind: Track["kind"], name: string, extra: Partial<Track> = {}) => ({
  id,
  kind,
  name,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
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

function lesson(extra: { tracks?: Track[]; clips?: Clip[]; assets?: Asset[] } = {}) {
  return {
    settings: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      track("tp", "video", "Apresentador"),
      track("tv", "video", "Tela"),
      track("tz", "audio", "Voz"),
      ...(extra.tracks ?? []),
    ],
    assets: [
      media("voz", "audio", 20),
      media("avatar", "video", 20, { origin: "presenter" }),
      media("tela", "video", 20),
      ...(extra.assets ?? []),
    ],
    clips: [
      clip("cz", "voz", "tz", { volume: 0.9 }),
      clip("cp", "avatar", "tp", { volume: 0, transform: PLACE }),
      clip("cv", "tela", "tv"),
      ...(extra.clips ?? []),
    ],
  } satisfies Pick<Project, "settings" | "tracks" | "assets" | "clips">;
}

const TARGETS = new Set(["tp", "tv", "tz"]);

const onTrack = (clips: readonly Clip[], trackId: string) =>
  clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start)
    .map((c) => [c.assetId, round(c.start), round(c.in), round(c.duration)]);
const round = (v: number): number => Math.round(v * 1000) / 1000;

test("a fala nova toma o lugar da antiga em todas as faixas e o resto anda junto", () => {
  const p = lesson();
  const voice = media("nova", "audio", 3);
  const video = media("novoAvatar", "video", 3.2, { origin: "presenter" });
  const out = swapSpeech(p, TARGETS, {
    start: 8,
    end: 10,
    voice,
    // The video starts 0.2 s before its voice is heard.
    presenter: { asset: video, offset: -0.2 },
    stills: new Map([["cv", "quadro"]]),
  });
  assert.deepEqual(out.at, [8, 11]);
  assert.deepEqual(onTrack(out.clips, "tz"), [
    ["voz", 0, 0, 8],
    ["nova", 8, 0, 3],
    ["voz", 11, 10, 10],
  ]);
  assert.deepEqual(onTrack(out.clips, "tp"), [
    ["avatar", 0, 0, 8],
    ["novoAvatar", 8, 0.2, 3],
    ["avatar", 11, 10, 10],
  ]);
  assert.deepEqual(onTrack(out.clips, "tv"), [
    ["tela", 0, 0, 8],
    ["quadro", 8, 0, 3],
    ["tela", 11, 10, 10],
  ]);
  const by = (assetId: string) => out.clips.find((c) => c.assetId === assetId);
  // The new line keeps the old one's volume, the presenter its place and silence.
  assert.equal(by("nova")?.volume, 0.9);
  assert.deepEqual(by("novoAvatar")?.transform, PLACE);
  assert.equal(by("novoAvatar")?.volume, 0);
  assert.equal(by("quadro")?.volume, 0);
  assert.equal(out.tracks.length, 3);
});

test("uma fala mais curta encurta a aula, e a música que ia até o fim acompanha", () => {
  const p = lesson({
    tracks: [track("tm", "audio", "Música", { music: true })],
    assets: [media("musica", "audio", 120)],
    clips: [clip("cm", "musica", "tm")],
  });
  const out = swapSpeech(p, TARGETS, { start: 5, end: 9, voice: media("curta", "audio", 1.5) });
  assert.deepEqual(onTrack(out.clips, "tz"), [
    ["voz", 0, 0, 5],
    ["curta", 5, 0, 1.5],
    ["voz", 6.5, 9, 11],
  ]);
  // Without a new video the presenter leaves a gap of the new line's length.
  assert.deepEqual(onTrack(out.clips, "tp"), [
    ["avatar", 0, 0, 5],
    ["avatar", 6.5, 9, 11],
  ]);
  assert.deepEqual(onTrack(out.clips, "tm"), [["musica", 0, 0, 17.5]]);
});

test("sem apresentador antes, o vídeo novo ganha uma faixa própria no topo", () => {
  const p = lesson();
  const plain = { ...p, clips: p.clips.filter((c) => c.trackId !== "tp") };
  const out = swapSpeech(plain, TARGETS, {
    start: 4,
    end: 6,
    voice: media("nova", "audio", 2),
    presenter: { asset: media("novoAvatar", "video", 2, { origin: "presenter" }), offset: 0 },
  });
  const top = out.tracks[0];
  assert.equal(top.name, "Apresentador");
  assert.deepEqual(onTrack(out.clips, top.id), [["novoAvatar", 4, 0, 2]]);
});

test("faixa travada não muda e o quadro parado só vem de quem mostra a tela", () => {
  const p = lesson({
    tracks: [track("tl", "video", "Logo", { locked: true })],
    assets: [media("logo", "video", 20)],
    clips: [clip("cl", "logo", "tl")],
  });
  const targets = new Set([...TARGETS]);
  assert.deepEqual(
    heldClips(p, targets, 8).map((c) => c.id),
    ["cv"],
  );
  const out = swapSpeech(p, targets, { start: 8, end: 10, voice: media("nova", "audio", 3) });
  assert.deepEqual(onTrack(out.clips, "tl"), [["logo", 0, 0, 20]]);
  // No still was made for the screen: the gap stays, to be recorded again.
  assert.deepEqual(onTrack(out.clips, "tv"), [
    ["tela", 0, 0, 8],
    ["tela", 11, 10, 10],
  ]);
});

test("a fala nova pode entrar onde não havia nada para tirar", () => {
  const out = swapSpeech(lesson(), TARGETS, {
    start: 20,
    end: 20,
    voice: media("fim", "audio", 4),
  });
  assert.deepEqual(onTrack(out.clips, "tz"), [
    ["voz", 0, 0, 20],
    ["fim", 20, 0, 4],
  ]);
  assert.throws(() =>
    swapSpeech(lesson(), TARGETS, { start: 1, end: 2, voice: media("vazio", "audio", 0) }),
  );
});

test("a voz importada sem transcrição também perde a fala antiga (a faixa Voz é alcançada pelos cortes)", () => {
  const p = lesson();
  // The real targets of the lesson: the "Voz" track holds an imported file, never transcribed.
  const targets = cutTargets(p as Project);
  assert.ok(targets.has("tz"));
  const out = swapSpeech(p, targets, { start: 8, end: 10, voice: media("nova", "audio", 3) });
  assert.deepEqual(onTrack(out.clips, "tz"), [
    ["voz", 0, 0, 8],
    ["nova", 8, 0, 3],
    ["voz", 11, 10, 10],
  ]);
  // Even when the targets handed in leave the voice out, the old line does not stay.
  const narrow = swapSpeech(p, new Set(["tv"]), {
    start: 8,
    end: 10,
    voice: media("nova", "audio", 3),
  });
  assert.deepEqual(onTrack(narrow.clips, "tz"), [
    ["voz", 0, 0, 8],
    ["nova", 8, 0, 3],
    ["voz", 11, 10, 10],
  ]);
});
