import assert from "node:assert/strict";
import { test } from "node:test";
import { applyResumeJoin, resumeJoin } from "../src/shared/guidedJoin.ts";
import type { Asset, Clip, Project } from "../src/shared/types.ts";

/** "Continuar da etapa k": the new take carries on the earlier one where the narration is. */

const asset = (id: string, take: string, role: "screen" | "mic"): Asset => ({
  id,
  name: id,
  path: `${id}.${role === "mic" ? "wav" : "mp4"}`,
  kind: role === "mic" ? "audio" : "video",
  duration: 40,
  width: role === "mic" ? 0 : 1920,
  height: role === "mic" ? 0 : 1080,
  fps: role === "mic" ? 0 : 30,
  hasVideo: role !== "mic",
  hasAudio: role === "mic",
  size: 1,
  proxyStatus: "none",
  recording: { id: take, role },
});

const clip = (id: string, assetId: string, trackId: string, start: number, duration: number) =>
  ({ id, assetId, trackId, start, in: 0, duration, volume: 1 }) satisfies Clip;

const project = (clips: Clip[]): Pick<Project, "clips" | "assets"> => ({
  assets: [asset("tela-1", "take-1", "screen"), asset("voz-1", "take-1", "mic")],
  clips,
});

// The earlier take: narration second 0 at its video second 2. The new one starts at narration
// second 11 (its video second 1 is narration second 12): narrationOffset 1 - 12 = -11.
const earlier = { take: "take-1", screen: "tela-1", narrationOffset: 2 };
const next = -11;

test("the earlier take is cut at the narration second where the new one starts", () => {
  const p = project([clip("cv", "tela-1", "v1", 5, 30), clip("ca", "voz-1", "a1", 5, 30)]);
  const join = resumeJoin(p, earlier, next);
  assert.ok(join);
  // Narration second 11 is the earlier video's second 13, on the timeline 5 + 13.
  assert.equal(join.at, 18);
  assert.deepEqual(join.trims, [
    { clipId: "cv", duration: 13 },
    { clipId: "ca", duration: 13 },
  ]);
  assert.equal(join.clear, true);
  assert.deepEqual(join.cut, [18, 35]);
  const cut = applyResumeJoin(p, join);
  assert.deepEqual(
    cut.clips.map((c) => [c.id, c.start, c.duration]),
    [
      ["cv", 5, 13],
      ["ca", 5, 13],
    ],
  );
});

test("with something after the earlier take the cut is only proposed", () => {
  const p = project([
    clip("cv", "tela-1", "v1", 0, 30),
    clip("ca", "voz-1", "a1", 0, 30),
    clip("outro", "outra", "v1", 30, 10),
  ]);
  const join = resumeJoin(p, earlier, next);
  assert.ok(join);
  assert.equal(join.clear, false);
  assert.deepEqual(join.cut, [13, 30]);
  // A clip of the take wholly before the join stays as it is; one after it goes.
  const split = project([
    clip("cv1", "tela-1", "v1", 0, 8),
    clip("cv2", "tela-1", "v1", 8, 22),
    clip("cv3", "tela-1", "v1", 40, 5),
  ]);
  split.clips[1] = { ...split.clips[1], in: 8 };
  split.clips[2] = { ...split.clips[2], in: 30 };
  const j = resumeJoin(split, earlier, next);
  assert.ok(j);
  assert.equal(j.at, 13);
  assert.deepEqual(j.trims, [
    { clipId: "cv2", duration: 5 },
    { clipId: "cv3", duration: 0 },
  ]);
  assert.deepEqual(
    applyResumeJoin(split, j).clips.map((c) => c.id),
    ["cv1", "cv2"],
  );
});

test("no join when the earlier video does not reach that second on the timeline", () => {
  const p = project([clip("cv", "tela-1", "v1", 0, 10)]);
  assert.equal(resumeJoin(p, earlier, next), null);
});
