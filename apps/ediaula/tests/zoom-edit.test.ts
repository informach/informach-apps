import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { normalizeCursorData } from "../src/shared/cursorData.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import type { Project } from "../src/shared/types.ts";
import {
  autoZooms,
  focusIndexAt,
  MIN_ZOOM_LENGTH,
  moveZoomEdge,
  parseSceneChanges,
  removeZoom,
  sceneArgs,
  sceneZooms,
  setZoomFocus,
  updateZoom,
  type Zoom,
  zoomAt,
} from "../src/shared/zoom.ts";

const FFMPEG: string = createRequire(import.meta.url)("ffmpeg-static");

test("automatic zoom follows the text cursor while something is typed", () => {
  const data = normalizeCursorData({
    version: 2,
    width: 1920,
    height: 1080,
    moves: [[0, 300, 300, 0]],
    // A click into a field at the top left, then typing along a line far to the right.
    clicks: [[1, 300, 300, 0, 0.05]],
    typing: [1.6, 2.1, 2.6, 3.1, 3.6, 4.1],
    caret: [
      [1.05, 310, 290, 2, 20],
      [1.7, 900, 600, 2, 20],
      [2.2, 905, 600, 2, 20],
      [2.7, 1300, 600, 2, 20],
      [3.2, 1310, 600, 2, 20],
      [3.7, 1700, 600, 2, 20],
      [4.2, 1710, 600, 2, 20],
    ],
  });
  const zooms = autoZooms(data, 10);
  assert.equal(zooms.length, 1, "the click and the typing after it share one zoom");
  const [z] = zooms;
  assert.ok(z.start < 1 && z.end > 4.1);
  // The view pans to where the text is being written (the small steps are not points).
  const last = z.focus.at(-1);
  assert.ok(last && Math.abs(last.x - 1701 / 1920) < 0.01, `${last?.x}`);
  assert.ok(z.focus.length >= 3 && z.focus.length <= 5, `${z.focus.length} points`);
  const view = zoomAt(zooms, 3.4);
  assert.ok(view.cx > 0.6, `the view is over the typing: ${view.cx}`);
  // Turned off, only the click counts.
  assert.equal(
    autoZooms(data, 10, { scale: 1.8, gap: 3.5, lead: 0.9, hold: 1.8, typing: false })[0].focus
      .length,
    1,
  );
});

test("no automatic zoom on clicks made over the recorder's own controls", () => {
  const data = normalizeCursorData({
    version: 2,
    width: 1920,
    height: 1080,
    moves: [[0, 1800, 1000, 0]],
    clicks: [
      [2, 1800, 1000, 0, 0.05],
      [8, 400, 300, 0, 0.05],
    ],
    hidden: [[1.5, 2.5]],
  });
  const zooms = autoZooms(data, 12);
  assert.equal(zooms.length, 1);
  assert.ok(zooms[0].start > 6, "only the click in the lesson");
});

test("scene changes found by FFmpeg become proposed zooms, leaving bursts and zoomed moments", () => {
  const dir = mkdtempSync(join(tmpdir(), "ediaula-scenes-"));
  const video = join(dir, "telas.mp4");
  // Three screens: gray, then a page at 2 s, then another at 6 s.
  execFileSync(FFMPEG, [
    ...["-y", "-v", "error"],
    ...["-f", "lavfi", "-i", "color=c=0x303030:s=320x180:r=30:d=2"],
    ...["-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=4"],
    ...["-f", "lavfi", "-i", "color=c=0xE0E0E0:s=320x180:r=30:d=3"],
    ...["-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]"],
    ...["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", video],
  ]);
  const run = spawnSync(FFMPEG, sceneArgs(video), { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const changes = parseSceneChanges(run.stderr);
  assert.ok(
    changes.some((t) => Math.abs(t - 2) < 0.2),
    `a change at 2 s: ${changes}`,
  );
  assert.ok(
    changes.some((t) => Math.abs(t - 6) < 0.2),
    `a change at 6 s: ${changes}`,
  );
  const zooms = sceneZooms(
    [2, 6],
    normalizeCursorData({
      version: 2,
      width: 320,
      height: 180,
      moves: [
        [0, 160, 90, 0],
        [2.5, 80, 40, 0],
      ],
      clicks: [],
    }),
    9,
  );
  assert.equal(zooms.length, 2);
  assert.ok(Math.abs(zooms[0].start - 2.3) < 1e-6);
  assert.deepEqual([zooms[0].focus[0].x, zooms[0].focus[0].y], [0.25, 40 / 180]);
  // A burst of changes (a video playing) and a moment already zoomed get nothing.
  assert.equal(sceneZooms([10, 11, 12.5], null, 30).length, 0);
  const existing: Zoom[] = [{ id: "z", start: 6, end: 9, scale: 2, focus: [] }];
  assert.equal(sceneZooms([2, 6], null, 9, existing).length, 1);
});

/** A lesson with one screen recording and its zooms, as saved. */
function lesson(zooms: Zoom[] | undefined): Project {
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
        duration: 20,
        width: 1920,
        height: 1080,
        fps: 30,
        hasVideo: true,
        hasAudio: false,
        size: 1,
        proxyStatus: "none",
        ...(zooms ? { zooms } : {}),
      },
    ],
    tracks: [{ id: "v", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
    clips: [{ id: "c", assetId: "a", trackId: "v", start: 0, in: 0, duration: 20, volume: 1 }],
  };
}

test("editing a recording's zoom: edges, closeness, smoothness, focus and removal stay valid", () => {
  const start: Zoom[] = [
    {
      id: "z1",
      start: 2,
      end: 6,
      scale: 1.8,
      auto: true,
      focus: [
        { t: 2.5, x: 0.2, y: 0.3 },
        { t: 4.5, x: 0.7, y: 0.6 },
      ],
    },
    { id: "z2", start: 10, end: 12, scale: 2, focus: [{ t: 10, x: 0.5, y: 0.5 }] },
  ];
  // The start dragged past the end stops short of it; the focus points stay inside.
  let zooms = moveZoomEdge(start, "z1", "start", 7, 20);
  const moved = zooms?.find((z) => z.id === "z1");
  assert.equal(moved?.start, 6 - MIN_ZOOM_LENGTH);
  assert.ok(moved?.focus.every((f) => f.t >= moved.start && f.t <= moved.end));
  assert.equal(moved?.auto, undefined, "an edited automatic zoom is kept when it runs again");
  zooms = moveZoomEdge(start, "z1", "end", 30, 20);
  assert.equal(zooms?.find((z) => z.id === "z1")?.end, 20);
  zooms = updateZoom(start, "z2", { scale: 9, ease: 1.2 });
  assert.deepEqual(
    [zooms?.find((z) => z.id === "z2")?.scale, zooms?.find((z) => z.id === "z2")?.ease],
    [5, 1.2],
  );
  // The rectangle moves the focus point in force at the playhead.
  assert.equal(focusIndexAt(start[0], 3), 0);
  assert.equal(focusIndexAt(start[0], 5), 1);
  zooms = setZoomFocus(start, "z1", 5, 1.4, 0.4);
  assert.deepEqual(zooms?.find((z) => z.id === "z1")?.focus[1], { t: 4.5, x: 1, y: 0.4 });
  assert.deepEqual(zooms?.find((z) => z.id === "z1")?.focus[0], start[0].focus[0]);
  for (const edited of [
    moveZoomEdge(start, "z1", "start", 0.5, 20),
    updateZoom(start, "z1", { scale: 1.4 }),
    setZoomFocus(start, "z2", 11, 0.1, 0.9),
    removeZoom(start, "z2"),
  ])
    assert.ok(projectSchema.safeParse(lesson(edited)).success, JSON.stringify(edited));
  assert.equal(removeZoom(removeZoom(start, "z1"), "z2"), undefined);
});
