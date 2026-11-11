import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANIMATION_TRACK,
  animationTrack,
  isSentAnimation,
  placeAnimations,
  type ReceivedAnimation,
  receivingIds,
} from "../src/shared/edisvgAnimations.ts";
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
    origin: "pgte1jhfsnary",
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

const sent = (clipId: string, start: number, stamp: string, kind: ReceivedAnimation["kind"]) => ({
  item: {
    clipId,
    kind,
    path: `C:\\Users\\x\\AppData\\Roaming\\ediaula\\recebidos\\pgte1jhfsnary\\${clipId}-${stamp}.${kind === "screen-demo" ? "webm" : "mp4"}`,
    name: clipId,
    start,
    duration: 20,
  },
});

test("the animations' track goes right above the screen recording, and is found again", () => {
  const { project, track: made } = animationTrack(lesson());
  assert.deepEqual(
    project.tracks.map((t) => t.name),
    ["Faixa 4", ANIMATION_TRACK, "Faixa 3", "Faixa 1"],
  );
  assert.equal(made.kind, "video");
  assert.equal(animationTrack(project).track.id, made.id);
  // No screen recording: above the lesson's first picture track.
  const plain = { ...lesson(), clips: [] };
  assert.equal(animationTrack(plain).project.tracks[0]?.name, ANIMATION_TRACK);
});

test("each animation goes in at its second; a new send of it takes the earlier one's place", () => {
  const first = [
    sent("animation-cena", 10, "1731000000000", "game-scene"),
    sent("animation-demo", 489.717, "1731000000000", "screen-demo"),
  ];
  const assets1 = first.map((s, i) => asset(`anim${i}`, s.item.path, { alpha: i === 1 }));
  const once = placeAnimations(
    lesson(),
    first.map((s) => s.item),
    assets1,
  );
  const animTrack = once.tracks.find((t) => t.name === ANIMATION_TRACK);
  const onTrack = once.clips.filter((c) => c.trackId === animTrack?.id);
  assert.deepEqual(
    onTrack.map((c) => [c.assetId, c.start, c.duration]),
    [
      ["anim0", 10, 20],
      ["anim1", 489.717, 20],
    ],
  );
  // The screen and the presenter are where they were.
  assert.deepEqual(
    once.clips.filter((c) => c.trackId !== animTrack?.id).map((c) => c.id),
    ["c1", "c2"],
  );

  // The demonstration sent again: its earlier video leaves the lesson, the scene stays.
  const again = [sent("animation-demo", 490, "1731000999999", "screen-demo")];
  const twice = placeAnimations(
    once,
    again.map((s) => s.item),
    [asset("anim2", again[0]?.item.path ?? "", { alpha: true })],
  );
  assert.deepEqual(
    twice.clips
      .filter((c) => c.trackId === animTrack?.id)
      .map((c) => [c.assetId, c.start])
      .sort(),
    [
      ["anim0", 10],
      ["anim2", 490],
    ],
  );
  assert.deepEqual(
    twice.assets.map((a) => a.id),
    ["aavatar", "atela", "anim0", "anim2"],
  );
  assert.equal(twice.tracks.filter((t) => t.name === ANIMATION_TRACK).length, 1);
});

test("a send belongs to the lesson and to the one it was unpacked from; only EdiSVG's videos match", () => {
  assert.deepEqual(receivingIds(lesson()), ["pnova1234abcd", "pgte1jhfsnary"]);
  assert.deepEqual(receivingIds({ id: "p1", origin: "../fora" }), ["p1"]);
  const path = sent("animation-demo", 0, "1731000000000", "screen-demo").item.path;
  assert.equal(isSentAnimation({ path }, "animation-demo"), true);
  assert.equal(isSentAnimation({ path }, "animation-cena"), false);
  assert.equal(
    isSentAnimation({ path: "C:\\aula\\animation-demo-1731000000000.webm" }, "animation-demo"),
    false,
  );
});
