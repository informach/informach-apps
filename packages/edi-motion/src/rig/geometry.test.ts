import { expect, test } from "vitest";
import { identityMatrix, transformPoint } from "../affine";
import {
  arcTable,
  assertSameTopology,
  type Geometry,
  geometryPath,
  parseGeometry,
  sampleArc,
} from "../geometry";
import { identityTransform } from "../model";
import { createRigContext, evaluateRig } from "./constraints";
import type { RigObject } from "./kinematics";
import { parseRig, type RigDocument, rigParameterKey } from "./model";

const point = (x: number, y: number) => ({ x, y, in: null, out: null });
test("canonical geometry retains handles/contours, rejects topology loss and bounds before cloning", () => {
  const geometry: Geometry = [
      {
        closed: true,
        points: [point(0, 0), { ...point(100, 0), in: { x: 80, y: 20 } }, point(0, 100)],
      },
    ],
    text = geometryPath(parseGeometry(geometry));
  expect(text).toContain("C0 0 80 20 100 0");
  expect(text).toMatch(/Z$/);
  expect(() =>
    assertSameTopology(geometry, [
      { closed: true, points: [point(0, 0), point(100, 0), point(0, 100)] },
    ]),
  ).toThrow(/alças/);
  expect(() =>
    parseGeometry([{ closed: false, points: Array.from({ length: 4001 }, () => point(0, 0)) }]),
  ).toThrow(/4000/);
});
test("adaptive arclength preserves collinear backtracking, reports work limits, and samples in transformed world space", () => {
  const contour = {
      closed: false,
      points: [
        { ...point(0, 0), out: { x: 100, y: 0 } },
        { ...point(0, 0), in: { x: 100, y: 0 } },
      ],
    },
    table = arcTable(contour, identityMatrix(), 0.001, { remaining: 2_000_000 });
  expect(table.at(-1)?.distance).toBeCloseTo(150, 3);
  expect(sampleArc(table, 0.5).x).toBeCloseTo(75, 3);
  expect(() => arcTable(contour, identityMatrix(), 0.001, { remaining: 1 })).toThrow(/orçamento/);
  const straight = arcTable(
    { closed: false, points: [point(0, 0), point(100, 0)] },
    [0, 2, -3, 0, 10, 20],
    0.01,
    { remaining: 100 },
  );
  expect(sampleArc(straight, 0.5)).toEqual({ x: 10, y: 120, angle: 90 });
});
test("follow-path respects nonuniform/rotated parent bases, offsets, pivots, parameter progress and graph dependencies", () => {
  const objects = new Map<string, RigObject>([
      [
        "node-path",
        {
          tag: "path",
          parentId: null,
          transform: identityTransform(),
          basis: [0, 2, -3, 0, 10, 20],
          geometry: [{ closed: false, points: [point(0, 0), point(100, 0)] }],
        },
      ],
      [
        "node-parent",
        {
          tag: "g",
          parentId: null,
          transform: { ...identityTransform(), rotation: 35, sx: 2, sy: -3 },
        },
      ],
      [
        "node-owner",
        {
          tag: "g",
          parentId: "node-parent",
          transform: { ...identityTransform(), px: 8, py: 5, skewX: 15 },
        },
      ],
    ]),
    rig: RigDocument = {
      version: 2,
      bones: [],
      targets: [],
      constraints: [
        {
          id: "constraint-path",
          kind: "path",
          ownerId: "node-owner",
          targetId: "node-path",
          contour: 0,
          progress: 0,
          orient: true,
          rotationOffset: 0,
          offset: 10,
          tolerance: 0.01,
          strength: 1,
        },
      ],
    },
    before = structuredClone(objects),
    result = evaluateRig(
      createRigContext(rig, objects),
      new Map(),
      undefined,
      undefined,
      new Map([[rigParameterKey([], "constraint-path", "progress"), 0.5]]),
    ),
    matrix = result.world.get("node-owner");
  if (!matrix) throw new Error("Missing world matrix");
  expect(matrix[4]).toBeCloseTo(0, 8);
  expect(matrix[5]).toBeCloseTo(120, 8);
  const axis = transformPoint(matrix, 1, 0);
  expect(axis.x).toBeCloseTo(0, 8);
  expect(axis.y).toBeGreaterThan(120);
  expect(objects).toEqual(before);
  expect(() =>
    parseRig({ ...rig, constraints: [{ ...rig.constraints[0], targetId: "node-owner" }] }, objects),
  ).toThrow();
});
test("morphs compose base-relative anchor/handle deltas without mutating source, while solos stay discrete and reversible", () => {
  const geometry: Geometry = [
      {
        closed: false,
        points: [
          { ...point(0, 0), out: { x: 20, y: 0 } },
          { ...point(100, 0), in: { x: 80, y: 0 } },
        ],
      },
    ],
    pose = structuredClone(geometry);
  if (!pose[0]?.points[0]?.out || !pose[0]?.points[1]?.in) throw new Error("Missing handles");
  pose[0].points[0].out.y = 40;
  pose[0].points[1].in.y = 40;
  pose[0].points[1].y = 20;
  const objects = new Map<string, RigObject>([
      ["node-mouth", { tag: "path", parentId: null, transform: identityTransform(), geometry }],
      ["node-face", { tag: "g", parentId: null, transform: identityTransform() }],
      ["node-smile", { tag: "g", parentId: "node-face", transform: identityTransform() }],
      ["node-sad", { tag: "g", parentId: "node-face", transform: identityTransform() }],
    ]),
    rig: RigDocument = {
      version: 2,
      bones: [],
      targets: [],
      constraints: [],
      morphs: [
        { id: "morph-smile", name: "Smile", targetId: "node-mouth", geometry: pose, weight: 0 },
      ],
      solos: [
        {
          id: "solo-face",
          targetId: "node-face",
          children: ["node-smile", "node-sad"],
          activeIndex: 0,
        },
      ],
    },
    context = createRigContext(rig, objects),
    before = structuredClone(objects),
    result = evaluateRig(
      context,
      new Map(),
      undefined,
      undefined,
      new Map([
        [rigParameterKey([], "morph-smile", "weight"), 0.5],
        [rigParameterKey([], "solo-face", "activeIndex"), 1],
      ]),
    );
  expect(result.geometry.get("node-mouth")?.[0]?.points[0]?.out?.y).toBe(20);
  expect(result.geometry.get("node-mouth")?.[0]?.points[1]?.y).toBe(10);
  expect(result.visibility.get("node-smile")).toBe(false);
  expect(result.visibility.has("node-sad")).toBe(false);
  expect(evaluateRig(context, new Map()).visibility.has("node-smile")).toBe(false);
  expect(objects).toEqual(before);
  expect(() =>
    evaluateRig(
      context,
      new Map(),
      undefined,
      undefined,
      new Map([[rigParameterKey([], "solo-face", "activeIndex"), 0.5]]),
    ),
  ).toThrow(/Índice/);
});
