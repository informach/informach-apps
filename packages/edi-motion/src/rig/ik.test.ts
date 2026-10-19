import { expect, test } from "vitest";
import { identityTransform } from "../model";
import { solveIkChain } from "./ik";
import { createKinematics, type RigObject } from "./kinematics";

function fixture(count = 2) {
  const objects = new Map<string, RigObject>(),
    bones = Array.from({ length: count }, (_, index) => ({
      targetId: `node-bone-${index}`,
      length: 100,
      minRotation: -360,
      maxRotation: 360,
    }));
  for (const [index, bone] of bones.entries())
    objects.set(bone.targetId, {
      tag: "g",
      parentId: bones[index - 1]?.targetId ?? null,
      transform: { ...identityTransform(), x: index ? 100 : 0 },
    });
  return { objects, bones, frame: createKinematics(objects, new Map()) };
}
const options = { strength: 1, bend: "positive", tolerance: 0.001, iterations: 64 } as const;
test("two-bone IK reaches either bend, preserves lengths and leaves the input objects unchanged", () => {
  for (const bend of ["positive", "negative"] as const) {
    const f = fixture(),
      before = structuredClone(f.objects),
      result = solveIkChain(f.frame, f.bones, { x: 100, y: 100 }, { ...options, bend });
    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(0.001);
    expect(f.frame.point("node-bone-1", 100).x).toBeCloseTo(100, 8);
    expect(f.frame.point("node-bone-1", 100).y).toBeCloseTo(100, 8);
    expect(f.objects).toEqual(before);
  }
});
test("strength zero preserves FK, fractional strength blends rotations and unreachable/limited targets report residual", () => {
  const f = fixture(),
    start = structuredClone(f.frame.poses);
  solveIkChain(f.frame, f.bones, { x: 0, y: 100 }, { ...options, strength: 0 });
  expect(f.frame.poses).toEqual(start);
  const half = fixture(),
    full = fixture();
  const blended = solveIkChain(
    half.frame,
    half.bones,
    { x: 100, y: 100 },
    { ...options, strength: 0.8 },
  );
  expect(blended.converged).toBe(true);
  expect(blended.solvedResidual).toBeLessThan(0.001);
  expect(blended.residual).toBeGreaterThan(1);
  solveIkChain(full.frame, full.bones, { x: 100, y: 100 }, options);
  expect(half.frame.pose("node-bone-1").rotation).toBeCloseTo(
    full.frame.pose("node-bone-1").rotation * 0.8,
    8,
  );
  const unreachable = fixture(),
    result = solveIkChain(unreachable.frame, unreachable.bones, { x: 500, y: 0 }, options);
  expect(result.converged).toBe(false);
  expect(result.residual).toBeCloseTo(300, 8);
  const limited = fixture();
  for (const bone of limited.bones) bone.minRotation = bone.maxRotation = 0;
  expect(solveIkChain(limited.frame, limited.bones, { x: 100, y: 100 }, options).converged).toBe(
    false,
  );
});
test("long collinear chains and targets under affine parents solve deterministically; singular/invalid profiles fail explicitly", () => {
  const f = fixture(4),
    result = solveIkChain(f.frame, f.bones, { x: 200, y: 0 }, options);
  expect(result.converged).toBe(true);
  const a = fixture(),
    parent: RigObject = {
      tag: "g",
      parentId: null,
      transform: { ...identityTransform(), x: 20, y: 30, sx: 2, sy: 3, rotation: 30 },
    };
  a.objects.set("node-parent", parent);
  const root = a.objects.get("node-bone-0");
  if (!root) throw new Error("Missing root");
  root.parentId = "node-parent";
  const frame = createKinematics(a.objects, new Map()),
    target = frame.point("node-parent", 100, 100);
  expect(solveIkChain(frame, a.bones, target, options).converged).toBe(true);
  parent.transform.sx = 0;
  expect(() =>
    solveIkChain(createKinematics(a.objects, new Map()), a.bones, target, options),
  ).toThrow(/singular/);
});
