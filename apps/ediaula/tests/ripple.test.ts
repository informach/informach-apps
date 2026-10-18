import assert from "node:assert/strict";
import { test } from "node:test";
import { cutTargets } from "../src/shared/cleanup.ts";
import { transformAt } from "../src/shared/keyframes.ts";
import { extendFrameAll, insertClips, rippleTrim } from "../src/shared/ripple.ts";
import { clipEnd, sourceAt } from "../src/shared/timeline.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const track = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  kind: "video",
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const sound = (id: string, extra: Partial<Track> = {}): Track =>
  track(id, { kind: "audio", ...extra });
const clip = (
  id: string,
  trackId: string,
  start: number,
  duration: number,
  extra: Partial<Clip> = {},
): Clip => ({ id, assetId: "v", trackId, start, in: 0, duration, volume: 1, ...extra });
const media = (id: string, kind: Asset["kind"], extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}`,
  kind,
  duration: kind === "image" ? 0 : 600,
  width: kind === "audio" ? 0 : 1920,
  height: kind === "audio" ? 0 : 1080,
  fps: kind === "video" ? 30 : 0,
  hasVideo: kind !== "audio",
  hasAudio: kind !== "image",
  size: 1,
  proxyStatus: "none",
  ...extra,
});
const ASSETS: Asset[] = [
  media("v", "video"),
  media("mic", "audio", { recording: { id: "r", role: "mic" } } as Partial<Asset>),
  media("song", "audio"),
  media("img", "image"),
  media("note", "image", { generated: "annotation" }),
];
const lesson = (tracks: Track[], clips: Clip[]): Project => ({
  version: 1,
  id: "p",
  name: "aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: ASSETS,
  tracks,
  clips,
});
/** The clips of a track as [start, duration, in], in time order. */
const on = (clips: Clip[], trackId: string): number[][] =>
  clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start)
    .map((c) => [c.start, c.duration, c.in].map((n) => Math.round(n * 1000) / 1000));

/** The usual recording: screen and microphone, a music bed and a locked track. */
const TRACKS = [
  track("v"),
  sound("voz"),
  sound("m", { music: true }),
  track("fixa", { locked: true }),
];
const recording = (): Project =>
  lesson(TRACKS, [
    clip("tela", "v", 0, 10),
    clip("depois", "v", 10, 5, { in: 10 }),
    clip("fala", "voz", 0, 15, { assetId: "mic" }),
    clip("m1", "m", 0, 6, { assetId: "song" }),
    clip("m2", "m", 6, 9, { assetId: "song", in: 6 }),
    clip("fixo", "fixa", 12, 2),
  ]);

test("the tracks text cuts reach are the screen and the microphone, not the music", () => {
  assert.deepEqual([...cutTargets(recording())].sort(), ["v", "voz"]);
});

test("shortening with Shift takes the stretch out of the screen and the voice together", () => {
  const p = recording();
  const r = rippleTrim(p, cutTargets(p), "tela", "end", 8.013);
  // The edge lands where it was dragged; the voice loses the same stretch, so they stay in sync.
  assert.deepEqual(
    r.cut?.map((n) => Math.round(n * 1000) / 1000),
    [8.013, 10],
  );
  assert.deepEqual(on(r.clips, "v"), [
    [0, 8.013, 0],
    [8.013, 5, 10],
  ]);
  assert.deepEqual(on(r.clips, "voz"), [
    [0, 8.013, 0],
    [8.013, 5, 10],
  ]);
  // The music in pieces is neither pushed nor cut: only its end follows the shorter lesson.
  assert.deepEqual(on(r.clips, "m"), [
    [0, 6, 0],
    [6, 7.013, 6],
  ]);
  assert.deepEqual(on(r.clips, "fixa"), [[12, 2, 0]], "locked tracks never change");
});

test("lengthening with Shift opens room on the screen and the voice, cutting the voice in two", () => {
  const p = recording();
  const r = rippleTrim(p, cutTargets(p), "tela", "end", 13);
  assert.equal(r.cut, undefined);
  assert.deepEqual(on(r.clips, "v"), [
    [0, 13, 0],
    [13, 5, 10],
  ]);
  // The new footage of the screen has no voice under it; after it the voice goes on in sync.
  assert.deepEqual(on(r.clips, "voz"), [
    [0, 10, 0],
    [13, 5, 10],
  ]);
  // No hole in the music: the bed that played to the end goes on to the new end.
  assert.deepEqual(on(r.clips, "m"), [
    [0, 6, 0],
    [6, 12, 6],
  ]);
  assert.deepEqual(on(r.clips, "fixa"), [[12, 2, 0]]);
});

test("Shift on the head keeps the clip's place, with the same cut on the voice", () => {
  const p = lesson(TRACKS, [
    clip("antes", "v", 0, 5),
    clip("tela", "v", 5, 10, { in: 20 }),
    clip("fala", "voz", 0, 15, { assetId: "mic" }),
  ]);
  const shorter = rippleTrim(p, cutTargets(p), "tela", "start", 7);
  assert.deepEqual(on(shorter.clips, "v"), [
    [0, 5, 0],
    [5, 8, 22],
  ]);
  assert.deepEqual(on(shorter.clips, "voz"), [
    [0, 5, 0],
    [5, 8, 7],
  ]);
  const longer = rippleTrim(p, cutTargets(p), "tela", "start", 3);
  assert.deepEqual(on(longer.clips, "v"), [
    [0, 5, 0],
    [5, 12, 18],
  ]);
  // The voice that started with the clip waits for the footage that came back.
  assert.deepEqual(on(longer.clips, "voz"), [
    [0, 5, 0],
    [7, 10, 5],
  ]);
});

test("a continuous microphone under a split screen follows the cut and stays in sync", () => {
  const p = lesson(TRACKS, [
    clip("tela1", "v", 0, 10),
    clip("tela2", "v", 10, 10, { in: 10 }),
    clip("fala", "voz", 0, 20, { assetId: "mic" }),
  ]);
  const r = rippleTrim(p, cutTargets(p), "tela1", "end", 7);
  for (const t of [3, 7.5, 12, 16.9]) {
    const screen = r.clips.find((c) => c.trackId === "v" && c.start <= t && clipEnd(c) > t);
    const voice = r.clips.find((c) => c.trackId === "voz" && c.start <= t && clipEnd(c) > t);
    assert.ok(screen && voice, `something plays at ${t}`);
    assert.equal(sourceAt(screen, t), sourceAt(voice, t), `same second of the recording at ${t}`);
  }
});

test("the last clip is just trimmed: nothing after it to follow", () => {
  const p = lesson(TRACKS, [
    clip("tela", "v", 0, 10),
    clip("fala", "voz", 0, 10, { assetId: "mic" }),
    clip("musica", "m", 0, 10, { assetId: "song" }),
  ]);
  const r = rippleTrim(p, cutTargets(p), "tela", "end", 6);
  assert.deepEqual(on(r.clips, "v"), [[0, 6, 0]]);
  assert.deepEqual(on(r.clips, "voz"), [[0, 10, 0]]);
  assert.deepEqual(on(r.clips, "m"), [[0, 10, 0]]);
});

test("a clip of another track crossing the edit point is cut, not covered", () => {
  const p = lesson(TRACKS, [
    clip("tela", "v", 0, 10),
    clip("depois", "v", 10, 5),
    clip("fala", "voz", 9.5, 4.25, { assetId: "mic", in: 1 }),
  ]);
  const r = rippleTrim(p, cutTargets(p), "tela", "end", 6.6);
  // Its half second before 10 s goes with the cut; the rest closes up with the screen.
  assert.deepEqual(on(r.clips, "voz"), [[6.6, 3.75, 1.5]]);
  assert.deepEqual(on(r.clips, "v"), [
    [0, 6.6, 0],
    [6.6, 5, 0],
  ]);
});

test("a clip of a locked track is not trimmed, with or without ripple", () => {
  const p = lesson(
    [track("v", { locked: true }), sound("voz")],
    [clip("a", "v", 0, 10), clip("b", "v", 10, 10), clip("fala", "voz", 0, 20)],
  );
  const r = rippleTrim(p, cutTargets(p), "a", "end", 12);
  assert.equal(r.unchanged, true);
  assert.equal(r.clips, p.clips);
});

test("the head of the last clip, and the end of a clip with only music after it, just trim", () => {
  const alone = lesson(TRACKS, [clip("a", "v", 0, 20)]);
  assert.deepEqual(on(rippleTrim(alone, cutTargets(alone), "a", "start", 2).clips, "v"), [
    [0, 18, 2],
  ]);
  assert.deepEqual(on(rippleTrim(alone, cutTargets(alone), "a", "end", 25).clips, "v"), [
    [0, 25, 0],
  ]);
  const withMusic = lesson(TRACKS, [
    clip("a", "v", 0, 20),
    clip("m", "m", 0, 60, { assetId: "song" }),
  ]);
  const r = rippleTrim(withMusic, cutTargets(withMusic), "a", "end", 18);
  assert.deepEqual(on(r.clips, "v"), [[0, 18, 0]]);
  assert.deepEqual(on(r.clips, "m"), [[0, 60, 0]], "the music is not pushed nor cut");
});

test("inserting where nothing comes after only places the clips", () => {
  const p = lesson(TRACKS, [clip("a", "v", 0, 20)]);
  const out = insertClips(p, cutTargets(p), [clip("n", "v", 20, 5, { assetId: "img" })], 20);
  assert.deepEqual(on(out, "v"), [
    [0, 20, 0],
    [20, 5, 0],
  ]);
});

test("a trim the footage cannot follow changes nothing", () => {
  const p = lesson(TRACKS, [clip("tela", "v", 0, 600), clip("fala", "voz", 0, 700)]);
  const r = rippleTrim(p, cutTargets(p), "tela", "end", 640);
  assert.equal(r.unchanged, true);
  assert.equal(r.clips, p.clips);
});

test("inserting with Ctrl splits the screen and the voice at the point and pushes only them", () => {
  const notes = track("notas");
  const p = lesson(
    [track("v"), notes, sound("voz"), sound("m", { music: true }), track("fixa", { locked: true })],
    [
      clip("tela", "v", 0, 60),
      clip("fala", "voz", 0, 60, { assetId: "mic" }),
      clip("balao", "notas", 25, 10, {
        assetId: "note",
        annotation: { kind: "balloon", text: "Oi", color: "#3D6BFF" },
      }),
      clip("musica", "m", 0, 60, { assetId: "song" }),
      clip("fixo", "fixa", 40, 2),
    ],
  );
  const image = clip("imagem", "v", 30, 5, { assetId: "img", volume: 0 });
  const out = insertClips(p, cutTargets(p), [image], 30);
  assert.deepEqual(on(out, "v"), [
    [0, 30, 0],
    [30, 5, 0],
    [35, 30, 30],
  ]);
  assert.deepEqual(on(out, "voz"), [
    [0, 30, 0],
    [35, 30, 30],
  ]);
  assert.deepEqual(on(out, "notas"), [
    [25, 5, 0],
    [35, 5, 5],
  ]);
  // The music keeps playing under the picture and to the new end; the locked track stays.
  assert.deepEqual(on(out, "m"), [[0, 65, 0]]);
  assert.deepEqual(on(out, "fixa"), [[40, 2, 0]]);
});

test("extend frame on every track holds the presenter too and keeps the movement still", () => {
  const p = lesson(
    [track("v"), track("apresentador"), track("notas"), sound("voz"), sound("m", { music: true })],
    [
      clip("tela", "v", 0, 20),
      clip("rosto", "apresentador", 0, 20, {
        transform: { x: 0.85, y: 0.8, scale: 0.3, opacity: 1 },
      }),
      clip("fala", "voz", 2, 12, { assetId: "mic", in: 1 }),
      clip("depois", "voz", 16, 3, { assetId: "mic" }),
      clip("balao", "notas", 8, 6, {
        assetId: "note",
        annotation: { kind: "balloon", text: "Oi", color: "#3D6BFF" },
        keyframes: [
          { t: 0, x: 0.2, y: 0.2, scale: 1 },
          { t: 5, x: 0.8, y: 0.2, scale: 1 },
        ],
      }),
      clip("musica", "m", 0, 20, { assetId: "song" }),
    ],
  );
  const targets = cutTargets(p);
  const { clips: out, stillId } = extendFrameAll(
    p,
    "tela",
    10,
    4,
    "quadro",
    targets,
    new Map([["rosto", "quadro-rosto"]]),
  );
  const still = out.find((c) => c.id === stillId);
  assert.deepEqual([still?.start, still?.duration], [10, 4]);
  assert.deepEqual(on(out, "v"), [
    [0, 10, 0],
    [10, 4, 0],
    [14, 10, 10],
  ]);
  // The presenter holds its own frame where it was, then goes on in sync with the screen.
  const face = out.filter((c) => c.trackId === "apresentador").sort((a, b) => a.start - b.start);
  assert.deepEqual(
    face.map((c) => [c.start, c.duration, c.in, c.assetId]),
    [
      [0, 10, 0, "v"],
      [10, 4, 0, "quadro-rosto"],
      [14, 10, 10, "v"],
    ],
  );
  assert.deepEqual(face[1].transform, face[0].transform);
  assert.deepEqual(on(out, "voz"), [
    [2, 8, 1],
    [14, 4, 9],
    [20, 3, 0],
  ]);
  // The balloon lasts 4 s more and stays put while the frame holds.
  const balloon = out.find((c) => c.id === "balao");
  assert.ok(balloon);
  assert.equal(balloon.duration, 10);
  const at = (t: number): number => transformAt(balloon, t).x;
  assert.ok(Math.abs(at(10) - at(12)) < 1e-9 && Math.abs(at(10) - at(14)) < 1e-9);
  assert.ok(at(9) < at(10) && at(14.5) > at(14), "it moves before and after the hold");
  assert.equal(Math.round(at(17) * 1000) / 1000, 0.8, "and ends where it ended, 4 s later");
  // The music that played to the end follows the new end.
  assert.deepEqual(on(out, "m"), [[0, 24, 0]]);
});
