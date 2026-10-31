import assert from "node:assert/strict";
import { test } from "node:test";
import { cameraPresenterTransform } from "../src/shared/compose.ts";
import { drawingPartClips } from "../src/shared/drawing.ts";
import {
  clockOffset,
  lapseEnd,
  layoutOverNarration,
  overAnchor,
  overEnd,
  overPieces,
} from "../src/shared/overNarration.ts";
import type { RecordingResult } from "../src/shared/recording.ts";
import { layoutRecording } from "../src/shared/recordingImport.ts";
import { momentInTake } from "../src/shared/recordingJournal.ts";
import { defaultTracks } from "../src/shared/timeline.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

/**
 * A take whose first frame came at QPC 1000 ms. The voice was asked to play from 12 s of the
 * timeline at QPC 1800, but the sound card puts it in the headphones 40 ms later; the window's
 * clock runs 5000 ms behind the main process's.
 */
const FIRST_FRAME = 1000;
const LATENCY = 0.04;
const WINDOW_BEHIND = 5000;

/** The anchors the recorder window would send every half second of playback. */
function anchors(from: number, playAt: number, pauses: [number, number][], until: number) {
  const out: { qpc: number; at: number }[] = [];
  for (let qpc = playAt + 100; qpc < until; qpc += 500) {
    if (pauses.some(([a, b]) => qpc >= a && qpc < b)) continue;
    // Seconds of voice played so far (it stops during the pauses).
    const paused = pauses.reduce(
      (s, [a, b]) => s + Math.max(0, Math.min(qpc, b) - a) * (qpc > a ? 1 : 0),
      0,
    );
    // Where the audio element is; what reaches the ears is LATENCY behind it.
    const currentTime = (qpc - playAt - paused) / 1000;
    out.push(
      overAnchor({
        now: qpc - WINDOW_BEHIND,
        currentTime,
        fileStart: from,
        latency: LATENCY,
        offset: WINDOW_BEHIND,
      }),
    );
  }
  return out;
}

test("o relógio da janela é medido pela ida e volta mais curta", () => {
  const offset = clockOffset([
    { sent: 0, got: 30, qpc: 5020 },
    { sent: 100, got: 104, qpc: 5102 },
    { sent: 200, got: 260, qpc: 5250 },
  ]);
  assert.equal(offset, 5000);
});

test("o take entra no tempo certo da narração, compensando a latência e as pausas", () => {
  const segments = [{ start: FIRST_FRAME, duration: 20 }];
  // Paused from 6 s to 9 s of the take (QPC 7000 to 10000): the voice paused with it.
  const pauseQpc: [number, number] = [7000, 10000];
  const journal = anchors(12, 1800, [pauseQpc], FIRST_FRAME + 20000);
  const result: Pick<RecordingResult, "duration" | "pauses" | "over"> = {
    duration: 20,
    pauses: [[6, 9]],
    over: {
      from: 12,
      anchors: journal.map((a) => ({ t: momentInTake(segments, a.qpc), at: a.at })),
    },
  };
  const pieces = overPieces(result);
  // The first 0.84 s of the take came before the voice was heard (0.8 s until it played, 40 ms
  // in the sound card): they are left out, and second 0.84 of the take is second 12.
  assert.equal(pieces.length, 2);
  assert.ok(Math.abs(pieces[0].from - 0.84) < 0.002, String(pieces[0].from));
  assert.ok(Math.abs(pieces[0].start - 12) < 0.002, String(pieces[0].start));
  assert.equal(pieces[0].to, 6);
  // After the pause the screen goes on where the voice went on: no gap, no overlap.
  assert.ok(Math.abs(pieces[1].start - (12 + 6 - 0.84)) < 0.002, String(pieces[1].start));
  assert.equal(pieces[1].from, 9);
});

const videoTrack = (id: string, name: string): Track => ({
  id,
  kind: "video",
  name,
  muted: false,
  hidden: false,
  locked: false,
});

const screenAsset = (id: string, role?: "screen" | "camera", take = "gravacao"): Asset => ({
  id,
  name: id,
  path: `C:/${id}.mp4`,
  kind: "video",
  duration: 60,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: false,
  size: 1,
  proxyStatus: "none",
  ...(role ? { recording: { id: take, role } } : {}),
});

const wholeClip = (id: string, assetId: string, trackId: string): Clip => ({
  id,
  assetId,
  trackId,
  start: 0,
  in: 0,
  duration: 40,
  volume: 1,
});

/**
 * A redo of 12 to 20 s: the voice plays from 10 s (two seconds of lead-in) at QPC 1800, and the
 * take lasts `seconds` (15 covers the whole stretch; less is a take stopped early).
 */
function redo(seconds: number): RecordingResult {
  const segments = [{ start: FIRST_FRAME, duration: seconds }];
  const journal = anchors(10, 1800, [], FIRST_FRAME + seconds * 1000);
  return {
    version: 2,
    dir: "C:/take",
    screen: "C:/nova.mp4",
    duration: seconds,
    pauses: [],
    markers: [],
    mode: "over",
    over: {
      from: 12,
      to: 20,
      replace: true,
      anchors: journal.map((a) => ({ t: momentInTake(segments, a.qpc), at: a.at })),
    },
  };
}

const onTrack = (clips: readonly Clip[], trackId: string) =>
  clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start)
    .map((c) => [
      c.assetId,
      Math.round(c.start * 1000) / 1000,
      Math.round(c.duration * 1000) / 1000,
    ]);

test("regravar a tela num intervalo troca só aquele trecho da faixa da tela", () => {
  const old = screenAsset("antiga", "screen");
  const project: Pick<Project, "tracks" | "clips" | "assets"> = {
    tracks: [videoTrack("tv", "F1")],
    clips: [wholeClip("old", "antiga", "tv")],
    assets: [old],
  };
  const layout = layoutOverNarration(project, [old, screenAsset("nova")], redo(15));
  assert.deepEqual(onTrack(layout.clips, "tv"), [
    ["antiga", 0, 12],
    ["nova", 12, 8],
    ["antiga", 20, 20],
  ]);
  const placed = layout.clips.find((c) => c.assetId === "nova");
  // Timeline 12 s was heard 2 s into the voice, 0.84 + 2 s into the take.
  assert.ok(placed && Math.abs(placed.in - 2.84) < 0.002, String(placed?.in));
});

test("uma regravação parada antes do fim troca só o que gravou", () => {
  const old = screenAsset("antiga", "screen");
  const project: Pick<Project, "tracks" | "clips" | "assets"> = {
    tracks: [videoTrack("tv", "F1")],
    clips: [wholeClip("old", "antiga", "tv")],
    assets: [old],
  };
  // Stopped 5 s into the take: the voice was at 14.16 s, and 14.16 to 20 s keeps the old screen.
  const layout = layoutOverNarration(project, [old, screenAsset("nova")], redo(5));
  assert.deepEqual(onTrack(layout.clips, "tv"), [
    ["antiga", 0, 12],
    ["nova", 12, 2.16],
    ["antiga", 14.16, 25.84],
  ]);
});

test("a regravação troca a tela na faixa em que a tela está, não na principal", () => {
  // The screen of the first take on a "Tela" track; the main track holds something else (the
  // camera of another take) that the redo must leave alone.
  const old = screenAsset("antiga", "screen");
  const camera = screenAsset("camera", "camera", "outra");
  const project: Pick<Project, "tracks" | "clips" | "assets"> = {
    tracks: [videoTrack("ts", "Tela"), videoTrack("tv", "F1")],
    clips: [wholeClip("old", "antiga", "ts"), wholeClip("cam", "camera", "tv")],
    assets: [old, camera],
  };
  const layout = layoutOverNarration(project, [old, camera, screenAsset("nova")], redo(15));
  assert.deepEqual(onTrack(layout.clips, "ts"), [
    ["antiga", 0, 12],
    ["nova", 12, 8],
    ["antiga", 20, 20],
  ]);
  assert.deepEqual(onTrack(layout.clips, "tv"), [["camera", 0, 40]]);
});

test("Voz e câmera e depois a tela sobre a narração: o apresentador no canto e a tela visível embaixo", () => {
  // The "Voz e câmera" take: a landscape camera without its background removed.
  const voice: Asset = { ...screenAsset("voz"), kind: "audio", hasVideo: false, hasAudio: true };
  const camera = screenAsset("cam");
  const frame = { width: 1920, height: 1080 };
  const take: RecordingResult = {
    version: 2,
    dir: "C:/vc",
    microphone: "C:/voz.mp4",
    cameraParts: [{ path: "C:/cam.mp4", at: 0, in: 0, duration: 30 }],
    duration: 30,
    pauses: [],
    markers: [],
    mode: "voicecam",
  };
  const first = layoutRecording({ tracks: defaultTracks(), clips: [] }, [voice, camera], take, 0, {
    presenterTransform: (a) => cameraPresenterTransform(a, frame),
  });
  const presenterTrack = first.tracks.find((t) => t.name === "Apresentador");
  const presenter = first.clips.find((c) => c.assetId === "cam");
  assert.ok(presenterTrack && presenter?.transform);
  const t = presenter.transform;
  // In the corner, inside the frame: never over the whole lesson.
  assert.ok(t.scale < 0.5, `scale ${t.scale}`);
  assert.ok(t.x + t.scale / 2 <= 1 && t.y + t.scale / 2 <= 1, JSON.stringify(t));
  assert.ok(t.x > 0.5 && t.y > 0.5, "on the lower right");

  // Then the screen over that narration.
  const segments = [{ start: FIRST_FRAME, duration: 20 }];
  const journal = anchors(0, 1800, [], FIRST_FRAME + 20000);
  const over: RecordingResult = {
    version: 2,
    dir: "C:/over",
    screen: "C:/tela.mp4",
    duration: 20,
    pauses: [],
    markers: [],
    mode: "over",
    over: {
      from: 0,
      anchors: journal.map((a) => ({ t: momentInTake(segments, a.qpc), at: a.at })),
    },
  };
  const screen = screenAsset("tela");
  const second = layoutOverNarration(
    { tracks: first.tracks, clips: first.clips, assets: [voice, camera] },
    [voice, camera, screen],
    over,
  );
  const screenClip = second.clips.find((c) => c.assetId === "tela");
  assert.ok(screenClip, "the screen came in");
  const order = second.tracks.map((tr) => tr.id);
  // Tracks above come first: the presenter stays above the screen, which shows around it.
  assert.ok(
    order.indexOf(presenterTrack.id) < order.indexOf(screenClip.trackId),
    "the presenter's track is above the screen's",
  );
  assert.ok(second.clips.some((c) => c.assetId === "cam" && c.transform?.scale === t.scale));
});

test("o desenho e o quadro de um take sobre a narração ficam sobre os clipes da tela", () => {
  const screen = screenAsset("nova");
  const project: Pick<Project, "tracks" | "clips" | "assets"> = {
    tracks: [videoTrack("tv", "F1")],
    clips: [],
    assets: [screen],
  };
  const layout = layoutOverNarration(project, [screen], redo(15));
  assert.ok(layout.pieces.length > 0);
  for (const piece of layout.pieces) {
    assert.equal(piece.screen.length, 1);
    assert.equal(piece.screen[0].assetId, "nova");
    assert.ok(layout.placed.includes(piece.screen[0]));
  }
  // What lib/drawing.ts does with the layout: every part of the drawing has a screen under it.
  const parts = drawingPartClips(
    layout.pieces,
    [layout.pieces[0].from, layout.pieces.at(-1)?.to ?? 0],
    [{ from: 0, to: 4, kind: "drawing" }],
    "desenho",
    "",
    () => "c",
  );
  assert.ok(parts.length > 0);
  assert.ok(parts.every((p) => p.screen === layout.pieces[0].screen[0].id));
});

test("regravar a tela num intervalo tira dali o som do PC, a câmera e o desenho do take antigo", () => {
  const audio = (id: string, role: "system" | "mic", take = "antigo"): Asset => ({
    ...screenAsset(id),
    path: `C:/${id}.m4a`,
    kind: "audio",
    hasVideo: false,
    hasAudio: true,
    recording: { id: take, role },
  });
  const old = screenAsset("tela-antiga", "screen", "antigo");
  const camera = screenAsset("camera-antiga", "camera", "antigo");
  const drawing: Asset = {
    ...screenAsset("desenho-antigo"),
    recording: { id: "antigo", role: "drawing" },
  };
  const system = audio("sistema-antigo", "system");
  const mic = audio("microfone-antigo", "mic");
  const voice = { ...audio("voz", "mic", "narracao") };
  const other = screenAsset("camera-outra", "camera", "outro");
  const audioTrack = (id: string, name: string): Track => ({
    ...videoTrack(id, name),
    kind: "audio",
  });
  const tracks = [
    videoTrack("tc", "Câmera"),
    videoTrack("td", "Desenho"),
    videoTrack("tv", "Tela"),
    videoTrack("to", "Outra"),
    audioTrack("ta", "Áudio do PC"),
    audioTrack("tm", "Microfone"),
    audioTrack("tz", "Voz"),
  ];
  const project: Pick<Project, "tracks" | "clips" | "assets"> = {
    tracks,
    clips: [
      wholeClip("c1", "tela-antiga", "tv"),
      wholeClip("c2", "camera-antiga", "tc"),
      wholeClip("c3", "desenho-antigo", "td"),
      wholeClip("c4", "sistema-antigo", "ta"),
      wholeClip("c5", "microfone-antigo", "tm"),
      wholeClip("c6", "voz", "tz"),
      wholeClip("c7", "camera-outra", "to"),
    ],
    assets: [old, camera, drawing, system, mic, voice, other],
  };
  const fresh = screenAsset("nova");
  const layout = layoutOverNarration(project, [...project.assets, fresh], redo(15));
  for (const [track, asset] of [
    ["tc", "camera-antiga"],
    ["td", "desenho-antigo"],
    ["ta", "sistema-antigo"],
    // Another voice covers the stretch: the old take's microphone goes with it.
    ["tm", "microfone-antigo"],
  ])
    assert.deepEqual(
      onTrack(layout.clips, track),
      [
        [asset, 0, 12],
        [asset, 20, 20],
      ],
      track,
    );
  assert.deepEqual(onTrack(layout.clips, "tv"), [
    ["tela-antiga", 0, 12],
    ["nova", 12, 8],
    ["tela-antiga", 20, 20],
  ]);
  // The lesson's voice and another take's camera stay.
  assert.deepEqual(onTrack(layout.clips, "tz"), [["voz", 0, 40]]);
  assert.deepEqual(onTrack(layout.clips, "to"), [["camera-outra", 0, 40]]);

  // A screen take with its narration: its microphone is the voice heard, and it stays.
  const alone = {
    ...project,
    clips: project.clips.filter((c) => c.id !== "c6"),
    assets: project.assets.filter((a) => a.id !== "voz"),
  };
  const kept = layoutOverNarration(alone, [...alone.assets, fresh], redo(15));
  assert.deepEqual(onTrack(kept.clips, "tm"), [["microfone-antigo", 0, 40]]);
  assert.deepEqual(onTrack(kept.clips, "ta"), [
    ["sistema-antigo", 0, 12],
    ["sistema-antigo", 20, 20],
  ]);
});

test("a tela em partes sobre a narração entra pelas âncoras, sem espaço entre elas", () => {
  // The redo of 12 to 20 s kept in two parts (no room to join them): 0 to 6 s and 6 to 15 s.
  const one = screenAsset("parte-1");
  const two = screenAsset("parte-2");
  const whole = redo(15);
  const parts: RecordingResult = {
    ...whole,
    screen: undefined,
    screenParts: [
      { path: one.path, at: 0, in: 0, duration: 6, cursor: "C:/c1.json" },
      { path: two.path, at: 6, in: 0, duration: 9, cursor: "C:/c2.json" },
    ],
  };
  const project: Pick<Project, "tracks" | "clips" | "assets"> = {
    tracks: [videoTrack("tv", "F1")],
    clips: [],
    assets: [one, two],
  };
  const joined = layoutOverNarration(project, [screenAsset("nova")], whole);
  const split = layoutOverNarration(project, [one, two], parts);
  // Same places on the timeline as the joined screen, each part from its own second.
  const at = (clips: readonly Clip[]) =>
    clips.map((c) => [Math.round(c.start * 1000) / 1000, Math.round(c.duration * 1000) / 1000]);
  const total = (clips: readonly Clip[]) => clips.reduce((s, c) => s + c.duration, 0);
  assert.ok(Math.abs(total(split.placed) - total(joined.placed)) < 0.002);
  assert.equal(at(split.placed)[0][0], at(joined.placed)[0][0]);
  const first = split.placed.find((c) => c.assetId === "parte-1");
  const second = split.placed.find((c) => c.assetId === "parte-2");
  assert.ok(first && second && Math.abs(second.in) < 0.002, String(second?.in));
  // The second part starts where the first ends: the take's second 6 at the voice's time.
  assert.ok(Math.abs(second.start - (first.start + first.duration)) < 0.002);
  assert.deepEqual(
    split.roles.map((r) => [r.assetId, r.role]),
    [
      ["parte-1", "screen"],
      ["parte-2", "screen"],
    ],
  );
  assert.ok(split.pieces.every((p) => p.screen.length > 0));
});

/** One part of a lesson recorded in parts: the voice plays from `play` at QPC 1800. */
function part(screen: string, from: number, play: number, seconds: number): RecordingResult {
  const segments = [{ start: FIRST_FRAME, duration: seconds }];
  const journal = anchors(play, 1800, [], FIRST_FRAME + seconds * 1000);
  return {
    version: 2,
    dir: `C:/${screen}`,
    screen: `C:/${screen}.mp4`,
    duration: seconds,
    pauses: [],
    markers: [],
    mode: "over",
    over: { from, anchors: journal.map((a) => ({ t: momentInTake(segments, a.qpc), at: a.at })) },
  };
}

test("gravada em partes, cada parte começa onde a anterior terminou, na mesma faixa", () => {
  const first = part("parte1", 0, 0, 10);
  const end = overEnd(first);
  assert.ok(end !== null);
  // 10 s of take, of which the first 0.84 s came before the voice was heard.
  assert.ok(Math.abs(end - 9.16) < 0.002, String(end));
  const project: Pick<Project, "tracks" | "clips" | "assets"> = {
    tracks: [videoTrack("tv", "F1")],
    clips: [],
    assets: [],
  };
  const one = layoutOverNarration(project, [screenAsset("parte1")], first);
  // The next part starts there, with two seconds of voice before it to come in in rhythm.
  const second = part("parte2", end, end - 2, 8);
  const two = layoutOverNarration(
    { ...project, tracks: one.tracks, clips: one.clips, assets: [screenAsset("parte1")] },
    [screenAsset("parte2")],
    second,
  );
  assert.equal(two.tracks.length, 1);
  assert.deepEqual(onTrack(two.clips, "tv"), [
    ["parte1", 0, 9.16],
    ["parte2", 9.16, 5.16],
  ]);
  // A take with nothing kept has no end to go on from.
  assert.equal(overEnd({ duration: 0, pauses: [], over: { from: 30, anchors: [] } }), null);
});

test("voltar ao começo de uma fala grava por cima da tela dali em diante, na mesma faixa", () => {
  // The first part went from 0 to 9.16 s; the person goes back to the line at 4 s.
  const first = part("parte1", 0, 0, 10);
  const project: Pick<Project, "tracks" | "clips" | "assets"> = {
    tracks: [videoTrack("tv", "F1")],
    clips: [],
    assets: [],
  };
  const one = layoutOverNarration(project, [screenAsset("parte1", "screen")], first);
  const again = {
    ...part("parte2", 4, 2, 6),
    over: { ...part("parte2", 4, 2, 6).over!, replace: true },
  };
  const two = layoutOverNarration(
    {
      tracks: one.tracks,
      clips: one.clips,
      assets: [screenAsset("parte1", "screen")],
    },
    [screenAsset("parte2", "screen")],
    again,
  );
  assert.equal(two.tracks.length, 1);
  const shown = onTrack(two.clips, "tv");
  // The first part keeps 0 to 4 s, the new one goes on from 4 s over the rest of it.
  assert.deepEqual(shown[0], ["parte1", 0, 4]);
  assert.equal(shown[1][0], "parte2");
  assert.equal(shown[1][1], 4);
});

test("gravar por cima onde não há tela gravada entra como parte comum, sem apagar a imagem da faixa", () => {
  const project: Pick<Project, "tracks" | "clips" | "assets"> = {
    tracks: [videoTrack("tv", "F1")],
    clips: [{ ...wholeClip("img", "imagem", "tv"), start: 0, duration: 40 }],
    assets: [screenAsset("imagem")],
  };
  const take = {
    ...part("nova", 4, 2, 6),
    over: { ...part("nova", 4, 2, 6).over!, replace: true },
  };
  const layout = layoutOverNarration(project, [screenAsset("nova", "screen")], take);
  // The picture stays whole; the take goes on a "Tela" track of its own.
  assert.deepEqual(onTrack(layout.clips, "tv"), [["imagem", 0, 40]]);
  assert.equal(layout.tracks.length, 2);
});

test("o trecho acelerado: a construção longa entra acelerada no tempo da fala, e a voz segue depois", () => {
  // Voice from 10 s: heard 10..20 during take 0..10; held at 20 while the screen went on from
  // take 10 to 190 (3 min of construction); resumed at 30 (the next line) for take 190..200.
  const result: Pick<RecordingResult, "duration" | "pauses" | "over"> = {
    duration: 200,
    pauses: [],
    over: {
      from: 10,
      anchors: [
        ...Array.from({ length: 20 }, (_, i) => ({ t: i * 0.5, at: 10 + i * 0.5 })),
        ...Array.from({ length: 20 }, (_, i) => ({ t: 190 + i * 0.5, at: 30 + i * 0.5 })),
      ],
      lapses: [{ from: 10, to: 190, start: 20, end: 30 }],
    },
  };
  const pieces = overPieces(result);
  assert.deepEqual(pieces, [
    { from: 0, to: 10, start: 10 },
    { from: 10, to: 190, start: 20, speed: 18 },
    { from: 190, to: 200, start: 30 },
  ]);
  assert.equal(overEnd(result), 40);
  // A pause during the construction is cut: what is kept fills the same stretch, a bit slower.
  const paused = { ...result, pauses: [[100, 130]] as [number, number][] };
  const withPause = overPieces(paused);
  assert.deepEqual(
    withPause.map((p) => [p.from, p.to, p.start, p.speed]),
    [
      [0, 10, 10, undefined],
      [10, 100, 20, 15],
      [130, 190, 26, 15],
      [190, 200, 30, undefined],
    ],
  );
  // On the timeline: the screen of the time-lapse sped up and marked, nothing else under it.
  const screen: Asset = {
    id: "tela",
    name: "tela",
    path: "C:/g/tela.mp4",
    kind: "video",
    duration: 200,
    width: 1920,
    height: 1080,
    fps: 30,
    hasVideo: true,
    hasAudio: false,
    size: 1,
    proxyStatus: "none",
  };
  const layout = layoutOverNarration(
    { tracks: defaultTracks(), clips: [], assets: [screen] },
    [screen],
    { ...(result as RecordingResult), screen: screen.path, markers: [], dir: "C:/g", version: 2 },
  );
  const lapse = layout.placed.find((c) => c.speed);
  assert.equal(lapse?.start, 20);
  assert.equal(lapse?.duration, 10);
  assert.equal(lapse?.in, 10);
  assert.equal(lapse?.timelapse, true);
  // The drawing never goes over the time-lapse.
  assert.equal(layout.pieces.length, 2);
});

test("a voz continua na próxima fala depois do trecho acelerado, ou no fim da frase", () => {
  const words = [
    { t: 20, end: 20.4 },
    { t: 20.5, end: 21 },
    // A pause of 0,8 s: the phrase ends here.
    { t: 21.8, end: 22.2 },
  ];
  assert.equal(lapseEnd(20.2, { end: 60, lines: [{ t: 12 }, { t: 25 }], words }), 25);
  assert.equal(lapseEnd(20.2, { end: 60, words }), 21.8);
  assert.equal(lapseEnd(20.2, { end: 60, words: [] }), 23.2);
  // Never past the end of the voice.
  assert.equal(lapseEnd(58.5, { end: 60, words: [] }), 60);
});
