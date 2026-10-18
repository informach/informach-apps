import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_TOOLS, callPermission } from "../src/shared/aiTools.ts";
import {
  frameFacts,
  frameGeometry,
  MAX_IMAGE_SIDE,
  screenClipAt,
} from "../src/shared/frameGrab.ts";
import type { Asset, Project } from "../src/shared/types.ts";

test("frameGeometry: the whole frame scaled so its long side is at most 1568 px", () => {
  const g = frameGeometry({ width: 3840, height: 2160 });
  assert.deepEqual(g.crop, { x: 0, y: 0, width: 3840, height: 2160 });
  assert.equal(g.width, MAX_IMAGE_SIDE);
  assert.equal(g.height, 882);
  assert.ok(Math.abs(g.scale - MAX_IMAGE_SIDE / 3840) < 1e-9);
  // A portrait frame: the long side is the height.
  const tall = frameGeometry({ width: 1080, height: 1920 });
  assert.equal(tall.height, MAX_IMAGE_SIDE);
  assert.ok(tall.width <= MAX_IMAGE_SIDE && tall.width % 2 === 0);
  // Small frames are never scaled up.
  assert.deepEqual(
    {
      w: frameGeometry({ width: 640, height: 360 }).width,
      s: frameGeometry({ width: 640, height: 360 }).scale,
    },
    { w: 640, s: 1 },
  );
});

test("frameGeometry: a region in fractions of the frame, kept inside it, and max_width", () => {
  const g = frameGeometry(
    { width: 1920, height: 1080 },
    { x: 0.5, y: 0.25, width: 0.25, height: 0.5 },
  );
  assert.deepEqual(g.crop, { x: 960, y: 270, width: 480, height: 540 });
  assert.deepEqual([g.width, g.height, g.scale], [480, 540, 1]);
  // Pushed past the right edge: it keeps its size and moves inside.
  const edge = frameGeometry(
    { width: 1920, height: 1080 },
    { x: 0.9, y: 0.9, width: 0.3, height: 0.3 },
  );
  assert.ok(edge.crop.x + edge.crop.width <= 1920 && edge.crop.y + edge.crop.height <= 1080);
  assert.ok(edge.crop.width >= 16 && edge.crop.height >= 16);
  // A region too small to see grows to 16 px.
  const dot = frameGeometry(
    { width: 1920, height: 1080 },
    { x: 0.5, y: 0.5, width: 0.001, height: 0.001 },
  );
  assert.deepEqual([dot.crop.width, dot.crop.height], [16, 16]);
  // max_width scales down (never above 1568).
  const narrow = frameGeometry({ width: 1920, height: 1080 }, undefined, 800);
  assert.deepEqual([narrow.width, narrow.height], [800, 450]);
  assert.equal(frameGeometry({ width: 1920, height: 1080 }, undefined, 5000).width, MAX_IMAGE_SIDE);
});

const media = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}.mp4`,
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

const lesson: Project = {
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [
    media("tela", {
      cursor: "C:/aulas/cursor.json",
      zooms: [
        { id: "z", start: 9, end: 13, scale: 2, focus: [{ t: 9, x: 0.25, y: 0.25 }], auto: true },
      ],
    }),
    media("avatar", { screen: "#0000FF" }),
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
    { id: "t2", kind: "video", name: "Avatar", muted: false, hidden: false, locked: false },
    { id: "t3", kind: "video", name: "Tela", muted: false, hidden: false, locked: false },
  ],
  clips: [
    { id: "s", assetId: "tela", trackId: "t3", start: 0, in: 5, duration: 30, volume: 1 },
    {
      id: "a",
      assetId: "avatar",
      trackId: "t2",
      start: 8,
      in: 0,
      duration: 6,
      volume: 1,
      insertId: "F1P1-D01",
      transform: { x: 0.84, y: 0.545, scale: 0.92, opacity: 1 },
    },
    {
      id: "b",
      assetId: "balao",
      trackId: "t1",
      start: 7,
      in: 0,
      duration: 4,
      volume: 1,
      transform: { x: 0.25, y: 0.2, scale: 400 / 1920, opacity: 1 },
      annotation: { kind: "balloon", text: "Olha aqui!", color: "#FFFFFF" },
    },
  ],
};

test("screenClipAt reads the screen recording under the presenter and the annotations", () => {
  assert.equal(screenClipAt(lesson, 10)?.id, "s");
  assert.equal(screenClipAt(lesson, 45), undefined);
});

test("frameFacts: where the screen sits, its zoom and the boxes drawn over it, top first", () => {
  const f = frameFacts(lesson, 10);
  assert.equal(f.screen?.clip, "s");
  assert.equal(f.screen?.sourceTime, 15);
  assert.deepEqual(f.screen?.box, { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(
    f.screen?.zoom?.scale,
    undefined,
    "the zoom is at second 9 to 13 of the media, not 15",
  );
  assert.deepEqual(
    f.overlays.map((o) => [o.clip, o.kind]),
    [
      ["b", "balloon"],
      ["a", "presenter"],
    ],
  );
  const balloon = f.overlays[0];
  assert.equal(balloon.text, "Olha aqui!");
  assert.ok(balloon.box.x > 0.1 && balloon.box.x < 0.2, JSON.stringify(balloon.box));
  // At 2 s only the screen is there, now zoomed in.
  const early = frameFacts(
    { ...lesson, clips: lesson.clips.map((c) => (c.id === "s" ? { ...c, in: 7 } : c)) },
    4,
  );
  assert.equal(early.overlays.length, 0);
  assert.ok((early.screen?.zoom?.scale ?? 1) > 1);
});

test("get_frame is a read and refuses images over 1568 px or regions outside the frame", () => {
  assert.equal(callPermission("get_frame", { time: 3 }), "read");
  assert.ok(
    AI_TOOLS.get_frame.input.safeParse({ time: 3, max_width: 1568, composited: true }).success,
  );
  assert.equal(AI_TOOLS.get_frame.input.safeParse({ time: 3, max_width: 2000 }).success, false);
  assert.equal(
    AI_TOOLS.get_frame.input.safeParse({ time: 3, region: { x: 0, y: 0, width: 2, height: 1 } })
      .success,
    false,
  );
});
