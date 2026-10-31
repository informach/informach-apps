import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCuts } from "../src/shared/cleanup.ts";
import { chaptersInRange, cuesInRange, ffmetadata } from "../src/shared/export/assemble.ts";
import {
  addMarker,
  addNotes,
  chaptersOf,
  followMarkers,
  lessonNotes,
  type Marker,
  notesOnTimeline,
  noteText,
  stepMarker,
  withMarkerChapters,
} from "../src/shared/markers.ts";
import { extendFrameAll, insertClips, rippleTrim } from "../src/shared/ripple.ts";
import { settle } from "../src/shared/settle.ts";
import { splitAt } from "../src/shared/timeline.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const asset = (id: string, kind: Asset["kind"], duration = 120): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}`,
  kind,
  duration: kind === "image" ? 0 : duration,
  width: kind === "audio" ? 0 : 1920,
  height: kind === "audio" ? 0 : 1080,
  fps: kind === "video" ? 30 : 0,
  hasVideo: kind !== "audio",
  hasAudio: kind !== "image",
  size: 1,
  proxyStatus: "none",
});
const track = (id: string, kind: Track["kind"], extra: Partial<Track> = {}): Track => ({
  id,
  kind,
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});

/** A screen recording with its voice, music under it, and markers at 10, 30 and 60 s. */
function lesson(): Project {
  const clips: Clip[] = [
    { id: "s", assetId: "screen", trackId: "v", start: 0, in: 0, duration: 100, volume: 1 },
    { id: "m", assetId: "mic", trackId: "a", start: 0, in: 0, duration: 100, volume: 1 },
    { id: "bg", assetId: "music", trackId: "mu", start: 0, in: 0, duration: 100, volume: 0.3 },
  ];
  return {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
      asset("screen", "video"),
      asset("mic", "audio"),
      asset("music", "audio"),
      asset("still", "image"),
    ],
    tracks: [track("v", "video"), track("a", "audio"), track("mu", "audio", { music: true })],
    clips,
    markers: [
      { id: "m1", t: 10, label: "Começo" },
      { id: "m2", t: 30, label: "Exemplo", chapter: true },
      { id: "m3", t: 60, label: "Exercício", chapter: true },
    ],
  };
}

const targets = new Set(["v", "a"]);
const at = (p: Project): Record<string, number> =>
  Object.fromEntries((p.markers ?? []).map((m) => [m.id, Math.round(m.t * 1000) / 1000]));

test("markers follow a text cut: after it they move left, inside it they go to where it was", () => {
  const p = lesson();
  const cut = settle(p, { ...p, clips: applyCuts(p.clips, [[20, 35]], targets) });
  assert.deepEqual(at(cut), { m1: 10, m2: 20, m3: 45 });
});

test("markers follow a ripple trim, an insert and extend frame on every track", () => {
  const p = lesson();
  // Shift + edge on the screen, 5 s shorter at the end: everything after the cut moves.
  const split = { ...p, clips: splitAt(p.clips, 50, new Set()) };
  const piece = split.clips.find((c) => c.trackId === "v" && c.start === 0);
  assert.ok(piece);
  const trimmed = rippleTrim(split, targets, piece.id, "end", 45);
  const a = settle(p, { ...split, clips: trimmed.clips });
  assert.deepEqual(at(a), { m1: 10, m2: 30, m3: 55 });

  // A 4 s card inserted at 20 s pushes what comes after.
  const card: Clip = {
    id: "card",
    assetId: "still",
    trackId: "v",
    start: 20,
    in: 0,
    duration: 4,
    volume: 0,
  };
  const b = settle(p, { ...p, clips: insertClips(p, targets, [card], 20) });
  assert.deepEqual(at(b), { m1: 10, m2: 34, m3: 64 });

  // A frame held 3 s at 25 s, on every track.
  const held = extendFrameAll(p, "s", 25, 3, "still", targets);
  const c = settle(p, { ...p, clips: held.clips });
  assert.deepEqual(at(c), { m1: 10, m2: 33, m3: 63 });
});

test("a change that sets the markers itself is kept as it is", () => {
  const p = lesson();
  const moved = settle(p, {
    ...p,
    clips: applyCuts(p.clips, [[0, 5]], targets),
    markers: [{ id: "x", t: 7, label: "Novo" }],
  });
  assert.deepEqual(at(moved), { x: 7 });
  assert.equal(followMarkers(p, p, p.markers ?? []), p.markers);
});

test("adding, stepping and chapters", () => {
  let list: Marker[] = [];
  list = addMarker(list, 12);
  list = addMarker(list, 3);
  list = addMarker(list, 12.0001);
  assert.deepEqual(
    list.map((m) => [m.t, m.label]),
    [
      [3, "Marcador 2"],
      [12, "Marcador 1"],
    ],
  );
  assert.equal(stepMarker(list, 5, 1)?.t, 12);
  assert.equal(stepMarker(list, 5, -1)?.t, 3);
  assert.equal(stepMarker(list, 12, 1), undefined);

  const p = lesson();
  assert.deepEqual(chaptersOf(p), [
    { time: 30, title: "Exemplo" },
    { time: 60, title: "Exercício" },
  ]);
  // Without chapter markers, the ones the assistant wrote are kept.
  const plain = { ...p, markers: [], publish: { chapters: [{ time: 0, title: "Tudo" }] } };
  assert.deepEqual(chaptersOf(plain), [{ time: 0, title: "Tudo" }]);
  assert.deepEqual(withMarkerChapters(p).publish?.chapters, chaptersOf(p));
  const meta = ffmetadata({ chapters: chaptersOf(p) }, 100);
  assert.match(meta ?? "", /START=30000\nEND=60000\ntitle=Exemplo/);
});

test("a stretch exported on its own counts chapters and captions from its start", () => {
  const chapters = [
    { time: 0, title: "Abertura" },
    { time: 30, title: "Exemplo" },
    { time: 60, title: "Exercício" },
  ];
  assert.deepEqual(chaptersInRange(chapters, 40, 70), [
    { time: 0, title: "Exemplo" },
    { time: 20, title: "Exercício" },
  ]);
  assert.deepEqual(
    cuesInRange(
      [
        { start: 38, end: 41, text: "antes" },
        { start: 45, end: 47, text: "dentro" },
        { start: 69, end: 72, text: "fim" },
        { start: 80, end: 82, text: "fora" },
      ],
      40,
      70,
    ),
    [
      { start: 0, end: 1, text: "antes" },
      { start: 5, end: 7, text: "dentro" },
      { start: 29, end: 30, text: "fim" },
    ],
  );
});

test("os recados da gravação vão para o ponto da timeline que mostra aquele segundo do take", () => {
  // Take part 2 starts at take second 30; its clip shows source 5 to 20 at timeline 100.
  const clips = [
    {
      id: "c1",
      assetId: "tela1",
      trackId: "v1",
      start: 0,
      in: 0,
      out: 30,
      duration: 30,
      volume: 1,
    },
    {
      id: "c2",
      assetId: "tela2",
      trackId: "v1",
      start: 100,
      in: 5,
      out: 20,
      duration: 15,
      volume: 1,
    },
  ];
  const sources = [
    { assetId: "tela1", at: 0 },
    { assetId: "tela2", at: 30 },
  ];
  const placed = notesOnTimeline(clips, sources, [
    { t: 10, text: "errei o clique" },
    { t: 40, text: "zoom no botão" },
    // Cut out of the lesson (part 2, source 2, left during a pause): the next moment kept.
    { t: 32, text: "na pausa" },
    // Past the end of every clip: nowhere.
    { t: 60, text: "sumiu" },
  ]);
  assert.deepEqual(placed, [
    { t: 10, text: "errei o clique" },
    { t: 105, text: "zoom no botão" },
    { t: 100, text: "na pausa" },
  ]);
  const list = addNotes([{ id: "m", t: 10, label: "Marcador 1" }], placed.slice(0, 2));
  assert.deepEqual(
    list.map((m) => [Math.round(m.t * 1000) / 1000, m.label, !!m.note]),
    [
      [10, "Marcador 1", false],
      [10.033, "Lembrete: errei o clique", true],
      [105, "Lembrete: zoom no botão", true],
    ],
  );
  assert.deepEqual(
    lessonNotes({ markers: list }).map((m) => m.label),
    ["Lembrete: errei o clique", "Lembrete: zoom no botão"],
  );
  // Older lessons keep "Recado: " in the label: the text reads the same.
  assert.equal(noteText({ label: "Recado: antigo" }), "antigo");
  assert.equal(noteText({ label: "Lembrete: novo" }), "novo");
});
