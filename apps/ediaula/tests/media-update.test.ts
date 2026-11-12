import assert from "node:assert/strict";
import { test } from "node:test";
import { bumpMedia, mediaUrl } from "../src/renderer/src/lib/media.ts";
import { relinkIn } from "../src/shared/history.ts";
import { diskChange, watchable } from "../src/shared/mediaChange.ts";
import { replaceAsset } from "../src/shared/replaceAsset.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";

const asset: Asset = {
  id: "a1",
  name: "partefinalv3",
  path: "C:\\aula\\partefinalv3.mp4",
  kind: "video",
  duration: 20,
  width: 1920,
  height: 1080,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 1000,
  mtime: 1_700_000_000_000,
  proxy: "C:\\cache\\old\\proxy.mp4",
  proxyStatus: "ready",
};

test("a file exported again over the old one (same name) is seen by its size or its date", () => {
  assert.equal(diskChange(asset, { size: 1000, mtime: asset.mtime ?? 0 }), "same");
  // Copies and file systems round the date: within a second it is the same file.
  assert.equal(diskChange(asset, { size: 1000, mtime: (asset.mtime ?? 0) + 400 }), "same");
  assert.equal(diskChange(asset, { size: 1000, mtime: (asset.mtime ?? 0) + 60_000 }), "changed");
  assert.equal(diskChange(asset, { size: 2000, mtime: asset.mtime ?? 0 }), "changed");
  // Media brought in before the date was kept: written down when the size is the same.
  const { mtime: _m, ...old } = asset;
  assert.equal(diskChange(old, { size: 1000, mtime: 5 }), "record");
  assert.equal(diskChange(old, { size: 999, mtime: 5 }), "changed");
  // Pictures the editor makes and animations linked to EdiSVG are not watched this way.
  assert.equal(watchable(asset), true);
  assert.equal(watchable({ ...asset, generated: "annotation" }), false);
  assert.equal(watchable({ ...asset, missing: true }), false);
  assert.equal(
    watchable({ ...asset, link: { app: "edisvg", project: "C:\\aula\\Aula.edisvg" } } as Asset),
    false,
  );
});

test("the new version takes the media's place with its id and name; clips keep their edits", () => {
  const clip: Clip = {
    id: "c1",
    assetId: "a1",
    trackId: "t",
    start: 2,
    in: 3,
    duration: 10,
    transform: { x: 0.1, y: 0.2, scale: 0.5, rotation: 0 },
  } as Clip;
  const late: Clip = { ...clip, id: "c2", start: 14, in: 15, duration: 5 } as Clip;
  const p = {
    version: 1,
    id: "p",
    name: "Aula",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [asset],
    tracks: [{ id: "t", kind: "video", name: "t", muted: false, hidden: false, locked: false }],
    clips: [clip, late],
  } as unknown as Project;
  // The new export is shorter (16 s) and has no proxy yet.
  const next: Asset = {
    ...asset,
    duration: 16,
    size: 900,
    mtime: (asset.mtime ?? 0) + 60_000,
    proxy: undefined,
    proxyStatus: "none",
  };
  const { project } = replaceAsset(p, "a1", next, null);
  assert.equal(project.assets.length, 1);
  const updated = project.assets[0];
  assert.equal(updated?.id, "a1");
  assert.equal(updated?.name, "partefinalv3");
  assert.equal(updated?.duration, 16);
  assert.equal(updated?.proxyStatus, "none");
  const [first, second] = project.clips;
  // Same times in the file, same place and movement.
  assert.equal(first?.assetId, "a1");
  assert.equal(first?.in, 3);
  assert.equal(first?.duration, 10);
  assert.deepEqual(first?.transform, clip.transform);
  // The one that passed the new end stops there.
  assert.equal(second?.in, 15);
  assert.ok(Math.abs((second?.duration ?? 0) - 1) < 1e-9);
});

test("a media found again elsewhere keeps the date of the file it found, or none", () => {
  const p = { assets: [asset], clips: [] } as unknown as Project;
  const moved = relinkIn(p, asset, { path: "D:\\x.mp4", size: 1000, mtime: 42 });
  assert.equal(moved.assets[0]?.mtime, 42);
  // Without it (a folder search), the old file's date does not stay on the new one.
  const found = relinkIn(p, asset, { path: "D:\\x.mp4", size: 1000 });
  assert.equal(found.assets[0]?.mtime, undefined);
});

test("the preview loads a file changed in place again: its address changes", () => {
  const path = "C:\\aula\\partefinalv3.mp4";
  const before = mediaUrl(path);
  assert.equal(before, `media://local/${encodeURIComponent(path)}`);
  bumpMedia(path);
  const after = mediaUrl(path);
  assert.notEqual(after, before);
  // The main process serves the path; the version is only in the query.
  assert.equal(decodeURIComponent(new URL(after).pathname.slice(1)), path);
  assert.equal(mediaUrl("C:\\outro.mp4"), `media://local/${encodeURIComponent("C:\\outro.mp4")}`);
});
