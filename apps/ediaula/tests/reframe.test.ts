import assert from "node:assert/strict";
import { test } from "node:test";
import { clipLayout, reframeProject, rotatedSize } from "../src/shared/compose.ts";
import { projectSchema } from "../src/shared/project-schema.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";

const asset = (id: string, width: number, height: number): Asset => ({
  id,
  name: id,
  path: `C:/${id}.mp4`,
  kind: "video",
  duration: 60,
  width,
  height,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1,
  proxyStatus: "none",
});
const clip = (id: string, assetId: string, extra: Partial<Clip> = {}): Clip => ({
  id,
  assetId,
  trackId: "t",
  start: 0,
  in: 0,
  duration: 10,
  volume: 1,
  ...extra,
});

const lesson = (): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [asset("tela", 1920, 1080), asset("avatar", 1080, 1920), asset("fx", 1, 1)],
  tracks: [{ id: "t", kind: "video", name: "t", muted: false, hidden: false, locked: false }],
  clips: [
    clip("tela", "tela"),
    clip("avatar", "avatar", {
      transform: { x: 0.84, y: 0.545, scale: 0.92, opacity: 1 },
      keyframes: [
        { t: 0, x: 0.84, y: 0.545, scale: 0.92 },
        { t: 5, x: 0.16, y: 0.545, scale: 0.92 },
      ],
    }),
    clip("zoom", "fx", { zoomLayer: { scale: 2, x: 0.25, y: 0.75 } }),
  ],
});

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps;
function found<T>(value: T | undefined, what: string): T {
  assert.ok(value !== undefined, what);
  return value;
}
const clipOf = (p: Project, id: string): Clip =>
  found(
    p.clips.find((x) => x.id === id),
    `clip ${id}`,
  );
const boxIn = (p: Project, id: string) => {
  const c = clipOf(p, id);
  const a = found(
    p.assets.find((x) => x.id === c.assetId),
    `media of ${id}`,
  );
  return clipLayout(c, a, p.settings).visible;
};

test("fitting a wide lesson into a vertical frame keeps every picture on the same spot of the old frame", () => {
  const before = lesson();
  const after = reframeProject(before, { width: 1080, height: 1920, fps: 30 }, "fit");
  assert.deepEqual(after.settings, { width: 1080, height: 1920, fps: 30 });
  assert.ok(projectSchema.safeParse(after).success);
  // The old frame becomes 1080 × 607.5 in the middle of the new one.
  const k = 1080 / 1920;
  const top = (1920 - 1080 * k) / 2;
  const screen = boxIn(after, "tela");
  assert.ok(near(screen.x, 0) && near(screen.w, 1080) && near(screen.y, top));
  assert.equal(
    after.clips.find((c) => c.id === "tela")?.transform,
    undefined,
    "a full-frame clip stays without a transform",
  );
  // The avatar keeps its place against the old frame.
  const old = boxIn(before, "avatar");
  const now = boxIn(after, "avatar");
  assert.ok(near(now.x, old.x * k) && near(now.y, top + old.y * k) && near(now.w, old.w * k));
  // Movement and the zoom layer's point follow.
  const moving = found(clipOf(after, "avatar").keyframes, "keyframes");
  assert.ok(near(moving[1].x, (1080 / 2 + (0.16 * 1920 - 960) * k) / 1080));
  const layer = found(clipOf(after, "zoom").zoomLayer, "zoom layer");
  assert.ok(near(layer.x, 0.25) && near(layer.y, (top + 0.75 * 1080 * k) / 1920));
});

test("filling the vertical frame covers it, cutting the sides", () => {
  const after = reframeProject(lesson(), { width: 1080, height: 1920, fps: 30 }, "fill");
  const screen = boxIn(after, "tela");
  assert.ok(near(screen.h, 1920) && near(screen.y, 0));
  assert.ok(near(screen.w, (1920 * 1920) / 1080));
  assert.ok(near(screen.x + screen.w / 2, 540), "centered");
});

test("the same aspect ratio at another size changes nothing but the size", () => {
  const before = lesson();
  const after = reframeProject(before, { width: 1280, height: 720, fps: 30 }, "fit");
  assert.equal(after.clips.find((c) => c.id === "tela")?.transform, undefined);
  const avatar = found(clipOf(after, "avatar").transform, "transform");
  assert.ok(near(avatar.x, 0.84) && near(avatar.y, 0.545) && near(avatar.scale, 0.92));
});

test("a turned picture covers its rotated box", () => {
  assert.deepEqual(rotatedSize(100, 50, 90), { w: 50, h: 100 });
  assert.deepEqual(rotatedSize(100, 50, 0), { w: 100, h: 50 });
  const lay = clipLayout(
    { transform: { x: 0.5, y: 0.5, scale: 0.5, opacity: 1, rotation: 45 } },
    { width: 1920, height: 1080 },
    { width: 1920, height: 1080 },
  );
  assert.equal(lay.rotation, 45);
  const side = (960 + 540) * Math.SQRT1_2;
  assert.ok(near(lay.bounds.w, side, 1e-6) && near(lay.bounds.h, side, 1e-6));
  assert.ok(
    near(lay.bounds.x + lay.bounds.w / 2, 960) && near(lay.bounds.y + lay.bounds.h / 2, 540),
  );
  assert.equal(
    clipLayout(
      { transform: { x: 0.5, y: 0.5, scale: 1, opacity: 1, rotation: 370 } },
      { width: 10, height: 10 },
      { width: 10, height: 10 },
    ).rotation,
    10,
  );
});

test("a turned and mirrored picture keeps its turn and its mirror in the new format", () => {
  const before = lesson();
  before.clips.push(
    clip("girado", "tela", {
      transform: { x: 0.85, y: 0.8, scale: 0.3, opacity: 1, rotation: 30, flipH: true },
    }),
  );
  const after = reframeProject(before, { width: 1080, height: 1920, fps: 30 }, "fit");
  const t = clipOf(after, "girado").transform;
  assert.equal(t?.rotation, 30);
  assert.equal(t?.flipH, true);
  // Still on the same spot of the old frame, which now sits in the middle of the vertical one.
  const old = boxIn(before, "girado");
  const now = boxIn(after, "girado");
  const k = 1080 / 1920;
  assert.ok(near(now.x, old.x * k, 0.5) && near(now.w, old.w * k, 0.5));
  assert.ok(near(now.y, (1920 - 1080 * k) / 2 + old.y * k, 0.5));
});
