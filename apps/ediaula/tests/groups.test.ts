import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detachAudio,
  groupClips,
  isOneGroup,
  pruneGroups,
  trimGroup,
  ungroupClips,
  withGroups,
} from "../src/shared/groups.ts";
import { applyMagnetic, magneticSlot } from "../src/shared/magnetic.ts";
import { settle } from "../src/shared/settle.ts";
import { clipEnd, pasteClips, splitAt, trimClip } from "../src/shared/timeline.ts";
import type { Asset, Clip, Project, Track } from "../src/shared/types.ts";

const asset = (id: string, kind: Asset["kind"]): Asset => ({
  id,
  name: id,
  path: `C:/aulas/${id}`,
  kind,
  duration: kind === "image" ? 0 : 60,
  width: kind === "audio" ? 0 : 1920,
  height: kind === "audio" ? 0 : 1080,
  fps: kind === "video" ? 30 : 0,
  hasVideo: kind !== "audio",
  hasAudio: kind !== "image",
  size: 1,
  proxyStatus: "none",
});
const track = (id: string, kind: Track["kind"], extra: Partial<Track> = {}): Track => ({
  id,
  kind,
  name: id,
  muted: false,
  hidden: false,
  locked: false,
  ...extra,
});
const clip = (
  id: string,
  trackId: string,
  start: number,
  duration: number,
  extra: Partial<Clip> = {},
): Clip => ({
  id,
  assetId: "cam",
  trackId,
  start,
  in: 0,
  duration,
  volume: 1,
  ...extra,
});

function project(
  clips: Clip[],
  tracks: Track[] = [track("t1", "video"), track("t2", "video"), track("a1", "audio")],
): Project {
  return {
    version: 1,
    id: "p",
    name: "x",
    createdAt: 0,
    updatedAt: 0,
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [asset("cam", "video"), asset("logo", "image")],
    tracks,
    clips,
  };
}

test("grouping takes whole groups, and a group is picked, copied and pruned as one", () => {
  const clips = [clip("a", "t1", 0, 5), clip("b", "t2", 0, 5), clip("c", "t1", 6, 2)];
  const grouped = groupClips(clips, ["a", "b"], "g1");
  assert.deepEqual(withGroups(grouped, ["a"]).sort(), ["a", "b"]);
  assert.ok(isOneGroup(grouped, ["a", "b"]));
  // Grouping c with a takes b along: one group of three.
  const bigger = groupClips(grouped, ["c", "a"], "g2");
  assert.deepEqual(
    bigger.map((c) => c.groupId),
    ["g2", "g2", "g2"],
  );
  assert.deepEqual(
    ungroupClips(bigger, ["b"]).map((c) => c.groupId),
    [undefined, undefined, undefined],
  );
  // Fewer than two clips make no group.
  assert.equal(groupClips(clips, ["a"]), clips);
  // A group left with one clip is no group.
  assert.equal(pruneGroups(grouped.filter((c) => c.id !== "b"))[0].groupId, undefined);
  // Pieces of a split grouped clip stay in the group.
  const split = splitAt(grouped, 2, new Set(["a"]));
  assert.equal(split.filter((c) => c.groupId === "g1").length, 3);
  // A paste makes a group of its own.
  const pasted = pasteClips(
    project([]).tracks,
    grouped,
    grouped.filter((c) => c.groupId),
    20,
  );
  const copies = pasted.clips.filter((c) => pasted.ids.includes(c.id));
  assert.equal(copies.length, 2);
  assert.equal(new Set(copies.map((c) => c.groupId)).size, 1);
  assert.notEqual(copies[0].groupId, "g1");
});

test("trimming a grouped clip moves the same edge of the others that ended with it", () => {
  const clips = groupClips(
    [clip("v", "t1", 0, 10), clip("s", "a1", 0, 10), clip("late", "t2", 2, 10)],
    ["v", "s", "late"],
    "g",
  );
  const assets = new Map(project([]).assets.map((a) => [a.id, a]));
  const v = clips[0];
  const out = trimGroup(
    clips,
    v,
    trimClip(v, "end", 7, assets.get("cam")),
    "end",
    trimClip,
    assets,
    1 / 30,
  );
  const end = (id: string): number => clipEnd(out.find((c) => c.id === id) as Clip);
  assert.equal(end("v"), 7);
  assert.equal(end("s"), 7);
  // It ended elsewhere: it stays.
  assert.equal(end("late"), 12);
});

test("separating the sound makes a grouped sound clip and silences the video", () => {
  const p = project([
    clip("v", "t1", 2, 8, { volume: 0.8, denoise: true, gain: [{ t: 1, db: -6 }] }),
  ]);
  const done = detachAudio(p, "v");
  assert.ok(done);
  const video = done.clips.find((c) => c.id === "v") as Clip;
  const sound = done.clips.find((c) => c.id === done.audioId) as Clip;
  assert.equal(video.volume, 0);
  assert.equal(video.denoise, undefined);
  assert.equal(sound.trackId, "a1");
  assert.equal(sound.volume, 0.8);
  assert.deepEqual(sound.gain, [{ t: 1, db: -6 }]);
  assert.equal(sound.start, 2);
  assert.equal(sound.groupId, video.groupId);
  assert.ok(video.groupId);
  // Nothing to take out of a silent clip; a busy sound track makes a new one.
  assert.equal(detachAudio({ ...p, clips: [{ ...p.clips[0], volume: 0 }] }, "v"), null);
  const busy = detachAudio(project([...p.clips, clip("x", "a1", 0, 30)]), "v");
  assert.ok(busy && busy.tracks.length === 4 && busy.tracks[3].kind === "audio");
});

test("a magnetic track stays packed from 0:00 after every commit", () => {
  const tracks = [track("m", "video", { magnetic: true }), track("f", "video")];
  const p = project([clip("a", "m", 3, 2), clip("b", "m", 10, 4), clip("c", "f", 7, 1)], tracks);
  const packed = applyMagnetic(p);
  assert.deepEqual(
    packed.clips.map((c) => [c.id, c.start]),
    [
      ["a", 0],
      ["b", 2],
      ["c", 7],
    ],
  );
  assert.equal(applyMagnetic(packed), packed);
  // Removing one closes the hole.
  const removed = settle(packed, { ...packed, clips: packed.clips.filter((c) => c.id !== "a") });
  assert.equal(removed.clips.find((c) => c.id === "b")?.start, 0);
  // A clip dropped over the middle of another goes before it.
  assert.ok(magneticSlot(packed.clips, "m", 2.5) < 2);
  // A locked magnetic track does not move.
  const locked = { ...p, tracks: [{ ...tracks[0], locked: true }, tracks[1]] };
  assert.equal(applyMagnetic(locked), locked);
});
