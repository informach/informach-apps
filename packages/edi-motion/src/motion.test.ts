import { expect, test } from "vitest";
import { applyMotionCommands } from "./commands";
import { ease, evaluateAnimation, frameAtSeconds } from "./evaluator";
import { emptyMotion, parseMotion } from "./model";

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
