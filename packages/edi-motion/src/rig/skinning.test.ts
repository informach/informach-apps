import { expect, test } from "vitest";
import { identityTransform } from "../model";
import { createRigContext, evaluateRig } from "./constraints";
import type { RigObject } from "./kinematics";
import { parseRig, type RigDocument } from "./model";
import { captureSkin } from "./skinning";

function fixture() {
  const objects = new Map<string, RigObject>([
      ["node-upper", { tag: "g", parentId: null, transform: identityTransform() }],
      [
        "node-lower",
        { tag: "g", parentId: "node-upper", transform: { ...identityTransform(), x: 100 } },
      ],
      [
        "node-art",
        {
          tag: "path",
          parentId: null,
          transform: identityTransform(),
          geometry: [
            {
              closed: false,
              points: [
                { x: 0, y: 0, in: null, out: { x: 20, y: 0 } },
                { x: 100, y: 0, in: { x: 80, y: 0 }, out: { x: 120, y: 0 } },
                { x: 200, y: 0, in: { x: 180, y: 0 }, out: null },
              ],
            },
          ],
        },
      ],
    ]),
    rig: RigDocument = {
      version: 2,
      bones: ["node-upper", "node-lower"].map((targetId) => ({
        targetId,
        length: 100,
        minRotation: -180,
        maxRotation: 180,
      })),
      constraints: [],
      targets: [],
    };
  return { objects, rig };
}
test("captured inverse-bind skinning keeps the real rest pose, blends joints and carries attached handles before publishing", () => {
  const { objects, rig } = fixture(),
    skin = captureSkin(rig, objects, "node-art", ["node-upper", "node-lower"], "skin-arm"),
    context = createRigContext({ ...rig, skins: [skin] }, objects),
    before = structuredClone(objects),
    base = objects.get("node-art")?.geometry;
  expect(evaluateRig(context, new Map()).geometry.get("node-art")).toEqual(base);
  expect(skin.weights[1]).toEqual([
    { boneId: "node-lower", weight: 0.5 },
    { boneId: "node-upper", weight: 0.5 },
  ]);
  const result = evaluateRig(
      context,
      new Map([["node-lower", { ...identityTransform(), x: 100, rotation: 90 }]]),
    ),
    points = result.geometry.get("node-art")?.[0]?.points;
  expect(points?.[0]?.x).toBeCloseTo(0, 8);
  expect(points?.[2]?.x).toBeCloseTo(100, 8);
  expect(points?.[2]?.y).toBeCloseTo(100, 8);
  expect(points?.[1]?.out?.x).toBeCloseTo(110, 8);
  expect(points?.[1]?.out?.y).toBeCloseTo(10, 8);
  expect(objects).toEqual(before);
  expect(() => evaluateRig(context, new Map(), { remaining: 1 })).toThrow(/orçamento/);
});
test("reference matrices include reflected/nonuniform mesh spaces, and malformed weights/topology/bone references never become a frame", () => {
  const { objects, rig } = fixture(),
    art = objects.get("node-art");
  if (!art) throw new Error("Missing art");
  art.transform = {
    ...identityTransform(),
    x: 10,
    y: 20,
    rotation: 25,
    sx: 2,
    sy: -3,
    px: 5,
    py: 8,
    skewX: 10,
  };
  const skin = captureSkin(rig, objects, "node-art", ["node-upper", "node-lower"], "skin-arm"),
    result = evaluateRig(
      createRigContext({ ...rig, skins: [skin] }, objects),
      new Map(),
    ).geometry.get("node-art");
  for (const [index, point] of art.geometry?.[0]?.points.entries() ?? []) {
    expect(result?.[0]?.points[index]?.x).toBeCloseTo(point.x, 8);
    expect(result?.[0]?.points[index]?.y).toBeCloseTo(point.y, 8);
  }
  expect(() =>
    parseRig({ ...rig, skins: [{ ...skin, weights: skin.weights.slice(1) }] }, objects),
  ).toThrow(/topologia/);
  expect(() =>
    parseRig(
      {
        ...rig,
        skins: [
          { ...skin, weights: skin.weights.map(() => [{ boneId: "node-upper", weight: 0.5 }]) },
        ],
      },
      objects,
    ),
  ).toThrow(/soma 1/);
  expect(() => parseRig({ ...rig, bones: [], skins: [skin] }, objects)).toThrow(/Osso/);
  expect(() =>
    parseRig({ ...rig, skins: [{ ...skin, bindMatrix: [0, 0, 0, 0, 0, 0] }] }, objects),
  ).toThrow(/singular/);
});
