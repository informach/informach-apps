import assert from "node:assert/strict";
import { test } from "node:test";
import { CLICK_RATE, clickSamples, fillClicks } from "../src/shared/clickSound.ts";
import {
  buildTrack,
  type CursorFx,
  clickSoundTimes,
  cursorAt,
  cursorFxId,
  DEFAULT_CURSOR_FX,
  fxAt,
  fxIntervals,
  fxWhere,
  magnifierSide,
  magnifierSource,
  ripplesAt,
  spriteSize,
} from "../src/shared/cursor.ts";
import { type CursorData, normalizeCursorData } from "../src/shared/cursorData.ts";
import { buildAudioPlan } from "../src/shared/export/audioPlan.ts";
import { buildExportPlan } from "../src/shared/exportPlan.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import { CURSOR_SHAPES } from "../src/shared/recording.ts";
import type { Project } from "../src/shared/types.ts";

/** A pointer resting at `from`, then a quick straight move that reaches the click at `tc`. */
function approach(
  from: [number, number],
  to: [number, number],
  tc: number,
  options: { moveSeconds?: number; held?: number } = {},
): CursorData {
  const moves: [number, number, number, number][] = [[0, from[0], from[1], 0]];
  const seconds = options.moveSeconds ?? 0.15;
  // The helper reports a move about every 8 ms; the last one lands on the click.
  const steps = Math.ceil(seconds / 0.008);
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    moves.push([
      tc - seconds + seconds * k,
      Math.round(from[0] + (to[0] - from[0]) * k),
      Math.round(from[1] + (to[1] - from[1]) * k),
      0,
    ]);
  }
  return normalizeCursorData({
    version: 2,
    width: 1920,
    height: 1080,
    moves,
    clicks: [[tc, to[0], to[1], 0, options.held ?? 0.06]],
  });
}

test("the pointer is on the clicked point when it clicks, and never goes past it", () => {
  const worst: number[] = [];
  // A click between two samples of the track (120 per second), from both sides.
  for (const [from, to] of [
    [
      [200, 900],
      [1500, 300],
    ],
    [
      [1600, 200],
      [300, 800],
    ],
  ] as [[number, number], [number, number]][]) {
    const tc = 2.0037;
    const data = approach(from, to, tc);
    for (const smooth of [0, 0.2, 0.5, 0.8, 0.95]) {
      const track = buildTrack(data, { ...DEFAULT_CURSOR_FX, smooth }, 4);
      const at = cursorAt(track, tc);
      const error = Math.hypot(at.x - to[0], at.y - to[1]);
      worst.push(error);
      assert.ok(error < 0.5, `smooth ${smooth}: ${error.toFixed(3)} px from the click`);
      // On the way there it stays between where it was and where it clicks, on each axis.
      for (let t = 0; t <= tc; t += 0.001) {
        const p = cursorAt(track, t);
        for (const axis of [0, 1] as const) {
          const v = axis ? p.y : p.x;
          const lo = Math.min(from[axis], to[axis]) - 1e-3;
          const hi = Math.max(from[axis], to[axis]) + 1e-3;
          assert.ok(v >= lo && v <= hi, `smooth ${smooth}: overshoot at ${t.toFixed(3)} s (${v})`);
        }
      }
    }
  }
  console.log(`[cursor] maior erro no instante do clique: ${Math.max(...worst).toFixed(4)} px`);
});

test("the smoothing has no lag: a steady move is where it was recorded, and a drag stays exact", () => {
  // From x = 0 at 1 s to x = 1000 at 2 s, a move every 8 ms.
  const moves: [number, number, number, number][] = [[0, 0, 500, 0]];
  for (let t = 1; t <= 2.0001; t += 0.008) moves.push([t, Math.round((t - 1) * 1000), 500, 0]);
  const data = normalizeCursorData({ version: 2, width: 1920, height: 1080, moves, clicks: [] });
  const track = buildTrack(data, { ...DEFAULT_CURSOR_FX, smooth: 0.8 }, 3);
  assert.ok(Math.abs(cursorAt(track, 1.5).x - 500) < 6, `${cursorAt(track, 1.5).x}`);
  // The same move as a drag: the button is held, the pointer follows the recording exactly.
  const drag = normalizeCursorData({
    version: 2,
    width: 1920,
    height: 1080,
    moves,
    clicks: [[1, 0, 500, 0, 1]],
  });
  const held = buildTrack(drag, { ...DEFAULT_CURSOR_FX, smooth: 0.8 }, 3);
  for (const t of [1.2, 1.5, 1.8])
    assert.ok(Math.abs(cursorAt(held, t).x - (t - 1) * 1000) < 9, `${cursorAt(held, t).x}`);
});

test("the track keeps the take's own cursor images apart from the standard shapes", () => {
  const data = normalizeCursorData({
    version: 2,
    width: 100,
    height: 100,
    shapes: [
      ...CURSOR_SHAPES.map((id) => ({ id, std: id, w: 0, h: 0, hotX: 0, hotY: 0 })),
      { id: "drag", std: "move", image: "cursors/a.png", w: 32, h: 32, hotX: 1, hotY: 1 },
      { id: "custom", image: "cursors/b.png", w: 16, h: 16, hotX: 0, hotY: 0, inverted: true },
    ],
    moves: [
      [0, 1, 1, CURSOR_SHAPES.indexOf("wait")],
      [1, 2, 2, CURSOR_SHAPES.length],
      [2, 3, 3, CURSOR_SHAPES.length + 1],
      [3, 3, 3, CURSOR_SHAPES.indexOf("nesw")],
    ],
    clicks: [],
  });
  const track = buildTrack(data, { ...DEFAULT_CURSOR_FX, smooth: 0 }, 4);
  assert.deepEqual(
    [0.5, 1.5, 2.5, 3.5].map((t) => {
      const s = cursorAt(track, t);
      return [s.shape, s.index];
    }),
    [
      ["wait", CURSOR_SHAPES.indexOf("wait")],
      ["move", CURSOR_SHAPES.length],
      ["other", CURSOR_SHAPES.length + 1],
      ["nesw", CURSOR_SHAPES.indexOf("nesw")],
    ],
  );
  // A change of pointer drawing (or of the halo's color) is a new sprite for the export.
  const base = cursorFxId(DEFAULT_CURSOR_FX);
  assert.notEqual(cursorFxId({ ...DEFAULT_CURSOR_FX, pointer: "real" }), base);
  assert.equal(cursorFxId({ ...DEFAULT_CURSOR_FX, pointer: "auto" }), base);
  assert.notEqual(
    cursorFxId({ ...DEFAULT_CURSOR_FX, halo: true, haloColor: "#00ff00" }),
    cursorFxId({ ...DEFAULT_CURSOR_FX, halo: true }),
  );
  // The spotlight and the click sound are drawn by the export around the sprite.
  assert.equal(cursorFxId({ ...DEFAULT_CURSOR_FX, spotlight: true, clickSound: true }), base);
  assert.notEqual(cursorFxId({ ...DEFAULT_CURSOR_FX, magnifier: true }), base);
});

test("effects by stretch: the stretch wins inside it, the recording's setting outside", () => {
  const fx: CursorFx = {
    ...DEFAULT_CURSOR_FX,
    halo: true,
    ranges: [
      { id: "a", start: 2, end: 5, fx: { magnifier: true, halo: false } },
      { id: "b", start: 4, end: 6, fx: { clickSound: true, clicks: false } },
    ],
  };
  assert.equal(fxAt(fx, 1).magnifier, undefined);
  assert.equal(fxAt(fx, 3).magnifier, true);
  assert.equal(fxAt(fx, 3).halo, false);
  assert.equal(fxAt(fx, 4.5).clickSound, true);
  assert.equal(fxAt(fx, 4.5).magnifier, true);
  assert.deepEqual(fxIntervals(fx, "magnifier", 10), [[2, 5]]);
  assert.deepEqual(fxIntervals(fx, "halo", 10), [
    [0, 2],
    [5, 10],
  ]);
  assert.deepEqual(
    fxWhere(fx, (f) => !!f.magnifier && !f.clickSound, 10),
    [[2, 4]],
  );
  const data = normalizeCursorData({
    version: 2,
    width: 1920,
    height: 1080,
    moves: [[0, 10, 10, 0]],
    clicks: [
      [1, 10, 10, 0, 0.1],
      [4.5, 10, 10, 0, 0.1],
      [7, 10, 10, 0, 0.1],
    ],
  });
  assert.deepEqual(clickSoundTimes(data, fx), [4.5]);
  // No click ring for a press made where the rings are off.
  assert.equal(ripplesAt(data, 4.6, fx).length, 0);
  assert.equal(ripplesAt(data, 1.1, fx).length, 1);
});

test("the magnifier enlarges a square around the pointer kept inside the frame", () => {
  const data = { width: 1920, height: 1080 };
  const fx: CursorFx = { ...DEFAULT_CURSOR_FX, magnifier: true, magnifierRadius: 0.1 };
  const side = magnifierSide(data, fx);
  assert.equal(side, 108, "2 × 108 px of radius at twice the size");
  assert.deepEqual(magnifierSource(data, fx, 960, 540), { x: 906, y: 486, side });
  assert.deepEqual(magnifierSource(data, fx, 5, 1078), { x: 0, y: 1080 - side, side });
  // The sprite grows to hold the magnifier's ring.
  assert.ok(spriteSize(data, fx) >= 2 * (108 + 6));
  assert.equal(spriteSize(data, DEFAULT_CURSOR_FX), Math.ceil((140 * 1.6) / 2) * 2);
});

test("the click sound is the same written in pieces as written whole", () => {
  const click = clickSamples();
  assert.deepEqual(clickSamples(), click, "made the same every time");
  assert.ok(click.length > 100 && click.length < CLICK_RATE / 10);
  const peak = Math.max(...click.map(Math.abs));
  assert.ok(peak > 0.85 && peak <= 0.9 + 1e-6);
  const times = [0.01, 0.5, 0.99];
  const whole = new Float32Array(CLICK_RATE);
  fillClicks(whole, 0, times, 0.5, click);
  const parts = new Float32Array(CLICK_RATE);
  for (let from = 0; from < CLICK_RATE; from += 7001) {
    const chunk = new Float32Array(Math.min(7001, CLICK_RATE - from));
    fillClicks(chunk, from, times, 0.5, click);
    parts.set(chunk, from);
  }
  assert.deepEqual(parts, whole);
  assert.ok(Math.abs(whole[Math.round(0.5 * CLICK_RATE) + 40]) > 0);
  assert.equal(whole[Math.round(0.3 * CLICK_RATE)], 0);
});

function lesson(fx: CursorFx): Project {
  return {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [
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
        hasAudio: false,
        size: 1,
        proxyStatus: "none",
        cursor: "C:/aula/cursor.json",
        cursorFx: fx,
      },
    ],
    tracks: [{ id: "v", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
    clips: [{ id: "c", assetId: "a", trackId: "v", start: 1, in: 2, duration: 6, volume: 0 }],
  };
}

test("the cursor effects are saved with the project and reach the export's picture and sound", () => {
  const fx: CursorFx = {
    ...DEFAULT_CURSOR_FX,
    pointer: "real",
    halo: true,
    haloColor: "#7c5cff",
    magnifier: true,
    magnifierRadius: 0.1,
    magnifierZoom: 2,
    spotlight: true,
    spotlightRadius: 0.2,
    spotlightDim: 0.6,
    clickSound: true,
    clickVolume: 0.4,
    ranges: [{ id: "r", start: 3, end: 5, fx: { magnifier: false, clickSound: false } }],
  };
  const project = lesson(fx);
  assert.deepEqual(projectSchema.parse(project).assets[0].cursorFx, fx);
  assert.equal(
    projectSchema.safeParse(lesson({ ...fx, pointer: "photo" as CursorFx["pointer"] })).success,
    false,
  );
  const positions = new Int32Array(300 * 2).fill(800);
  const cursors = {
    a: {
      sprite: "C:/cache/cursor-x.webm",
      size: 240,
      fps: 30,
      positions,
      magnifier: {
        radius: 108,
        side: 108,
        on: [[0, 3] as [number, number], [5, 10]] as [number, number][],
      },
      spotlight: {
        picture: "C:/cache/spot.png",
        width: 1920,
        height: 1080,
        on: [[0, 10]] as [number, number][],
      },
      clicks: "C:/cache/clicks-x.flac",
    },
  };
  const plan = buildExportPlan(project, {
    outPath: "C:/saida/aula.mp4",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 8000,
    normalizeLoudness: false,
    encoder: "x264",
    cursors,
  });
  assert.match(plan.filter, /crop=w=108:h=108:x='clip\(/);
  assert.match(plan.filter, /geq=lum='lum\(X,Y\)'/);
  // The magnifier only while it is on, in seconds of the clip (it shows source 2 to 8): source
  // 0 to 3 is clip -2 to 1, and source 5 to 10 is clip 3 to 8.
  assert.match(plan.filter, /enable='\(between\(t,-2,1\)\+between\(t,3,8\)\)'/);
  assert.match(plan.filter, /scale=3840:2160/);
  assert.ok(plan.inputArgs.includes("C:/cache/spot.png"));
  // The click sound plays with the clip, at its own level, even though the screen is silent.
  const audio = buildAudioPlan(project, { cursors });
  assert.ok(audio.inputArgs.includes("C:/cache/clicks-x.flac"));
  assert.match(audio.filter, /volume=1,/);
  assert.equal(buildAudioPlan(project, {}).inputArgs.length, 0);
});
