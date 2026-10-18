import { expect, test } from "vitest";
import { applyMotionCommands } from "./commands";
import { parseMotion } from "./model";

const targets = new Set(["node-a", "node-b"]);
function fixture() {
  return parseMotion(
    {
      version: 1,
      animations: [
        {
          id: "animation-a",
          name: "A",
          fps: 30,
          frames: 120,
          mode: "once",
          tracks: [
            {
              id: "track-a",
              targetId: "node-a",
              property: "x",
              keys: [0, 10, 20].map((frame) => ({
                id: `key-${frame}`,
                frame,
                value: frame,
                easing: "linear",
              })),
            },
          ],
        },
      ],
    },
    targets,
  );
}
test("key retiming is atomic across the selection and preserves source identities", () => {
  const source = fixture(),
    before = structuredClone(source);
  const moved = applyMotionCommands(source, targets, [
    {
      type: "move-keys",
      animationId: "animation-a",
      keyIds: ["key-10", "key-20"],
      deltaFrames: 10,
      scale: 1,
      anchorFrame: 0,
    },
  ]);
  expect(moved.animations[0]?.tracks[0]?.keys.map((key) => [key.id, key.frame])).toEqual([
    ["key-0", 0],
    ["key-10", 20],
    ["key-20", 30],
  ]);
  expect(source).toEqual(before);
  expect(() =>
    applyMotionCommands(source, targets, [
      {
        type: "move-keys",
        animationId: "animation-a",
        keyIds: ["key-10"],
        deltaFrames: 10,
        scale: 1,
        anchorFrame: 0,
      },
    ]),
  ).toThrow();
  expect(() =>
    applyMotionCommands(source, targets, [
      {
        type: "move-keys",
        animationId: "animation-a",
        keyIds: ["key-10", "key-missing"],
        deltaFrames: 1,
        scale: 1,
        anchorFrame: 0,
      },
    ]),
  ).toThrow();
  const scaled = applyMotionCommands(source, targets, [
    {
      type: "move-keys",
      animationId: "animation-a",
      keyIds: ["key-10", "key-20"],
      deltaFrames: 0,
      scale: 0.5,
      anchorFrame: 0,
    },
  ]);
  expect(scaled.animations[0]?.tracks[0]?.keys.map((key) => key.frame)).toEqual([0, 5, 10]);
});
test("copy/delete selections renew IDs without overwriting original keys or accepting duplicate selection", () => {
  const source = fixture(),
    copied = applyMotionCommands(source, targets, [
      {
        type: "copy-keys",
        animationId: "animation-a",
        keyIds: ["key-0", "key-10"],
        deltaFrames: 40,
        scale: 1,
        anchorFrame: 0,
      },
    ]);
  const keys = copied.animations[0]?.tracks[0]?.keys;
  if (!keys) throw new Error("Missing keys");
  expect(keys.map((key) => key.frame)).toEqual([0, 10, 20, 40, 50]);
  expect(new Set(keys.map((key) => key.id)).size).toBe(5);
  const deleted = applyMotionCommands(copied, targets, [
    {
      type: "delete-keys",
      animationId: "animation-a",
      keyIds: keys.filter((key) => key.frame >= 40).map((key) => key.id),
    },
  ]);
  expect(deleted).toEqual(source);
  expect(() =>
    applyMotionCommands(source, targets, [
      { type: "delete-keys", animationId: "animation-a", keyIds: ["key-0", "key-0"] },
    ]),
  ).toThrow(/repetidas/);
  expect(() =>
    applyMotionCommands(source, targets, [
      {
        type: "copy-keys",
        animationId: "animation-a",
        keyIds: ["key-0"],
        deltaFrames: 0,
        scale: 1,
        anchorFrame: 0,
      },
    ]),
  ).toThrow();
});
test("multi-object poses share auto-key policy and one bounded command", () => {
  const source = fixture();
  const command = {
    type: "set-poses",
    animationId: "animation-a",
    frame: 60,
    createKeys: true,
    poses: [
      { targetId: "node-a", transform: { x: 100, y: 20 } },
      { targetId: "node-b", transform: { x: 200 } },
    ],
  };
  expect(() => applyMotionCommands(source, targets, [{ ...command, createKeys: false }])).toThrow(
    /Autochave/,
  );
  const keyed = applyMotionCommands(source, targets, [command]);
  expect(keyed.animations[0]?.tracks).toHaveLength(3);
  const repeated = applyMotionCommands(keyed, targets, [{ ...command, createKeys: false }]);
  expect(repeated).toEqual(keyed);
  expect(() =>
    applyMotionCommands(source, targets, [
      { ...command, poses: [...command.poses, command.poses[0]] },
    ]),
  ).toThrow(/repetidos/);
  expect(source.animations[0]?.tracks).toHaveLength(1);
});
test("command preflight refuses excessive key work before recursively cloning payloads", () => {
  const source = fixture(),
    animation = source.animations[0];
  if (!animation) throw new Error("Missing clip");
  const track = animation.tracks[0];
  if (!track) throw new Error("Missing track");
  const keys = Array.from({ length: 100001 }, () => track.keys[0]);
  expect(() =>
    applyMotionCommands(source, targets, [
      {
        type: "create-animation",
        animation: { ...animation, id: "animation-large", tracks: [{ ...track, keys }] },
      },
    ]),
  ).toThrow(/Orçamento/);
  expect(source.animations).toHaveLength(1);
});
