import assert from "node:assert/strict";
import { test } from "node:test";
import type { LinkedAnimation } from "@informach/edi-link/contract";
import {
  ANIMATION_TRACK,
  animationTrack,
  applyRender,
  linkedEntry,
  linkedProjects,
  placeLinked,
  renderBehind,
} from "../src/shared/linkedMedia.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const track = (id: string, kind: Track["kind"], name: string): Track => ({
  id,
  kind,
  name,
  muted: false,
  hidden: false,
  locked: false,
});
const asset = (id: string, path: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: path.split("\\").pop() ?? id,
  path,
  kind: "video",
  duration: 120,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: false,
  size: 1,
  proxyStatus: "none",
  ...extra,
});
const clip = (
  id: string,
  assetId: string,
  trackId: string,
  start: number,
  duration: number,
): Clip => ({
  id,
  assetId,
  trackId,
  start,
  in: 0,
  duration,
  volume: 1,
});

/** A lesson: the presenter above the screen recording, the narration below. */
const lesson = (): Project =>
  ({
    version: 1,
    id: "pnova1234abcd",
    name: "Aula",
    createdAt: 1,
    updatedAt: 1,
    settings: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      track("tavatar", "video", "Faixa 4"),
      track("ttela", "video", "Faixa 3"),
      track("tvoz", "audio", "Faixa 1"),
    ],
    assets: [
      asset("aavatar", "C:\\aula\\avatar.mp4"),
      asset("atela", "C:\\aula\\tela.mp4", { recording: { id: "r1", role: "screen" } }),
    ],
    clips: [clip("c1", "aavatar", "tavatar", 0, 30), clip("c2", "atela", "ttela", 0, 600)],
  }) as unknown as Project;

const PROJECT = "C:\\Aulas\\Aula.edisvg";
const placeholder = (extra: Partial<Asset> = {}): Asset =>
  asset("aanim", "C:\\cache\\generated\\lugar.png", {
    kind: "image",
    duration: 0,
    alpha: true,
    link: { app: "edisvg", project: PROJECT, requestId: "pedido-0001" },
    ...extra,
  });
const entry = (
  hash: string,
  duration: number,
  extra: Partial<LinkedAnimation> = {},
): LinkedAnimation => ({
  animationId: "animation-a1",
  artboardId: "artboard-a1",
  name: "Animação 8:10",
  requestId: "pedido-0001",
  updatedAt: 1,
  render: {
    file: `animation-a1-${hash}.webm`,
    width: 1920,
    height: 1080,
    fps: 30,
    frames: duration * 30,
    duration,
    hash,
  },
  ...extra,
});
const facts = (hash: string, duration: number) => ({
  path: `C:\\Aulas\\Aula · renders\\animation-a1-${hash}.webm`,
  size: 1000,
  duration,
  width: 1920,
  height: 1080,
  fps: 30,
});

test("a linked animation goes on its own track right above the screen recording", () => {
  const placed = placeLinked(lesson(), placeholder(), 490, 12);
  const t = placed.tracks.find((x) => x.name === ANIMATION_TRACK);
  assert.ok(t);
  // Above the screen recording, below the presenter.
  assert.deepEqual(
    placed.tracks.map((x) => x.id).filter((id) => id !== "tvoz"),
    ["tavatar", t.id, "ttela"],
  );
  const c = placed.clips.find((x) => x.assetId === "aanim");
  assert.deepEqual([c?.trackId, c?.start, c?.duration], [t.id, 490, 12]);
  // A second one reuses the track.
  assert.equal(animationTrack(placed).track.id, t.id);
  assert.deepEqual(linkedProjects(placed), [PROJECT]);
});

test("a manifest entry is found by its animation, or by the request until the animation is known", () => {
  const items = [entry("0000000000000001", 12)];
  assert.equal(
    linkedEntry({ app: "edisvg", project: PROJECT, requestId: "pedido-0001" }, items),
    items[0],
  );
  assert.equal(
    linkedEntry({ app: "edisvg", project: PROJECT, animationId: "animation-a1" }, items),
    items[0],
  );
  assert.equal(
    linkedEntry({ app: "edisvg", project: PROJECT, requestId: "outro-pedido" }, items),
    undefined,
  );
  assert.equal(renderBehind(placeholder(), items[0]), true);
  assert.equal(
    renderBehind({ link: { app: "edisvg", project: PROJECT, hash: "0000000000000001" } }, items[0]),
    false,
  );
  // An entry not rendered yet is not newer than anything.
  assert.equal(
    renderBehind(placeholder(), entry("0000000000000001", 12, { render: undefined })),
    false,
  );
});

test("the first render takes the placeholder's place: a transparent video, the clip as long as the animation", () => {
  const placed = placeLinked(lesson(), placeholder({ thumb: "C:\\cache\\lugar.jpg" }), 490, 12);
  const done = applyRender(
    placed,
    "aanim",
    entry("0000000000000001", 10),
    facts("0000000000000001", 10),
  );
  const a = done.assets.find((x) => x.id === "aanim");
  assert.equal(a?.kind, "video");
  assert.equal(a?.path, facts("0000000000000001", 10).path);
  assert.equal(a?.alpha, true);
  assert.equal(a?.hasAudio, false);
  assert.equal(a?.thumb, undefined);
  assert.equal(a?.name, "Animação 8:10");
  assert.deepEqual(a?.link, {
    app: "edisvg",
    project: PROJECT,
    animationId: "animation-a1",
    artboardId: "artboard-a1",
    hash: "0000000000000001",
  });
  const c = done.clips.find((x) => x.assetId === "aanim");
  assert.deepEqual([c?.start, c?.in, c?.duration], [490, 0, 10]);
});

test("a newer render: the whole clip follows the animation's length, a trimmed one keeps its edit", () => {
  const first = applyRender(
    placeLinked(lesson(), placeholder(), 490, 12),
    "aanim",
    entry("0000000000000001", 10),
    facts("0000000000000001", 10),
  );
  // Whole clip: follows the longer animation.
  const longer = applyRender(
    first,
    "aanim",
    entry("0000000000000002", 14),
    facts("0000000000000002", 14),
  );
  assert.equal(longer.clips.find((x) => x.assetId === "aanim")?.duration, 14);
  // A trimmed clip (from 2 s, 5 s long) keeps its edit.
  const trimmed: Project = {
    ...longer,
    clips: longer.clips.map((c) => (c.assetId === "aanim" ? { ...c, in: 2, duration: 5 } : c)),
  };
  const same = applyRender(
    trimmed,
    "aanim",
    entry("0000000000000003", 14),
    facts("0000000000000003", 14),
  );
  assert.deepEqual(
    [
      same.clips.find((x) => x.assetId === "aanim")?.in,
      same.clips.find((x) => x.assetId === "aanim")?.duration,
    ],
    [2, 5],
  );
  // The animation got shorter than the trimmed clip's end: the clip stops at the end.
  const shorter = applyRender(
    trimmed,
    "aanim",
    entry("0000000000000004", 4),
    facts("0000000000000004", 4),
  );
  assert.equal(shorter.clips.find((x) => x.assetId === "aanim")?.duration, 2);
  // Other clips never change.
  assert.deepEqual(
    shorter.clips.filter((x) => x.assetId !== "aanim"),
    lesson().clips,
  );
});

test("a pipeline's placement moves a clip showing all of the animation there, once", () => {
  const first = applyRender(
    placeLinked(lesson(), placeholder(), 490, 12),
    "aanim",
    entry("0000000000000001", 10, { start: 489.7 }),
    facts("0000000000000001", 10),
  );
  const c = first.clips.find((x) => x.assetId === "aanim");
  assert.deepEqual([c?.start, c?.duration], [489.7, 10]);
  assert.equal(first.assets.find((x) => x.id === "aanim")?.link?.start, 489.7);
  // Moved by the person afterwards: a newer render with the same placement leaves it there.
  const moved: Project = {
    ...first,
    clips: first.clips.map((x) => (x.assetId === "aanim" ? { ...x, start: 500 } : x)),
  };
  const again = applyRender(
    moved,
    "aanim",
    entry("0000000000000002", 10, { start: 489.7 }),
    facts("0000000000000002", 10),
  );
  assert.equal(again.clips.find((x) => x.assetId === "aanim")?.start, 500);
});
