import assert from "node:assert/strict";
import { test } from "node:test";
import { frameCamera, screenBesideCamera } from "../src/shared/cameraFraming.ts";
import {
  buildTrack,
  clickSoundTimes,
  cursorAt,
  DEFAULT_CURSOR_FX,
  fxWhere,
} from "../src/shared/cursor.ts";
import { normalizeCursorData } from "../src/shared/cursorData.ts";
import {
  type Drawing,
  drawingChangeFrames,
  drawingConcat,
  drawingParts,
  drawingSpan,
  dropDrawingClicks,
  groupWithScreens,
  limitDrawing,
  MAX_DRAWING_POINTS,
  MAX_STROKES,
  sanitizeDrawing,
  shiftDrawing,
  strokesIn,
} from "../src/shared/drawing.ts";
import { buildAudioPlan } from "../src/shared/export/audioPlan.ts";
import { normalizeProject } from "../src/shared/project-normalize.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import { packPlan } from "../src/shared/projectPackage.ts";
import { drawingInTake } from "../src/shared/recordingJournal.ts";
import { replaceAsset } from "../src/shared/replaceAsset.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";
import {
  autoZooms,
  DEFAULT_AUTO_ZOOM,
  moveZoomEdge,
  replaceAutoZooms,
  sceneZooms,
} from "../src/shared/zoom.ts";

/**
 * The findings of the review of the recording batch (Lote 10), each held by a test: the drawing
 * made on the screen (its moments, its size in the project, the clips that show it), the zoom
 * around it, the cursor effects and what the camera framing does with the drawing.
 */

const q = 1_000_000;
const segments = [{ start: q, duration: 10 }];

const drawingAsset = (drawing: Drawing, extra: Partial<Asset> = {}): Asset => ({
  id: "d",
  name: "Desenho",
  path: "C:/cache/desenho.webm",
  kind: "video",
  duration: 6,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: false,
  size: 1,
  proxyStatus: "none",
  generated: "annotation",
  alpha: true,
  drawing,
  ...extra,
});
const lesson = (assets: Asset[], clips: Clip[]): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets,
  tracks: [
    { id: "t", kind: "video", name: "Faixa", muted: false, hidden: false, locked: false },
    { id: "m", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
  ],
  clips,
});
const drawingClip = (id: string, inPoint: number, duration: number): Clip => ({
  id,
  assetId: "d",
  trackId: "t",
  start: inPoint,
  in: inPoint,
  duration,
  volume: 0,
  annotation: { kind: "drawing", color: "#FF4D4D" },
});

test("P0-1: apagar tudo antes do primeiro traço não leva nenhum momento para antes de 0", () => {
  const replay = {
    strokes: [
      {
        qpc: q + 5000,
        color: "#ff0000",
        width: 8,
        points: [
          [0.1, 0.1, 0],
          [0.2, 0.2, 100],
        ] as [number, number, number][],
      },
    ],
    clears: [q + 3000, q + 7000],
  };
  const d = drawingInTake(replay, segments);
  assert.ok(d);
  // The wipe before anything was drawn takes nothing away and is left out.
  assert.deepEqual(d.clears, [7]);
  const span = drawingSpan(d, 10);
  assert.ok(span);
  const own = shiftDrawing(d, -span[0]);
  assert.ok(own.clears.every((c) => c >= 0));
  assert.ok(projectSchema.safeParse(lesson([drawingAsset(own)], [])).success);
  // And a drawing of before, with a moment under 0, is made sound when the lesson opens.
  const broken: Drawing = {
    strokes: [{ t: 0, color: "#ff0000", width: 8, points: [[0.1, 0.1, 0]] }],
    clears: [-2, 1],
    boards: [{ start: -0.5, end: 3, color: "#FFFFFF" }],
    pages: [-1],
  };
  const opened = normalizeProject(projectSchema.parse(lesson([drawingAsset(broken)], [])));
  const fixed = opened.assets[0].drawing;
  assert.deepEqual(fixed?.clears, [1]);
  assert.deepEqual(fixed?.pages, []);
  assert.deepEqual(fixed?.boards, [{ start: 0, end: 3, color: "#FFFFFF" }]);
  assert.deepEqual(sanitizeDrawing(fixed ?? broken), fixed);
});

test("P0-2: o desenho fica uma vez só, no vídeo dele, e um desenho longo cabe no projeto", () => {
  // 300 strokes of 200 points as the recorder sends them (Float32, rounded on the way in).
  const f = new Float32Array(3);
  const strokes = Array.from({ length: 300 }, (_, s) => ({
    qpc: q + s * 20,
    color: "#FF4D4D",
    width: 8,
    points: Array.from({ length: 200 }, (_, i): [number, number, number] => {
      f.set([Math.random(), Math.random(), i * 8.3]);
      return [f[0], f[1], Math.round(f[2])];
    }),
  }));
  const d = drawingInTake({ strokes, clears: [] }, [{ start: q, duration: 30 }]);
  assert.ok(d);
  // Positions to ten-thousandths of the frame.
  for (const s of d.strokes)
    for (const [x, y] of s.points) {
      assert.equal(Math.round(x * 1e4) / 1e4, x);
      assert.equal(Math.round(y * 1e4) / 1e4, y);
    }
  const clips = Array.from({ length: 6 }, (_, i) => drawingClip(`c${i}`, i, 1));
  const project = lesson([drawingAsset(d, { duration: 30 })], clips);
  assert.ok(projectSchema.safeParse(project).success);
  // As the project is saved (main/projects.ts): 60 thousand points once, not six times.
  const size = JSON.stringify(project, null, 1).length;
  assert.ok(size < 4 * 2 ** 20, `${(size / 2 ** 20).toFixed(1)} MB`);
  assert.ok(clips.every((c) => !("drawing" in (c.annotation ?? {}))));
});

test("P0-2: mais de 5000 traços ou pontos demais são limitados, com aviso, e o projeto salva", () => {
  const strokes = Array.from({ length: MAX_STROKES + 1 }, (_, i) => ({
    qpc: q + i * 10,
    color: "#FF4D4D",
    width: 8,
    points: Array.from({ length: 60 }, (_, k): [number, number, number] => [k / 60, 0.5, k * 8]),
  }));
  const warnings: string[] = [];
  const d = drawingInTake({ strokes, clears: [] }, [{ start: q, duration: 120 }], warnings);
  assert.ok(d);
  assert.equal(d.strokes.length, MAX_STROKES);
  assert.ok(d.strokes.reduce((n, s) => n + s.points.length, 0) <= MAX_DRAWING_POINTS);
  assert.ok(d.strokes.every((s) => s.points.length >= 2));
  assert.equal(warnings.length, 2, warnings.join(" | "));
  assert.match(warnings[0], /1 últimos ficaram de fora/);
  assert.match(warnings[1], /simplificados/);
  const project = lesson([drawingAsset(d, { duration: 120 })], [drawingClip("c", 0, 3)]);
  assert.ok(projectSchema.safeParse(project).success);
  assert.ok(JSON.stringify(project).length < 8 * 2 ** 20);
  // What is within the limits stays as it was.
  const small: Drawing = {
    strokes: [{ t: 1, color: "#fff", width: 4, points: [[0.12345, 0.5, 0]] }],
    clears: [],
  };
  assert.deepEqual(limitDrawing(small).cut, { strokes: 0, thinned: false });
});

test("P0-2: um projeto de antes, com o desenho em cada clipe, passa a guardá-lo no vídeo", () => {
  const d: Drawing = {
    strokes: [{ t: 0, color: "#ff0000", width: 8, points: [[0.1, 0.1, 0]] }],
    clears: [],
  };
  const old = lesson(
    [drawingAsset(d, { drawing: undefined })],
    [0, 1].map((i) => ({
      ...drawingClip(`c${i}`, i, 1),
      annotation: { kind: "drawing" as const, color: "#FF4D4D", drawing: d },
    })),
  );
  const opened = normalizeProject(projectSchema.parse(old));
  assert.deepEqual(opened.assets[0].drawing, d);
  for (const c of opened.clips) assert.equal("drawing" in (c.annotation ?? {}), false);
});

test("P1-4: a lista de traços de um clipe só tem os que ele mostra (apagar, página, quadro)", () => {
  const stroke = (t: number) => ({
    t,
    color: "#000",
    width: 8,
    points: [[0.1, 0.1, 0] as [number, number, number], [0.2, 0.2, 0.2]],
  });
  const d: Drawing = {
    strokes: [stroke(0.5), stroke(2.5), stroke(4.5), stroke(6.5)],
    clears: [2],
    boards: [{ start: 4, end: 8, color: "#FFFFFF" }],
    pages: [6],
  };
  // The clip of the first page of the board: not the stroke wiped at 2 s, nor the one before
  // the board, nor the one of the next page.
  assert.deepEqual(strokesIn(d, 4, 6), [2]);
  assert.deepEqual(strokesIn(d, 6, 8), [3]);
  assert.deepEqual(strokesIn(d, 0, 2), [0]);
  assert.deepEqual(strokesIn(d, 2, 4), [1]);
  assert.deepEqual(
    drawingParts(d, [0, 8]).map((p) => [p.kind, p.from, p.to]),
    [
      ["drawing", 0, 4],
      ["board", 4, 6],
      ["board", 6, 8],
    ],
  );
});

test("P1-3: o vídeo do desenho olha só os quadros que mudam e segura cada um até o próximo", () => {
  const d: Drawing = {
    strokes: [
      {
        t: 1,
        color: "#000",
        width: 8,
        points: [
          [0.1, 0.1, 0],
          [0.2, 0.2, 0.1],
        ],
      },
    ],
    clears: [20],
  };
  const total = 30 * 60 * 30;
  const frames = drawingChangeFrames(d, 30, total);
  // 30 minutes at 30 fps: a handful of frames, not 54 thousand.
  assert.deepEqual(frames, [0, 30, 31, 32, 33, 600]);
  const list = drawingConcat(
    frames.map((at, i) => ({ path: `C:\\cache\\q'${i}.png`, at })),
    total,
    30,
  );
  const lines = list.trim().split("\n");
  assert.equal(lines[0], "ffconcat version 1.0");
  assert.equal(lines[1], "file 'C:/cache/q'\\''0.png'");
  assert.equal(lines[2], "option framerate 30");
  assert.equal(lines[3], "duration 1.000000");
  // The last picture until the end, its last frame listed on its own.
  assert.deepEqual(lines.slice(-6), [
    "file 'C:/cache/q'\\''5.png'",
    "option framerate 30",
    `duration ${((total - 600 - 1) / 30).toFixed(6)}`,
    "file 'C:/cache/q'\\''5.png'",
    "option framerate 30",
    `duration ${(1 / 30).toFixed(6)}`,
  ]);
});

test("Lote 13: os clipes do desenho entram no grupo do clipe de tela em que estão", () => {
  const screens: Clip[] = [
    { id: "s1", assetId: "tela", trackId: "m", start: 0, in: 0, duration: 5, volume: 1 },
    {
      id: "s2",
      assetId: "tela",
      trackId: "m",
      start: 6,
      in: 6,
      duration: 4,
      volume: 1,
      groupId: "g-old",
    },
  ];
  let n = 0;
  const { clips, placed } = groupWithScreens(
    screens,
    [
      { clip: drawingClip("d1", 1, 2), screen: "s1" },
      { clip: drawingClip("d2", 7, 2), screen: "s2" },
    ],
    () => `g${++n}`,
  );
  assert.equal(clips[0].groupId, "g1");
  assert.equal(clips[1].groupId, "g-old");
  assert.deepEqual(
    placed.map((c) => c.groupId),
    ["g1", "g-old"],
  );
});

test("Lote 13: o pacote leva o desenho no projeto e desenha o vídeo de novo", () => {
  const d: Drawing = {
    strokes: [{ t: 0, color: "#ff0000", width: 8, points: [[0.1, 0.1, 0]] }],
    clears: [],
  };
  const plan = packPlan(lesson([drawingAsset(d)], [drawingClip("c", 0, 1)]));
  assert.equal(plan.files.length, 0, "o vídeo é um cache, desenhado de novo");
  assert.deepEqual(plan.project.assets[0].drawing, d);
  assert.match(plan.project.assets[0].path, /^media\//);
});

test("Lote 13: substituir a gravação leva os trechos do cursor e a ponta da caneta do desenho", () => {
  const screen: Asset = {
    id: "tela",
    name: "Tela",
    path: "C:/aula/tela.mp4",
    kind: "video",
    duration: 20,
    width: 1920,
    height: 1080,
    fps: 30,
    hasVideo: true,
    hasAudio: true,
    size: 1,
    proxyStatus: "none",
    cursor: "C:/aula/cursor.json",
    cursorFx: {
      ...DEFAULT_CURSOR_FX,
      ranges: [{ id: "r", start: 4, end: 6, fx: { spotlight: true } }],
    },
  };
  const drawing: Drawing = {
    strokes: [{ t: 0, color: "#ff0000", width: 8, points: [[0.1, 0.1, 0]] }],
    clears: [],
    boards: [{ start: 0, end: 2, color: "#FFFFFF" }],
    pointer: { assetId: "tela", offset: 3 },
  };
  const p = lesson(
    [screen, drawingAsset(drawing)],
    [{ id: "s", assetId: "tela", trackId: "m", start: 0, in: 0, duration: 20, volume: 1 }],
  );
  const next: Asset = { ...screen, id: "tela2", path: "C:/aula/tela2.mp4" };
  const later = (s: number): number => s + 1;
  const { project, warnings } = replaceAsset(p, "tela", next, later);
  const placed = project.assets.find((a) => a.id === "tela2");
  assert.deepEqual(
    placed?.cursorFx?.ranges?.map((r) => [r.start, r.end]),
    [[5, 7]],
  );
  const d = project.assets.find((a) => a.id === "d")?.drawing;
  assert.deepEqual(d?.pointer, { assetId: "tela2", offset: 4 });
  assert.ok(
    warnings.some((w) => /desenho/.test(w)),
    warnings.join(" | "),
  );
});

test("P1-7: Lado a lado leva os traços do take com a tela e devolve o lugar de antes", () => {
  const asset = (id: string, role: "screen" | "camera" | "drawing"): Asset => ({
    id,
    name: id,
    path: `${id}.mp4`,
    kind: "video",
    duration: 60,
    width: role === "camera" ? 1280 : 1920,
    height: role === "camera" ? 720 : 1080,
    fps: 30,
    hasVideo: true,
    hasAudio: false,
    size: 1,
    proxyStatus: "none",
    recording: { id: "take", role },
  });
  const moved = { x: 0.4, y: 0.45, scale: 0.9, rotation: 0, opacity: 1 };
  const project: Project = {
    ...lesson([asset("tela", "screen"), asset("cam", "camera"), asset("traço", "drawing")], []),
    clips: [
      { id: "c", assetId: "cam", trackId: "t", start: 0, in: 0, duration: 10, volume: 0 },
      {
        id: "s",
        assetId: "tela",
        trackId: "m",
        start: 0,
        in: 0,
        duration: 10,
        volume: 1,
        transform: moved,
      },
      { id: "d", assetId: "traço", trackId: "t", start: 2, in: 0, duration: 3, volume: 0 },
    ],
  };
  const byId = (p: Project, id: string) => p.clips.find((c) => c.id === id);
  const side = frameCamera(project, "cam", "side");
  const beside = screenBesideCamera(project.assets[0], project.settings);
  assert.deepEqual(byId(side, "s")?.transform, beside);
  assert.deepEqual(byId(side, "d")?.transform, beside);
  const back = frameCamera(side, "cam", "circle");
  assert.deepEqual(byId(back, "s")?.transform, moved);
  assert.equal(byId(back, "d")?.transform, undefined);
  assert.equal(byId(back, "s")?.besideFrom, undefined);
});

const base = {
  version: 2,
  width: 1920,
  height: 1080,
  moves: [[0, 500, 500, 0]],
  clicks: [],
  wheel: [],
  keys: [],
  typing: [],
  markers: [],
  pauses: [],
  hidden: [],
  gaps: [],
};

test("P1-6: o desenho é uma fronteira do zoom automático, e nada nele vira zoom", () => {
  let data = normalizeCursorData({
    ...base,
    clicks: [
      [10, 400, 400, 0, 0],
      [11.5, 900, 500, 0, 0],
      [12.5, 950, 520, 0, 0],
      [13.5, 600, 600, 0, 0],
    ],
  });
  data = dropDrawingClicks(data, [[11, 13]]);
  const zooms = autoZooms(data, 60, DEFAULT_AUTO_ZOOM);
  assert.equal(zooms.length, 2);
  // Neither crosses the drawing (11 to 13 s).
  for (const z of zooms) assert.ok(z.end <= 11 || z.start >= 13, `${z.start}..${z.end}`);
  // Typing while drawing (the board's keys) makes no zoom either.
  const typed = normalizeCursorData({
    ...base,
    drawing: [[20, 30]],
    typing: [22, 24, 26],
    caret: [[21, 800, 300, 2, 20]],
  });
  assert.deepEqual(autoZooms(typed, 60, DEFAULT_AUTO_ZOOM), []);
  // Nor a change of the screen under the board.
  assert.deepEqual(
    sceneZooms([5, 40], typed, 60, []).map((z) => [z.start, z.end]),
    [
      [5.3, 8.3],
      [40.3, 43.3],
    ],
  );
  assert.deepEqual(sceneZooms([25], typed, 60, []), []);
  assert.deepEqual(sceneZooms([5], null, 60, [], { exclude: [[4, 9]] }), []);
});

test("P1-8: o zoom automático de novo não repete ids nem cobre um zoom editado", () => {
  const data = normalizeCursorData({ ...base, clicks: [[10, 400, 400, 0, 0]] });
  let n = 0;
  const id = (): string => `z${++n}`;
  const first = autoZooms(data, 60, DEFAULT_AUTO_ZOOM, id);
  const edited = moveZoomEdge(first, first[0].id, "end", 15, 60) ?? [];
  assert.equal(edited[0].auto, undefined);
  const again = replaceAutoZooms(edited, autoZooms(data, 60, DEFAULT_AUTO_ZOOM, id));
  assert.equal(again.length, 1, "o automático novo cairia em cima do editado");
  assert.equal(new Set(again.map((z) => z.id)).size, again.length);
  const elsewhere = replaceAutoZooms(edited, [
    { id: "z9", start: 30, end: 33, scale: 1.8, focus: [], auto: true },
  ]);
  assert.deepEqual(
    elsewhere.map((z) => z.id),
    [first[0].id, "z9"],
  );
});

test("P2: puxar a ponta de um zoom que passou do fim da mídia mantém o fim depois do início", () => {
  const out = moveZoomEdge(
    [{ id: "a", start: 70, end: 75, scale: 2, focus: [] }],
    "a",
    "end",
    72,
    60,
  );
  assert.ok(out && out[0].end > out[0].start, JSON.stringify(out));
});

test("P1-11 e P1-12: cursor escondido com um trecho que o mostra; o clique só soa onde aparece", () => {
  const fx = {
    ...DEFAULT_CURSOR_FX,
    hidden: true,
    clickSound: true,
    ranges: [{ id: "r", start: 2, end: 4, fx: { hidden: false } }],
  };
  // Drawn where the stretch shows it (cursorRender skips only what is hidden everywhere).
  assert.deepEqual(
    fxWhere(fx, (f) => !f.hidden, 10),
    [[2, 4]],
  );
  const clicks = {
    clicks: [
      [3, 1, 1, 0, 0.05] as [number, number, number, number, number],
      [6, 1, 1, 0, 0.05] as [number, number, number, number, number],
    ],
  };
  assert.deepEqual(clickSoundTimes(clicks, fx), [3]);
  assert.deepEqual(clickSoundTimes(clicks, { ...fx, ranges: [] }), []);
});

test("P1-10: o ganho de volume da tela não vale para o som de clique", () => {
  const project: Project = {
    ...lesson(
      [
        {
          id: "a",
          name: "Tela",
          path: "C:/aula/tela.mp4",
          kind: "video",
          duration: 10,
          width: 1920,
          height: 1080,
          fps: 30,
          hasVideo: true,
          hasAudio: true,
          size: 1,
          proxyStatus: "none",
          cursor: "C:/aula/cursor.json",
          cursorFx: { ...DEFAULT_CURSOR_FX, clickSound: true },
        },
      ],
      [{ id: "c", assetId: "a", trackId: "m", start: 0, in: 0, duration: 6, volume: 1 }],
    ),
  };
  const cursors = {
    a: {
      sprite: "C:/s.webm",
      size: 240,
      fps: 30,
      positions: new Int32Array(600),
      clicks: "C:/cache/clicks.flac",
    },
  };
  const plan = buildAudioPlan(project, { cursors }, { gains: { a: 12 } });
  const volumes = plan.filter.match(/volume=[\d.]+/g) ?? [];
  // The clicks at 1; the screen's own sound with its +12 dB.
  assert.deepEqual(volumes.sort(), ["volume=1", "volume=3.981"]);
});

test("P2: a fixação no clique acerta o ponto e não passa do que foi gravado", () => {
  for (const held of [0, 0.002])
    for (const smooth of [0.5, 0.95]) {
      const tc = 2.0037;
      // The pointer comes fast to the button, clicks, and goes on fast the other way.
      const moves: [number, number, number, number][] = [[0, 200, 900, 0]];
      for (let i = 1; i <= 19; i++)
        moves.push([
          tc - 0.15 + (0.15 * i) / 19,
          Math.round(200 + (1300 * i) / 19),
          Math.round(900 - (600 * i) / 19),
          0,
        ]);
      for (let i = 1; i <= 20; i++) moves.push([tc + 0.008 * i, 1500 + 40 * i, 300, 0]);
      const data = normalizeCursorData({
        ...base,
        moves,
        clicks: [[tc, 1500, 300, 0, held]],
      });
      const track = buildTrack(data, { ...DEFAULT_CURSOR_FX, smooth }, 4);
      const at = cursorAt(track, tc);
      assert.ok(
        Math.hypot(at.x - 1500, at.y - 300) < 0.5,
        `held ${held}, smooth ${smooth}: ${at.x}, ${at.y}`,
      );
      // Right before the click it is already arriving, not still far behind.
      const before = cursorAt(track, tc - 0.02);
      assert.ok(Math.hypot(before.x - 1500, before.y - 300) < 250, `${before.x}, ${before.y}`);
      let farthest = 0;
      for (let t = tc; t < 3; t += 0.001) farthest = Math.max(farthest, cursorAt(track, t).x);
      assert.ok(farthest <= 2300 + 1, `passou do gravado: ${farthest}`);
    }
});
