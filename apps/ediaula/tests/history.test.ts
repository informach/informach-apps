import assert from "node:assert/strict";
import { test } from "node:test";
import { relinkIn, restoreSnapshot, withRuntimeOf } from "../src/shared/history.ts";
import type { Asset, Project } from "../src/shared/types.ts";

const avatar: Asset = {
  id: "avatar",
  name: "Avatar",
  path: "C:/aulas/avatar.mp4",
  kind: "video",
  duration: 30,
  width: 1080,
  height: 1920,
  fps: 30,
  hasVideo: true,
  hasAudio: true,
  size: 10,
  proxyStatus: "none",
  transcriptStatus: "pending",
};
const project = (assets: Asset[], extra: Partial<Project> = {}): Project => ({
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 1,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets,
  tracks: [],
  clips: [],
  ...extra,
});

test("undo takes the background removal back but keeps what the app learned about the media", () => {
  // Before: no removal. Now: removal on, its transparent video rendered, a proxy and a transcript.
  const before = project([avatar], { stats: { editSeconds: 30 } });
  const now = project(
    [
      {
        ...avatar,
        key: { color: "#00B140", threshold: 0.4, softness: 0.1, despill: 0.5, choke: 0 },
        keyed: "C:/cache/avatar-keyed.webm",
        keyedId: "k1",
        keyStatus: "ready",
        proxy: "C:/cache/avatar-proxy.mp4",
        proxyStatus: "ready",
        transcript: "C:/cache/avatar.json",
        transcriptStatus: undefined,
      },
    ],
    { stats: { editSeconds: 90 }, exportedAt: 5, updatedAt: 7 },
  );
  const undone = restoreSnapshot(before, now, 100);
  const a = undone.assets[0];
  assert.equal(a.key, undefined, "the removal is undone");
  assert.equal(a.keyed, "C:/cache/avatar-keyed.webm");
  assert.equal(a.keyStatus, "ready");
  assert.equal(a.proxyStatus, "ready");
  assert.equal(a.transcript, "C:/cache/avatar.json");
  assert.ok(!("transcriptStatus" in a), "a field cleared since then stays cleared");
  assert.deepEqual(undone.stats, { editSeconds: 90 }, "editing time is not undone");
  assert.equal(undone.exportedAt, 5);
  assert.equal(undone.updatedAt, 100);
  // Redo the other way: the removal comes back with the same rendered video.
  const redone = restoreSnapshot(now, undone, 200);
  assert.deepEqual(redone.assets[0].key, now.assets[0].key);
  assert.equal(redone.assets[0].keyed, now.assets[0].keyed);
});

test("history snapshots are shared when nothing about the media changed", () => {
  const a = project([avatar]);
  assert.equal(withRuntimeOf(a, a), a);
  assert.equal(withRuntimeOf(a, project([{ ...avatar }])), a);
  const b = project([{ ...avatar, name: "Outro nome" }]);
  assert.equal(withRuntimeOf(a, b), a, "an edited field is not runtime data");
  const gone = restoreSnapshot(project([avatar], { stats: { editSeconds: 1 } }), project([]), 3);
  assert.equal(gone.assets[0], avatar, "media removed since then keep the snapshot's data");
  assert.ok(!("stats" in gone));
});

test("relinking a media replaces the old path everywhere it is still used", () => {
  const missing = { ...avatar, missing: true };
  const p = project([missing, { ...avatar, id: "other" }]);
  const out = relinkIn(p, missing, { path: "D:/novo/avatar.mp4", size: 11 });
  assert.equal(out.assets[0].path, "D:/novo/avatar.mp4");
  assert.equal(out.assets[0].size, 11);
  assert.ok(!("missing" in out.assets[0]));
  assert.equal(out.assets[1], p.assets[1]);
  const redrawn = project([{ ...avatar, path: "C:/cache/other.png" }]);
  assert.equal(relinkIn(redrawn, missing, { path: "x", size: 1 }), redrawn);
});

test("relinking a recording moves its cursor data too, in every snapshot that had it", () => {
  const recording: Asset = {
    ...avatar,
    id: "screen",
    path: "C:/Gravações/1/tela.mp4",
    cursor: "C:/Gravações/1/cursor.json",
    missing: true,
    cursorMissing: true,
  };
  const p = project([recording]);
  const moved = relinkIn(p, recording, {
    path: "D:/Aulas/1/tela.mp4",
    size: 12,
    cursor: "D:/Aulas/1/cursor.json",
  });
  const a = moved.assets[0];
  assert.deepEqual(
    [a.path, a.size, a.cursor],
    ["D:/Aulas/1/tela.mp4", 12, "D:/Aulas/1/cursor.json"],
  );
  assert.ok(!("missing" in a) && !("cursorMissing" in a));
  // Only the cursor data was lost: the video stays where it is.
  const onlyCursor = relinkIn(project([{ ...recording, missing: false }]), recording, {
    cursor: "E:/cursor.json",
  }).assets[0];
  assert.deepEqual([onlyCursor.path, onlyCursor.cursor], [recording.path, "E:/cursor.json"]);
  assert.ok(!("cursorMissing" in onlyCursor));
});
