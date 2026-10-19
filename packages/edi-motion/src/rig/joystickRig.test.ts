import { expect, test } from "vitest";
import { transformPoint } from "../affine";
import { identityTransform } from "../model";
import { createRigContext, evaluateRig } from "./constraints";
import { rigCost } from "./cost";
import type { RigObject } from "./kinematics";
import {
  parseRig,
  type RigDocument,
  remapRig,
  rigOwners,
  rigParameterDefinitions,
  rigParameterKey,
} from "./model";

function fixture() {
  const objects = new Map<string, RigObject>([
    ["node-upper", { tag: "g", parentId: null, transform: identityTransform() }],
    [
      "node-lower",
      { tag: "g", parentId: "node-upper", transform: { ...identityTransform(), x: 100 } },
    ],
    [
      "node-hand",
      { tag: "g", parentId: null, transform: { ...identityTransform(), x: 100, y: 100 } },
    ],
    ["node-other", { tag: "g", parentId: null, transform: identityTransform() }],
  ]);
  const rig: RigDocument = {
    version: 4,
    targets: ["node-hand"],
    bones: ["node-upper", "node-lower"].map((targetId) => ({
      targetId,
      length: 100,
      minRotation: -3600,
      maxRotation: 3600,
    })),
    constraints: [
      {
        id: "constraint-hand",
        kind: "ik",
        chain: ["node-upper", "node-lower"],
        targetId: "node-hand",
        strength: 1,
        bend: "positive",
        tolerance: 0.000001,
        iterations: 64,
      },
    ],
    joysticks: [
      {
        id: "joystick-hand",
        name: "Mão",
        targetId: "node-hand",
        x: 0,
        y: 0,
        rangeX: 100,
        rangeY: 100,
        limit: "circle",
      },
    ],
  };
  return { objects, rig };
}

test("joystick offsets compose with this frame's animated center before IK reads, without previous-frame or source mutation", () => {
  const { objects, rig } = fixture(),
    before = structuredClone({ objects, rig }),
    context = createRigContext(rig, objects),
    poses = new Map([["node-hand", { ...identityTransform(), x: 150, y: 50 }]]),
    originalPoses = structuredClone(poses),
    parameters = new Map([
      [rigParameterKey([], "joystick-hand", "x"), -0.5],
      [rigParameterKey([], "joystick-hand", "y"), 0.25],
    ]),
    result = evaluateRig(context, poses, undefined, undefined, parameters),
    hand = result.world.get("node-hand"),
    lower = result.world.get("node-lower");
  if (!hand || !lower) throw new Error("Missing rig matrices");
  expect(transformPoint(hand, 0, 0)).toEqual({ x: 100, y: 75 });
  const tip = transformPoint(lower, 100, 0);
  expect(Math.hypot(tip.x - 100, tip.y - 75)).toBeLessThan(0.000001);
  const reset = evaluateRig(context, new Map()).world.get("node-hand");
  if (!reset) throw new Error("Missing reset target");
  expect(transformPoint(reset, 0, 0)).toEqual({ x: 100, y: 100 });
  expect({ objects, rig }).toEqual(before);
  expect(poses).toEqual(originalPoses);
});

test("coupled circular limits and square corners remain deterministic even for an unreachable IK target", () => {
  for (const limit of ["square", "circle"] as const) {
    const { objects, rig } = fixture(),
      joystick = rig.joysticks?.[0];
    if (!joystick) throw new Error("Missing controller");
    Object.assign(joystick, { x: 1, y: 1, limit });
    const result = evaluateRig(createRigContext(rig, objects), new Map()),
      hand = result.world.get("node-hand");
    if (!hand) throw new Error("Missing target");
    const point = transformPoint(hand, 0, 0),
      expected = 100 + 100 * (limit === "circle" ? Math.SQRT1_2 : 1);
    expect(point.x).toBeCloseTo(expected, 10);
    expect(point.y).toBeCloseTo(expected, 10);
    expect(result.diagnostics[0]?.converged).toBe(false);
  }
});

test("rig v4 exposes bounded x/y channels, target ownership/remapping and axis cost while refusing legacy or ambiguous writers", () => {
  const { objects, rig } = fixture(),
    context = createRigContext(rig, objects),
    definitions = rigParameterDefinitions(context.rig);
  expect(definitions.get(rigParameterKey([], "joystick-hand", "x"))?.bounds).toEqual([-1, 1]);
  expect(definitions.get(rigParameterKey([], "joystick-hand", "y"))?.ownerIds).toEqual([
    "node-hand",
  ]);
  expect(rigOwners(rig).has("node-hand")).toBe(true);
  expect(rigCost(rig).controls).toBe(2);
  expect(
    remapRig(rig, (id) => (id === "node-hand" ? "node-renamed" : id)).joysticks?.[0]?.targetId,
  ).toBe("node-renamed");
  for (const version of [1, 2, 3])
    expect(() => parseRig({ ...rig, version }, objects)).toThrow(/v4/);
  expect(() => parseRig({ ...rig, version: 3, joysticks: [] }, objects)).toThrow(/v4/);
  expect(() => parseRig({ ...rig, targets: [] }, objects)).toThrow(/alvo raiz/);
  const duplicate = structuredClone(rig.joysticks?.[0]);
  if (!duplicate) throw new Error("Missing duplicate definition");
  duplicate.id = "joystick-duplicate";
  expect(() =>
    parseRig({ ...rig, joysticks: [...(rig.joysticks ?? []), duplicate] }, objects),
  ).toThrow(/exclusivo/);
  const hand = objects.get("node-hand");
  if (!hand) throw new Error("Missing hand");
  objects.set("node-hand", { ...hand, parentId: "node-upper" });
  expect(() => parseRig(rig, objects)).toThrow(/alvo raiz/);
});

test("a failing joystick evaluation returns no partial result or mutations and a fresh frame still evaluates correctly", () => {
  const { objects, rig } = fixture(),
    context = createRigContext(rig, objects),
    poses = new Map([["node-hand", { ...identityTransform(), x: 9999 }]]),
    before = structuredClone(poses),
    parameters = new Map([[rigParameterKey([], "joystick-hand", "x"), 1]]);
  expect(() => evaluateRig(context, poses, undefined, undefined, parameters)).toThrow(
    /Joystick joystick-hand/,
  );
  expect(poses).toEqual(before);
  expect(() => evaluateRig(context, new Map(), { remaining: 0 })).toThrow(/orçamento/);
  expect(evaluateRig(context, new Map()).world.has("node-hand")).toBe(true);
});
