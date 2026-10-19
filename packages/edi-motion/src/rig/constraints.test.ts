import { expect, test } from "vitest";
import { multiply, transformMatrix } from "../affine";
import { identityTransform } from "../model";
import { affinePose, createRigContext, evaluateRig } from "./constraints";
import type { RigObject } from "./kinematics";
import { parseRig } from "./model";

function objects() {
  return new Map<string, RigObject>([
    [
      "node-parent",
      {
        tag: "g",
        parentId: null,
        transform: { ...identityTransform(), rotation: 30, sx: 2, sy: 3 },
      },
    ],
    ["node-owner", { tag: "g", parentId: "node-parent", transform: identityTransform() }],
    [
      "node-target",
      { tag: "g", parentId: null, transform: { ...identityTransform(), x: 100, y: 100 } },
    ],
  ]);
}
test("affine decomposition preserves reflections, pivots and skew rather than dropping them", () => {
  const original = {
      ...identityTransform(),
      x: 12,
      y: 19,
      sx: -2,
      sy: 3,
      rotation: 30,
      skewX: 15,
      px: 20,
      py: 10,
    },
    matrix = transformMatrix(original),
    restored = transformMatrix(affinePose(matrix, original));
  for (const [index, value] of matrix.entries()) expect(restored[index]).toBeCloseTo(value, 8);
});
test("distance and transform constraints use real parent spaces, preserve caller data, and compose deterministically", () => {
  const source = objects(),
    original = structuredClone(source),
    distance = {
      id: "constraint-distance",
      kind: "distance",
      ownerId: "node-owner",
      targetId: "node-target",
      min: 50,
      max: 50,
      strength: 1,
    };
  const result = evaluateRig(
    createRigContext({ version: 1, bones: [], constraints: [distance] }, source),
    new Map(),
  );
  const owner = result.world.get("node-owner"),
    target = result.world.get("node-target");
  if (!owner || !target) throw new Error("Missing matrices");
  expect(Math.hypot(owner[4] - target[4], owner[5] - target[5])).toBeCloseTo(50, 8);
  expect(source).toEqual(original);
  const transform = {
    id: "constraint-transform",
    kind: "transform",
    ownerId: "node-owner",
    targetId: "node-target",
    space: "world",
    channels: ["x", "y", "rotation", "sx", "sy", "skewX"],
    offset: { x: 10, y: 0, rotation: 0, sx: 1, sy: 1 },
    strength: 1,
  };
  const copied = evaluateRig(
      createRigContext({ version: 1, bones: [], constraints: [transform] }, source),
      new Map(),
    ),
    value = copied.world.get("node-owner");
  expect(value?.[4]).toBeCloseTo(110, 8);
  expect(value?.[5]).toBeCloseTo(100, 8);
  const local = copied.poses.get("node-owner");
  if (!local) throw new Error("Missing pose");
  const verified = multiply(
    transformMatrix(source.get("node-parent")?.transform ?? identityTransform()),
    transformMatrix(local),
  );
  for (const [index, coefficient] of (value ?? []).entries())
    expect(verified[index]).toBeCloseTo(coefficient, 8);
});
test("constraint graphs reject feedback/cycles and order dependencies before consumers", () => {
  const source = objects(),
    base = { kind: "distance", min: 0, max: 100, strength: 1 };
  const a = { ...base, id: "constraint-a", ownerId: "node-owner", targetId: "node-target" },
    b = { ...base, id: "constraint-b", ownerId: "node-target", targetId: "node-parent" };
  expect(
    parseRig({ version: 1, bones: [], constraints: [a, b] }, source).constraints.map(
      (constraint) => constraint.id,
    ),
  ).toEqual(["constraint-b", "constraint-a"]);
  expect(() =>
    parseRig({ version: 1, bones: [], constraints: [a, { ...b, targetId: "node-owner" }] }, source),
  ).toThrow(/circular/);
  expect(() =>
    parseRig(
      {
        version: 1,
        bones: [],
        constraints: [{ ...a, ownerId: "node-parent", targetId: "node-owner" }],
      },
      source,
    ),
  ).toThrow(/próprio/);
});
