import { expect, test } from "vitest";
import { applyMotionCommands } from "./commands";
import { ease, evaluateAnimation, frameAtSeconds } from "./evaluator";
import { emptyMotion, onUnitOpacityScale, parseMotion } from "./model";

const targets = new Set(["node-a", "node-b"]);
function fixture() {
  return applyMotionCommands(emptyMotion(), targets, [
    {
      type: "create-animation",
      animation: {
        id: "animation-free",
        name: "Livre",
        fps: 30,
        frames: 60,
        mode: "once",
        tracks: [],
      },
    },
    {
      type: "set-key",
      animationId: "animation-free",
      targetId: "node-a",
      property: "x",
      frame: 0,
      value: 0,
    },
    {
      type: "set-key",
      animationId: "animation-free",
      targetId: "node-a",
      property: "x",
      frame: 60,
      value: 100,
    },
    {
      type: "set-key",
      animationId: "animation-free",
      targetId: "node-b",
      property: "rotation",
      frame: 0,
      value: 10,
    },
    {
      type: "set-key",
      animationId: "animation-free",
      targetId: "node-b",
      property: "rotation",
      frame: 60,
      value: 70,
    },
  ]);
}
test("independent object channels retain stable IDs and evaluate deterministically after roundtrip", () => {
  const motion = fixture();
  const animation = motion.animations[0];
  if (!animation) throw new Error("Missing animation fixture");
  const frame = frameAtSeconds(1, animation);
  expect(frame).toBe(30);
  expect(evaluateAnimation(animation, frame).get("node-a")).toEqual({ x: 50 });
  expect(evaluateAnimation(animation, frame).get("node-b")).toEqual({ rotation: 40 });
  expect(parseMotion(JSON.parse(JSON.stringify(motion)), targets)).toEqual(motion);
  const updated = applyMotionCommands(motion, targets, [
    {
      type: "set-key",
      animationId: animation.id,
      targetId: "node-a",
      property: "x",
      frame: 0,
      value: 20,
    },
  ]);
  expect(updated.animations[0]?.tracks[0]?.keys[0]?.id).toBe(animation.tracks[0]?.keys[0]?.id);
  expect(animation.tracks[0]?.keys[0]?.value).toBe(0);
});
test("transactions reject orphan references, shrinking durations and unsafe values without publishing partial changes", () => {
  const motion = fixture(),
    before = structuredClone(motion);
  for (const command of [
    {
      type: "set-key",
      animationId: "animation-free",
      targetId: "node-missing",
      property: "x",
      frame: 0,
      value: 1,
    },
    {
      type: "set-key",
      animationId: "animation-free",
      targetId: "node-a",
      property: "sx",
      frame: 0,
      value: -21,
    },
    {
      type: "set-key",
      animationId: "animation-free",
      targetId: "node-a",
      property: "x",
      frame: 0,
      value: Infinity,
    },
    {
      type: "update-animation",
      animationId: "animation-free",
      name: "Short",
      frames: 10,
      fps: 60,
      mode: "loop",
    },
  ])
    expect(() => applyMotionCommands(motion, targets, [command])).toThrow();
  expect(motion).toEqual(before);
  expect(() => parseMotion({ ...motion, version: 3 }, targets)).toThrow();
});
test("playback respects arbitrary FPS, loop boundaries and ping-pong, with finite-time validation", () => {
  const base = { fps: 24, frames: 48, mode: "once" };
  expect(frameAtSeconds(3, { ...base, mode: "once" })).toBe(48);
  expect(frameAtSeconds(2, { ...base, mode: "loop" })).toBe(0);
  expect(frameAtSeconds(3, { ...base, mode: "ping-pong" })).toBe(24);
  expect(frameAtSeconds(-1, { ...base, mode: "loop" })).toBe(0);
  expect(() => frameAtSeconds(Infinity, { ...base, mode: "loop" })).toThrow();
});
test("easing obeys endpoints, hold behavior and a monotonic cubic with no sampling tables", () => {
  expect(ease(0.5, "linear")).toBe(0.5);
  expect(ease(0.9, "hold")).toBe(0);
  expect(ease(1, "hold")).toBe(1);
  expect(ease(0.5, { kind: "cubic-bezier", points: [0.42, 0, 0.58, 1] })).toBeCloseTo(0.5, 8);
});
test("aggregate budgets are rejected before deep validation and positive legacy scales remain animatable", () => {
  const motion = fixture();
  const scaled = applyMotionCommands(motion, targets, [
    {
      type: "set-key",
      animationId: "animation-free",
      targetId: "node-a",
      property: "sx",
      frame: 0,
      value: 0.001,
    },
  ]);
  expect(
    scaled.animations[0]?.tracks.find((track) => track.property === "sx")?.keys[0]?.value,
  ).toBe(0.001);
  expect(() =>
    parseMotion(
      { version: 1, animations: [{ tracks: Array.from({ length: 12001 }, () => ({})) }] },
      targets,
    ),
  ).toThrow("Orçamento de trilhas");
  expect(() =>
    parseMotion({ version: 1, animations: [{ tracks: [{ keys: Array(100001) }] }] }, targets),
  ).toThrow("Orçamento de chaves");
});
test("key edits preserve identity, reject collisions atomically and duplicate clips with fresh nested IDs", () => {
  const motion = fixture(),
    animation = motion.animations[0];
  if (!animation?.tracks[0]?.keys[1]) throw new Error("Missing fixture keys");
  const track = animation.tracks[0],
    key = track.keys[1];
  if (!key) throw new Error("Missing fixture key");
  const command = {
    type: "update-key",
    animationId: animation.id,
    trackId: track.id,
    keyId: key.id,
    frame: 40,
    value: 80,
    easing: "hold",
  };
  const edited = applyMotionCommands(motion, targets, [command]);
  expect(edited.animations[0]?.tracks[0]?.keys[1]).toEqual({
    id: key.id,
    frame: 40,
    value: 80,
    easing: "hold",
  });
  expect(() => applyMotionCommands(motion, targets, [{ ...command, frame: 0 }])).toThrow();
  expect(motion.animations[0]?.tracks[0]?.keys[1]?.frame).toBe(60);
  const duplicated = applyMotionCommands(edited, targets, [
    { type: "duplicate-animation", animationId: animation.id, id: "animation-copy", name: "Cópia" },
  ]);
  const copy = duplicated.animations[1];
  if (!copy) throw new Error("Missing duplicate");
  expect(copy.tracks[0]?.id).not.toBe(track.id);
  expect(copy.tracks[0]?.keys[1]?.id).not.toBe(key.id);
  expect(copy.tracks[0]?.targetId).toBe(track.targetId);
  expect(evaluateAnimation(copy, 20)).toEqual(
    evaluateAnimation(edited.animations[0] ?? animation, 20),
  );
});

test("a keys command writes the same keys as the set-keys it stands for", () => {
  const base = applyMotionCommands(emptyMotion(), targets, [
    {
      type: "create-animation",
      animation: {
        id: "animation-short",
        name: "Curta",
        fps: 30,
        frames: 60,
        mode: "once",
        tracks: [],
      },
    },
  ]);
  const short = applyMotionCommands(base, targets, [
    {
      type: "keys",
      animationId: "animation-short",
      targetId: "node-a",
      tracks: {
        opacity: [
          [0, 0],
          [12, 100, "ease-out"],
        ],
        y: [
          [0, 40, "hold"],
          [12, 0],
        ],
      },
    },
  ]);
  const long = applyMotionCommands(base, targets, [
    {
      type: "set-key",
      animationId: "animation-short",
      targetId: "node-a",
      property: "opacity",
      frame: 0,
      value: 0,
    },
    {
      type: "set-key",
      animationId: "animation-short",
      targetId: "node-a",
      property: "opacity",
      frame: 12,
      value: 100,
      easing: { kind: "cubic-bezier", points: [0, 0, 0.58, 1] },
    },
    {
      type: "set-key",
      animationId: "animation-short",
      targetId: "node-a",
      property: "y",
      frame: 0,
      value: 40,
      easing: "hold",
    },
    {
      type: "set-key",
      animationId: "animation-short",
      targetId: "node-a",
      property: "y",
      frame: 12,
      value: 0,
    },
  ]);
  const shape = (motion: typeof short) =>
    motion.animations[0]?.tracks.map((track) => ({
      targetId: track.targetId,
      property: track.property,
      keys: track.keys.map(({ frame, value, easing }) => ({ frame, value, easing })),
    }));
  expect(shape(short)).toEqual(shape(long));
  const clip = short.animations[0];
  if (!clip) throw new Error("Missing animation");
  expect(evaluateAnimation(clip, 6).get("node-a")).toEqual(
    evaluateAnimation(long.animations[0] ?? clip, 6).get("node-a"),
  );
  for (const tracks of [{}, { opacity: [] }, { opacity: [[-1, 0]] }, { color: [[0, 1]] }])
    expect(() =>
      applyMotionCommands(base, targets, [
        { type: "keys", animationId: "animation-short", targetId: "node-a", tracks },
      ]),
    ).toThrow();
  expect(() =>
    applyMotionCommands(base, targets, [
      { type: "keys", animationId: "animation-short", targetId: "node-z", tracks: { x: [[0, 1]] } },
    ]),
  ).toThrow();
});

test("an opacity fade sent by keys on 0–1 ends fully visible (opacity is 0–100)", () => {
  const base = applyMotionCommands(emptyMotion(), targets, [
    {
      type: "create-animation",
      animation: {
        id: "animation-fade",
        name: "Fade",
        fps: 30,
        frames: 60,
        mode: "once",
        tracks: [],
      },
    },
  ]);
  const fade = (opacity: [number, number][]) => {
    const clip = applyMotionCommands(base, targets, [
      { type: "keys", animationId: "animation-fade", targetId: "node-a", tracks: { opacity } },
    ]).animations[0];
    if (!clip) throw new Error("Missing animation");
    return {
      keys: clip.tracks[0]?.keys.map((key) => key.value),
      end: evaluateAnimation(clip, 30).get("node-a")?.opacity,
    };
  };
  // The shape the contract once showed, [[0,0],[12,1]]: 1 is not 1%, it is fully visible.
  expect(
    fade([
      [0, 0],
      [12, 1],
    ]),
  ).toEqual({ keys: [0, 100], end: 100 });
  expect(
    fade([
      [0, 0.3],
      [12, 0.75],
    ]).keys,
  ).toEqual([30, 75]);
  // Percent tracks, and a track that is all 0, stay as sent.
  expect(
    fade([
      [0, 0],
      [12, 100],
    ]),
  ).toEqual({ keys: [0, 100], end: 100 });
  expect(
    fade([
      [0, 100],
      [12, 1],
    ]).keys,
  ).toEqual([100, 1]);
  expect(fade([[0, 0]]).keys).toEqual([0]);
  expect(onUnitOpacityScale([0, 1])).toBe(true);
  expect(onUnitOpacityScale([0, 0])).toBe(false);
  expect(onUnitOpacityScale([0, 50])).toBe(false);
});
