import { expect, test } from "vitest";
import {
  advanceBehavior,
  createBehaviorContext,
  createBehaviorSession,
  fireBehaviorTrigger,
} from "../behavior/engine";
import { type Behavior, type BehaviorState, emptyBehavior } from "../behavior/model";
import { geometryPath } from "../geometry";
import { paintLayerPaths } from "../graphics/paintLayers";
import { type Animation, identityTransform, propertySchema } from "../model";
import { parseSvgPath } from "../svgPath";
import { createRigContext, evaluateRig } from "./constraints";
import {
  captureSkin,
  parseRig,
  type RigDocument,
  remapRig,
  rigCost,
  rigOwners,
  rigParameterContext,
  rigParameterDefinitions,
  rigParameterKey,
  upgradeRigVersion,
} from "./index";
import type { RigObject } from "./kinematics";

function fixture() {
  const objects = new Map<string, RigObject>([
    [
      "node-path",
      {
        tag: "path",
        parentId: null,
        transform: identityTransform(),
        geometry: parseSvgPath("M0 0L100 0"),
      },
    ],
    ["node-owner", { tag: "g", parentId: null, transform: identityTransform() }],
  ]);
  const rig: RigDocument = {
    version: 3,
    bones: [],
    constraints: [],
    targets: [],
    trims: [
      {
        id: "trim-line",
        targetId: "node-path",
        start: 0.25,
        end: 0.75,
        offset: 0,
        tolerance: 0.0001,
        mode: "parallel",
      },
    ],
  };
  return { objects, rig };
}

test("feature writers upgrade rig versions monotonically for every supported version pair", () => {
  const versions: readonly RigDocument["version"][] = [1, 2, 3];
  for (const current of versions)
    for (const required of versions)
      expect(upgradeRigVersion(current, required)).toBe(Math.max(current, required));
});

test("rig v3 owns typed trim channels, references and aggregate costs without admitting them in old rigs", () => {
  const { objects, rig } = fixture();
  expect(parseRig(rig, objects)).toEqual(rig);
  for (const version of [1, 2]) {
    expect(() => parseRig({ ...rig, version }, objects)).toThrow(/v3/);
    expect(() => parseRig({ ...rig, version, trims: [] }, objects)).toThrow(/v3/);
  }
  const definitions = rigParameterDefinitions(rig);
  expect(definitions.get(rigParameterKey([], "trim-line", "end"))).toEqual({
    initial: 0.75,
    bounds: [0, 1],
    discrete: false,
    ownerIds: ["node-path"],
  });
  expect(definitions.get(rigParameterKey([], "trim-line", "offset"))?.bounds).toEqual([
    -36000, 36000,
  ]);
  expect(rigOwners(rig)).toEqual(new Set(["node-path"]));
  expect(rigCost(rig).deformers).toBe(1);
  const copy = remapRig(rig, (id) => `${id}-copy`);
  expect(copy.trims?.[0]?.targetId).toBe("node-path-copy");
  expect(copy.trims?.[0]?.id).toBe("trim-line");
  expect(rig.trims?.[0]?.targetId).toBe("node-path");
  expect(() =>
    parseRig({ ...rig, trims: [rig.trims?.[0], { ...rig.trims?.[0], id: "trim-other" }] }, objects),
  ).toThrow(/único/);
  expect(() =>
    parseRig({ ...rig, trims: [{ ...rig.trims?.[0], targetId: "node-owner" }] }, objects),
  ).toThrow(/caminho local/);
});

test("trim runs after morph but reference-path constraints do not follow the visually clipped result", () => {
  const { objects, rig } = fixture();
  rig.morphs = [
    {
      id: "morph-long",
      name: "Long",
      targetId: "node-path",
      geometry: parseSvgPath("M0 0L200 0"),
      weight: 1,
    },
  ];
  rig.constraints = [
    {
      id: "constraint-follow",
      kind: "path",
      ownerId: "node-owner",
      targetId: "node-path",
      contour: 0,
      progress: 1,
      orient: false,
      offset: 0,
      rotationOffset: 0,
      tolerance: 0.001,
      strength: 1,
    },
  ];
  const context = createRigContext(rig, objects),
    before = structuredClone(objects),
    frame = evaluateRig(context, new Map());
  expect(frame.geometry.get("node-path")?.[0]?.points[0]?.x).toBeCloseTo(50, 4);
  expect(frame.geometry.get("node-path")?.[0]?.points.at(-1)?.x).toBeCloseTo(150, 4);
  expect(frame.poses.get("node-owner")?.x).toBe(200);
  expect(objects).toEqual(before);
  const empty = evaluateRig(
    context,
    new Map(),
    undefined,
    undefined,
    new Map([
      [rigParameterKey([], "trim-line", "start"), 0.5],
      [rigParameterKey([], "trim-line", "end"), 0.5],
    ]),
  );
  expect(empty.geometry.get("node-path")).toEqual([]);
  expect(evaluateRig(context, new Map()).geometry).toEqual(frame.geometry);
  expect(objects).toEqual(before);
});

test("full trim leaves the original path untouched, or retains the existing deformed geometry; invalid parameters fail without source mutation", () => {
  const { objects, rig } = fixture(),
    before = structuredClone(objects);
  const full = new Map([
    [rigParameterKey([], "trim-line", "start"), 0],
    [rigParameterKey([], "trim-line", "end"), 1],
  ]);
  expect(
    evaluateRig(createRigContext(rig, objects), new Map(), undefined, undefined, full).geometry
      .size,
  ).toBe(0);
  for (const value of [NaN, -1, 2])
    expect(() =>
      evaluateRig(
        createRigContext(rig, objects),
        new Map(),
        undefined,
        undefined,
        new Map([[rigParameterKey([], "trim-line", "end"), value]]),
      ),
    ).toThrow(/perfil/);
  expect(() => evaluateRig(createRigContext(rig, objects), new Map(), { remaining: 1 })).toThrow(
    /orçamento/,
  );
  expect(objects).toEqual(before);
});

test("trim measures the skinned curve after bone deformation and a full interval retains the skin output", () => {
  const { objects, rig } = fixture();
  rig.bones = [{ targetId: "node-owner", length: 100, minRotation: -180, maxRotation: 180 }];
  rig.skins = [captureSkin(rig, objects, "node-path", ["node-owner"], "skin-trim")];
  const before = structuredClone(objects),
    context = createRigContext(rig, objects),
    poses = new Map([["node-owner", { ...identityTransform(), rotation: 90 }]]),
    frame = evaluateRig(context, poses),
    points = frame.geometry.get("node-path")?.[0]?.points;
  expect(points?.[0]?.x).toBeCloseTo(0, 4);
  expect(points?.[0]?.y).toBeCloseTo(25, 4);
  expect(points?.at(-1)?.y).toBeCloseTo(75, 4);
  const full = evaluateRig(
    context,
    poses,
    undefined,
    undefined,
    new Map([
      [rigParameterKey([], "trim-line", "start"), 0],
      [rigParameterKey([], "trim-line", "end"), 1],
    ]),
  );
  expect(full.geometry.get("node-path")?.[0]?.points.at(-1)?.y).toBeCloseTo(100, 4);
  expect(objects).toEqual(before);
});

test("aggregate transient geometry is bounded even when every individual closed trim stays within 4000 vertices", () => {
  const { objects, rig } = fixture();
  objects.clear();
  rig.trims = [];
  for (let index = 0; index < 26; index++) {
    const id = `node-large-${index}`,
      count = index < 25 ? 3999 : 25;
    objects.set(id, {
      tag: "path",
      parentId: null,
      transform: identityTransform(),
      geometry: [
        {
          closed: true,
          points: Array.from({ length: count }, (_, point) => ({
            x: 100 * Math.cos((point * 2 * Math.PI) / count),
            y: 100 * Math.sin((point * 2 * Math.PI) / count),
            in: null,
            out: null,
          })),
        },
      ],
    });
    rig.trims.push({
      id: `trim-large-${index}`,
      targetId: id,
      start: 0.00001,
      end: 0.99999,
      offset: 0,
      tolerance: 0.01,
      mode: "parallel",
    });
  }
  const context = createRigContext(rig, objects),
    before = structuredClone(objects);
  expect(() => evaluateRig(context, new Map())).toThrow(/agregado de geometria/);
  expect(objects).toEqual(before);
});

test("trim channels follow real transition blends and immediate interruptions, including layer owner masks", () => {
  const { objects, rig } = fixture(),
    trim = rig.trims?.[0];
  if (!trim) throw new Error("Missing trim");
  trim.start = 0;
  trim.end = 0;
  const animations: Animation[] = [0, 1, 0.2].map((_, index) => ({
    id: `animation-blend-${index}`,
    name: `Blend ${index}`,
    fps: 10,
    frames: 10,
    mode: "once",
    tracks: [],
  }));
  rig.parameterClips = animations.map((animation, index) => ({
    animationId: animation.id,
    tracks: [
      {
        id: `track-blend-${index}`,
        targetId: trim.id,
        property: "end",
        keys: [
          { id: `key-blend-${index}`, frame: 0, value: [0, 1, 0.2][index] ?? 0, easing: "linear" },
        ],
      },
    ],
  }));
  const behavior: Behavior = {
      ...emptyBehavior(),
      version: 2,
      defaultMachineId: "machine-trim",
      inputs: [
        { id: "input-go", kind: "trigger", name: "Draw" },
        { id: "input-back", kind: "trigger", name: "Interrupt" },
      ],
      machines: [
        {
          id: "machine-trim",
          name: "Trim",
          layers: [
            {
              id: "layer-trim",
              name: "Trim",
              entryStateId: "state-trim-0",
              mode: "override",
              weight: 1,
              properties: [...propertySchema.options],
              targetIds: [],
              states: animations.map(
                (animation, index): BehaviorState => ({
                  id: `state-trim-${index}`,
                  name: `State ${index}`,
                  kind: "animation",
                  animationId: animation.id,
                  speed: 1,
                  x: index * 100,
                  y: 0,
                }),
              ),
              transitions: [
                {
                  id: "transition-draw",
                  from: "state-trim-0",
                  to: "state-trim-1",
                  conditions: [{ inputId: "input-go", operator: "trigger" }],
                  priority: 0,
                  exitAt: null,
                  duration: 0.2,
                  easing: "linear",
                  interrupt: "immediate",
                },
                {
                  id: "transition-interrupt",
                  from: "state-trim-1",
                  to: "state-trim-2",
                  conditions: [{ inputId: "input-back", operator: "trigger" }],
                  priority: 0,
                  exitAt: null,
                  duration: 0.2,
                  easing: "linear",
                  interrupt: "immediate",
                },
              ],
            },
          ],
        },
      ],
    },
    rigContext = createRigContext(rig, objects),
    context = createBehaviorContext(behavior, animations, objects, {
      parameters: rigParameterContext(rig),
    }),
    initial = createBehaviorSession(context),
    before = structuredClone(initial),
    middle = advanceBehavior(context, fireBehaviorTrigger(context, initial, "input-go"), 0.1),
    frame = evaluateRig(
      rigContext,
      middle.frame.poses,
      undefined,
      undefined,
      middle.frame.parameters,
    );
  expect(frame.geometry.get("node-path")?.[0]?.points.at(-1)?.x).toBeCloseTo(50, 4);
  const interrupted = advanceBehavior(
      context,
      fireBehaviorTrigger(context, middle.session, "input-back"),
      0.1,
    ),
    clipped = evaluateRig(
      rigContext,
      interrupted.frame.poses,
      undefined,
      undefined,
      interrupted.frame.parameters,
    );
  expect(clipped.geometry.get("node-path")?.[0]?.points.at(-1)?.x).toBeCloseTo(35, 4);
  expect(initial).toEqual(before);
  const layer = behavior.machines[0]?.layers[0];
  if (!layer) throw new Error("Missing masked layer");
  layer.targetIds = ["node-owner"];
  const maskedContext = createBehaviorContext(behavior, animations, objects, {
      parameters: rigParameterContext(rig),
    }),
    masked = advanceBehavior(
      maskedContext,
      fireBehaviorTrigger(maskedContext, createBehaviorSession(maskedContext), "input-go"),
      0.2,
    );
  expect(
    evaluateRig(
      rigContext,
      masked.frame.poses,
      undefined,
      undefined,
      masked.frame.parameters,
    ).geometry.get("node-path"),
  ).toEqual([]);
});

test("trim parameter tracks require valid destinations, ranges, unique keys and ordered frames", () => {
  const { objects, rig } = fixture();
  const clip = {
    animationId: "animation-trim",
    tracks: [
      {
        id: "track-trim",
        targetId: "trim-line",
        property: "end",
        keys: [{ id: "key-trim", frame: 0, value: 0.5, easing: "linear" }],
      },
    ],
  };
  expect(parseRig({ ...rig, parameterClips: [clip] }, objects).parameterClips).toHaveLength(1);
  for (const property of ["strength", "weight"])
    expect(() =>
      parseRig(
        { ...rig, parameterClips: [{ ...clip, tracks: [{ ...clip.tracks[0], property }] }] },
        objects,
      ),
    ).toThrow(/órfão/);
  expect(() => parseRig({ ...rig, trims: [], parameterClips: [clip] }, objects)).toThrow(/órfão/);
  expect(() =>
    parseRig(
      {
        ...rig,
        parameterClips: [
          {
            ...clip,
            tracks: [{ ...clip.tracks[0], keys: [{ ...clip.tracks[0]?.keys[0], value: 2 }] }],
          },
        ],
      },
      objects,
    ),
  ).toThrow(/limites/);
});

test("each paint row has its own trim: a layer's trim cuts only that copy", () => {
  const { objects, rig } = fixture(),
    shape = rig.trims?.[0];
  if (!shape) throw new Error("Missing trim");
  const layer = {
    ...shape,
    id: "trim-hand",
    layerId: "paint-hand",
    start: 0.9,
    end: 1,
  };
  rig.trims = [layer, shape];
  expect(parseRig(rig, objects).trims).toEqual([layer, shape]);
  expect(() =>
    parseRig({ ...rig, trims: [layer, { ...layer, id: "trim-other" }] }, objects),
  ).toThrow(/único/);
  const geometry = evaluateRig(createRigContext(rig, objects), new Map()).geometry,
    xs = (key: string) =>
      geometry.get(key)?.flatMap((contour) => contour.points.map((point) => Math.round(point.x)));
  // The layer trim reads the untrimmed path even when listed before the shape's.
  expect(xs("node-path#paint-hand")).toEqual([90, 100]);
  expect(xs("node-path")).toEqual([25, 75]);
  // Copies without their own trim keep the whole path.
  expect(xs("node-path#")).toEqual([0, 100]);
  const paths = paintLayerPaths(geometry, "node-path");
  expect(paths("paint-hand")).toBe(geometryPath(geometry.get("node-path#paint-hand") ?? []));
  expect(paths("paint-other")).toBe(geometryPath(geometry.get("node-path#") ?? []));
  rig.trims = [{ ...layer, start: 0, end: 1 }];
  const whole = evaluateRig(createRigContext(rig, objects), new Map()).geometry;
  // A full trim rewrites nothing: the copy follows the shape's path.
  expect(whole.size).toBe(0);
  expect(paintLayerPaths(whole, "node-path")("paint-hand")).toBeUndefined();
});
