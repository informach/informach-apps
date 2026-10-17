import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTrack,
  cursorAt,
  cursorControls,
  cursorFxId,
  cursorPathAt,
  cursorPathGeometry,
  DEFAULT_CURSOR_FX,
  insertCursorPoint,
  nearestCursorTime,
  normalizeCursorPath,
  recordedCursorPath,
  ripplesAt,
  spritePositions,
} from "../src/shared/cursor.ts";
import { type CursorData, retakeCuts } from "../src/shared/recording.ts";
import { sourceAt } from "../src/shared/timeline.ts";
import { autoZooms, type Zoom, zoomAt, zoomExprs } from "../src/shared/zoom.ts";

const data: CursorData = {
  version: 1,
  width: 1920,
  height: 1080,
  moves: [
    [0, 100, 100, 0],
    [1, 960, 540, 4],
    [2.5, 1500, 300, 0],
    [5, 960, 540, 4],
  ],
  clicks: [
    [1.2, 960, 540, 0, 0.05],
    [2.0, 980, 560, 0, 0.8],
    [12, 200, 900, 0, 0.05],
  ],
  wheel: [],
  markers: [],
};

test("manual cursor path reaches its anchors, interpolates smoothly and preserves original movement outside", () => {
  const path = [
    { t: 1, x: 200, y: 300 },
    { t: 3, x: 1000, y: 700 },
  ];
  const fx = { ...DEFAULT_CURSOR_FX, path };
  const raw = buildTrack(data, DEFAULT_CURSOR_FX, 6);
  const edited = buildTrack(data, fx, 6);
  assert.deepEqual(cursorAt(edited, 0.5), cursorAt(raw, 0.5));
  assert.deepEqual(cursorAt(edited, 4), cursorAt(raw, 4));
  assert.equal(cursorAt(edited, 1).x, 200);
  assert.equal(cursorAt(edited, 3).y, 700);
  assert.equal(cursorAt(edited, 2).x, 600);
  assert.equal(cursorAt(edited, 2).y, 500);
  const positions = spritePositions(edited, 30, 6, 100);
  assert.deepEqual(
    Array.from(positions.slice(120, 122)),
    [550, 450],
    "export sprite follows the edited preview",
  );
  const ripple = ripplesAt(data, 2.1, fx).find((r) => Math.abs(r.progress - 0.1 / 0.45) < 1e-6)!;
  assert.equal(ripple.x, 600);
  assert.equal(ripple.y, 500);
  assert.deepEqual(cursorPathAt(path, sourceAt({ start: 10, in: 1, speed: 2 }, 10.5)), {
    x: 600,
    y: 500,
  });
  assert.deepEqual(data.moves[0], [0, 100, 100, 0], "original recording remains unchanged");
});

test("cursor path validation sorts, clamps, removes invalid points and resolves duplicate times", () => {
  const out = normalizeCursorPath(
    [
      { t: 9, x: 999, y: -2 },
      { t: 1, x: 20, y: 30 },
      { t: 1, x: 40, y: 50 },
      { t: NaN, x: 0, y: 0 },
    ],
    100,
    80,
    5,
  );
  assert.deepEqual(out, [
    { t: 1, x: 40, y: 50 },
    { t: 5, x: 100, y: 0 },
  ]);
  assert.equal(cursorPathAt(out, 0), null);
  assert.equal(cursorPathAt(out, 6), null);
});

test("deleting endpoint anchors holds the edited cursor through the whole selected interval", () => {
  const fx = {
    ...DEFAULT_CURSOR_FX,
    pathEdits: [
      {
        start: 1,
        end: 5,
        points: [
          { t: 2, x: 200, y: 300 },
          { t: 4, x: 600, y: 700 },
        ],
      },
    ],
  };
  const track = buildTrack(data, fx, 6);
  const original = buildTrack(data, DEFAULT_CURSOR_FX, 6);
  assert.equal(cursorAt(track, 1.5).x, 200, "before first remaining point, hold the edited start");
  assert.equal(cursorAt(track, 4.5).x, 600, "after last remaining point, hold the edited end");
  assert.equal(cursorAt(track, 4.5).y, 700);
  assert.deepEqual(
    cursorAt(track, 5.5),
    cursorAt(original, 5.5),
    "outside the interval stays original",
  );
  const positions = spritePositions(track, 30, 6, 100);
  assert.deepEqual(
    Array.from(positions.slice(270, 272)),
    [550, 650],
    "export holds the same final position",
  );
  const click = ripplesAt({ ...data, clicks: [[4.5, 999, 999, 0, 0.1]] }, 4.6, fx)[0];
  assert.equal(click.x, 600);
  assert.equal(click.y, 700);
});

test("insert a cursor point at the clicked curve without duplicates or loss of neighboring handles", () => {
  const path = [
    { t: 10, x: 100, y: 100, outHandle: { x: 0, y: 200 } },
    { t: 14, x: 500, y: 100, inHandle: { x: 0, y: 200 } },
  ];
  const time = nearestCursorTime(path, 300, 250)!;
  assert.equal(time, 12);
  const inserted = insertCursorPoint(path, time);
  assert.equal(inserted.length, 3);
  assert.deepEqual(inserted[1], {
    t: 12,
    x: 300,
    y: 250,
    inHandle: { x: -100, y: 0 },
    outHandle: { x: 100, y: 0 },
  });
  assert.deepEqual(inserted[0].outHandle, { x: 0, y: 100 });
  assert.deepEqual(inserted[2].inHandle, { x: 0, y: 100 });
  assert.equal(insertCursorPoint(inserted, 12), inserted);
  assert.equal(insertCursorPoint(path, 9), path);
  assert.equal(path.length, 2);
  const removed = inserted.filter((p) => p.t !== 12);
  assert.ok(cursorPathAt(removed, 12), "remaining points still form a playable path");
});

test("interval edits and restoration preserve cursor paths outside the selected source range", () => {
  const base = {
    ...DEFAULT_CURSOR_FX,
    path: [
      { t: 0, x: 100, y: 100 },
      { t: 6, x: 100, y: 100 },
    ],
  };
  const fx = {
    ...base,
    pathEdits: [
      {
        start: 2,
        end: 4,
        points: [
          { t: 2, x: 300, y: 400 },
          { t: 4, x: 500, y: 400 },
        ],
      },
    ],
  };
  const edited = buildTrack(data, fx, 6);
  assert.equal(cursorAt(edited, 1).x, 100);
  assert.equal(cursorAt(edited, 5).x, 100);
  assert.equal(cursorAt(edited, 3).x, 400);
  const restoredFx = { ...fx, pathEdits: [...fx.pathEdits, { start: 2.5, end: 3.5, points: [] }] };
  const restored = buildTrack(data, restoredFx, 6);
  const original = buildTrack(data, DEFAULT_CURSOR_FX, 6);
  assert.deepEqual(cursorAt(restored, 3), cursorAt(original, 3));
  assert.deepEqual(cursorAt(restored, 2.25), cursorAt(edited, 2.25));
  assert.equal(cursorAt(restored, 5).x, 100);
  assert.notEqual(cursorFxId(base), cursorFxId(fx));
  assert.notEqual(cursorFxId(fx), cursorFxId(restoredFx));
});

test("opening a recording produces a visible editable path preserving turns and pauses within the clip", () => {
  const track = buildTrack(data, DEFAULT_CURSOR_FX, 6);
  const points = recordedCursorPath(track, 0.5, 5.5);
  assert.ok(points.length > 2);
  assert.equal(points[0].t, 0.5);
  assert.equal(points.at(-1)!.t, 5.5);
  assert.match(cursorPathGeometry(points), / C /);
  for (let i = 0; i <= 60; i++) {
    const t = 0.5 + i / 12;
    const expected = cursorAt(track, t);
    const actual = cursorPathAt(points, t)!;
    assert.ok(Math.hypot(expected.x - actual.x, expected.y - actual.y) <= 6.001);
  }
  const still = buildTrack(
    { ...data, moves: [[0, 100, 100, 0]], clicks: [] },
    DEFAULT_CURSOR_FX,
    6,
  );
  assert.equal(
    recordedCursorPath(still, 1, 4).length,
    2,
    "stationary recordings still have editable endpoints",
  );
});

test("Bezier handles shape the rendered path, preview, click rings and export positions identically", () => {
  const path = [
    { t: 0, x: 100, y: 100, outHandle: { x: 0, y: 200 } },
    { t: 2, x: 500, y: 100, inHandle: { x: 0, y: 200 } },
  ];
  assert.equal(cursorPathGeometry(path), "M 100 100 C 100 300 500 300 500 100");
  assert.deepEqual(cursorPathAt(path, 1), { x: 300, y: 250 });
  const fx = { ...DEFAULT_CURSOR_FX, path };
  const track = buildTrack(data, fx, 6);
  assert.equal(cursorAt(track, 1).y, 250);
  const positions = spritePositions(track, 30, 6, 100);
  assert.deepEqual(Array.from(positions.slice(60, 62)), [250, 200]);
  const ripple = ripplesAt({ ...data, clicks: [[1, 0, 0, 0, 0.1]] }, 1.1, fx)[0];
  assert.equal(ripple.x, 300);
  assert.equal(ripple.y, 250);
  assert.deepEqual(normalizeCursorPath(path, 1920, 1080, 6), path);
  const moved = { ...path[0], x: 200 };
  assert.deepEqual(cursorControls(moved, path[1])[0], { x: 200, y: 300 });
  assert.notEqual(
    cursorFxId(fx),
    cursorFxId({ ...fx, path: [{ ...path[0], outHandle: { x: 0, y: 201 } }, path[1]] }),
  );
});

test("edited paths invalidate cached cursor videos; restoring the original restores its cache identity", () => {
  const original = cursorFxId(DEFAULT_CURSOR_FX);
  const path = [
    { t: 1, x: 200, y: 300 },
    { t: 3, x: 1000, y: 700 },
  ];
  const edited = cursorFxId({ ...DEFAULT_CURSOR_FX, path });
  assert.notEqual(edited, original);
  assert.notEqual(
    edited,
    cursorFxId({ ...DEFAULT_CURSOR_FX, path: [{ ...path[0], x: 201 }, path[1]] }),
  );
  assert.equal(cursorFxId({ ...DEFAULT_CURSOR_FX, path: undefined }), original);
  assert.equal(cursorFxId({ ...DEFAULT_CURSOR_FX, path: structuredClone(path) }), edited);
});

test("the pointer track follows the recorded moves, smoothly when asked", () => {
  const raw = buildTrack(data, { ...DEFAULT_CURSOR_FX, smooth: 0 }, 6);
  assert.deepEqual([cursorAt(raw, 1.5).x, cursorAt(raw, 1.5).y], [960, 540]);
  assert.equal(cursorAt(raw, 1.5).shape, "hand");
  const smooth = buildTrack(data, { ...DEFAULT_CURSOR_FX, smooth: 0.8 }, 6);
  const mid = cursorAt(smooth, 1.02);
  assert.ok(mid.x > 100 && mid.x < 960, "still travelling right after the jump");
  assert.ok(Math.abs(cursorAt(smooth, 2.4).x - 960) < 2, "settles on the target");
  assert.equal(ripplesAt(data, 1.3).length, 1);
  assert.equal(ripplesAt(data, 3).length, 0);
  const pos = spritePositions(raw, 30, 2, 100);
  assert.deepEqual([pos[45 * 2], pos[45 * 2 + 1]], [910, 490], "sprite centered on the hotspot");
});

test("the pointer fades out when idle and comes back on a click", () => {
  const t = buildTrack(data, { ...DEFAULT_CURSOR_FX, smooth: 0, hideIdle: true }, 14);
  assert.equal(cursorAt(t, 2).alpha, 1);
  assert.equal(cursorAt(t, 10).alpha, 0);
  assert.equal(cursorAt(t, 12.5).alpha, 1);
});

test("automatic zoom: one zoom per burst of clicks, following a drag to its release", () => {
  const z = autoZooms(data, 14);
  assert.equal(z.length, 2);
  assert.ok(z[0].start < 1.2 && z[0].end > 2.8);
  assert.equal(z[0].focus.length, 3, "two clicks and the end of the drag");
  assert.ok(Math.abs(z[0].focus[2].x - 1500 / 1920) < 0.01);
  assert.ok(z[1].start > 10);
});

test("zoom curve: eases in and out, stays inside the frame", () => {
  const zooms: Zoom[] = [
    { id: "a", start: 10, end: 14, scale: 2, focus: [{ t: 10, x: 0.95, y: 0.5 }] },
  ];
  assert.deepEqual(zoomAt(zooms, 9), { scale: 1, cx: 0.5, cy: 0.5 });
  const mid = zoomAt(zooms, 12);
  assert.equal(mid.scale, 2);
  assert.equal(mid.cx, 0.75, "clamped so the view never leaves the picture");
  const easing = zoomAt(zooms, 10.35);
  assert.ok(easing.scale > 1 && easing.scale < 2);
});

/** Evaluates an ffmpeg expression in JS (the functions used by zoomExprs). */
function evalFf(expr: string, t: number): number {
  const fns: Record<string, (...a: number[]) => number> = {
    iff: (c, a, b) => (c ? a : b),
    between: (x, a, b) => (x >= a && x <= b ? 1 : 0),
    lt: (a, b) => (a < b ? 1 : 0),
    lte: (a, b) => (a <= b ? 1 : 0),
    clip: (x, a, b) => Math.min(b, Math.max(a, x)),
    min: Math.min,
  };
  const js = expr.split("if(").join("iff(");
  return new Function(...Object.keys(fns), "T", "return " + js)(...Object.values(fns), t) as number;
}

test("the export expression gives the same view as the preview", () => {
  const zooms: Zoom[] = [
    {
      id: "a",
      start: 1,
      end: 6,
      scale: 1.8,
      focus: [
        { t: 1.5, x: 0.2, y: 0.3 },
        { t: 3, x: 0.7, y: 0.6 },
        { t: 4, x: 0.9, y: 0.95 },
      ],
    },
    { id: "b", start: 8, end: 9, scale: 2.4, focus: [{ t: 8.2, x: 0.5, y: 0.5 }] },
  ];
  const e = zoomExprs(zooms, "T");
  for (const t of [0, 1.1, 1.6, 2.2, 3.5, 4.5, 5.8, 8.3, 8.5, 10]) {
    const v = zoomAt(zooms, t);
    assert.ok(Math.abs(evalFf(e.scale, t) - v.scale) < 1e-3, `scale at ${t}`);
    assert.ok(Math.abs(evalFf(e.cx, t) - v.cx) < 1e-3, `cx at ${t}`);
    assert.ok(Math.abs(evalFf(e.cy, t) - v.cy) < 1e-3, `cy at ${t}`);
  }
});

test("Ctrl+R cuts from the pause before the flubbed passage to the pause after the key press", () => {
  // 100 values per second: speech 0–2 s, pause 2–2.6 s, flubbed passage 2.6–5 s (key at 5.2), pause 5–6 s, new take.
  const peaks = Array.from({ length: 900 }, (_, i) =>
    (i >= 200 && i < 260) || (i >= 500 && i < 600) ? 0.01 : 0.5,
  );
  const cuts = retakeCuts([{ t: 5.2, kind: "retake" }], peaks, 100);
  assert.equal(cuts.length, 1);
  assert.ok(
    Math.abs(cuts[0][0] - 2.3) < 0.02 && Math.abs(cuts[0][1] - 5.5) < 0.02,
    `got ${cuts[0]}`,
  );
});
