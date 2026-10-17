import assert from "node:assert/strict";
import { test } from "node:test";
import { insertNarration } from "../src/shared/narration.ts";
import type { Asset, Project } from "../src/shared/types.ts";

const audio: Asset = {
  id: "voice",
  name: "Voz",
  path: "voice.wav",
  kind: "audio",
  duration: 8,
  width: 0,
  height: 0,
  fps: 0,
  hasVideo: false,
  hasAudio: true,
  size: 100,
  proxyStatus: "none",
};
const project: Project = {
  version: 1,
  id: "lesson",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [],
  tracks: [],
  clips: [
    {
      id: "existing",
      assetId: "screen",
      trackId: "screen",
      start: 0,
      in: 0,
      duration: 60,
      volume: 1,
    },
  ],
};

test("narration aligns at selection start, caps duration, and preserves existing clips", () => {
  const before = structuredClone(project);
  const next = insertNarration(project, "lesson", audio, 12, 17);
  assert.deepEqual(project, before);
  assert.deepEqual(next.clips[0], project.clips[0]);
  assert.equal(next.clips[1].start, 12);
  assert.equal(next.clips[1].in, 0);
  assert.equal(next.clips[1].duration, 5);
  assert.equal(next.clips[1].trackId, next.tracks[0].id);
  assert.equal(next.tracks[0].kind, "audio");
});

test("an early stop keeps the shorter take and repeated insertions use independent tracks", () => {
  const next = insertNarration(project, "lesson", audio, 10, 30);
  assert.equal(next.clips[1].duration, 8);
  const again = insertNarration(next, "lesson", { ...audio, id: "second" }, 10, 30);
  assert.notEqual(again.clips[1].trackId, again.clips[2].trackId);
  assert.equal(again.clips.length, 3);
});

test("rejects wrong project, invalid interval and empty take", () => {
  assert.throws(() => insertNarration(project, "other", audio, 0, 5));
  for (const [start, end] of [
    [5, 5],
    [5, 2],
    [-1, 2],
    [0, NaN],
  ])
    assert.throws(() => insertNarration(project, "lesson", audio, start, end));
  assert.throws(() => insertNarration(project, "lesson", { ...audio, duration: 0 }, 0, 5));
});
