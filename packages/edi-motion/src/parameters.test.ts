import { expect, test } from "vitest";
import {
  advanceBehavior,
  createBehaviorContext,
  createBehaviorSession,
  evaluateBehavior,
  fireBehaviorTrigger,
  setBehaviorInput,
  writeBehaviorBinding,
} from "./behavior/engine";
import { type Behavior, emptyBehavior } from "./behavior/model";
import { evaluateNumericKeys } from "./evaluator";
import { type Animation, identityTransform, propertySchema } from "./model";
import { evaluateParameters, type ParameterContext } from "./parameters";
import { driverFrames } from "./playback";
import { parseRig, rigParameterKey, validateRigAnimations } from "./rig/model";

const parameter = rigParameterKey([], "constraint-copy", "strength"),
  keys = (value: number) => [
    { id: `key-${String(value).replace(".", "-")}`, frame: 0, value, easing: "linear" as const },
  ];
function fixture() {
  const animations: Animation[] = [0, 1, 2].map((index) => ({
    id: `animation-${index}`,
    name: `Clip ${index}`,
    fps: 10,
    frames: 10,
    mode: "once",
    tracks: [],
  }));
  const parameters: ParameterContext = {
    definitions: new Map([
      [
        parameter,
        { initial: 0.2, bounds: [0, 1], discrete: false, ownerIds: ["node-a", "node-b"] },
      ],
    ]),
    clips: new Map(
      animations.map((clip, index) => [
        clip.id,
        [{ key: parameter, clockId: null, keys: keys([0, 1, 0.8][index] ?? 0) }],
      ]),
    ),
  };
  const behavior: Behavior = {
    ...emptyBehavior(),
    inputs: [
      { id: "input-go", name: "Go", kind: "trigger" },
      { id: "input-mood", name: "Mood", kind: "number", min: 0, max: 1, initial: 0.5 },
    ],
    defaultMachineId: "machine-test",
    machines: [
      {
        id: "machine-test",
        name: "Test",
        layers: [
          {
            id: "layer-test",
            name: "Test",
            entryStateId: "state-0",
            weight: 1,
            mode: "override",
            targetIds: [],
            properties: [...propertySchema.options],
            states: animations.map((clip, index) => ({
              kind: "animation",
              id: `state-${index}`,
              name: clip.name,
              animationId: clip.id,
              speed: 1,
              x: index * 100,
              y: 0,
            })),
            transitions: [
              {
                id: "transition-01",
                from: "state-0",
                to: "state-1",
                conditions: [{ inputId: "input-go", operator: "trigger" }],
                priority: 0,
                exitAt: null,
                duration: 1,
                easing: "linear",
                interrupt: "immediate",
              },
              {
                id: "transition-12",
                from: "state-1",
                to: "state-2",
                conditions: [{ inputId: "input-go", operator: "trigger" }],
                priority: 0,
                exitAt: null,
                duration: 1,
                easing: "linear",
                interrupt: "immediate",
              },
            ],
          },
        ],
      },
    ],
  };
  const objects = new Map(
    ["node-a", "node-b"].map((id) => [id, { tag: "g", transform: identityTransform() }]),
  );
  return { animations, parameters, behavior, objects };
}
test("parameter bindings have final priority, reversible continuous conversion and reject noninvertible discrete destinations", () => {
  const f = fixture();
  f.behavior.version = 2;
  f.behavior.bindings = [
    {
      id: "binding-strength",
      kind: "parameter",
      inputId: "input-mood",
      targetId: "constraint-copy",
      property: "strength",
      scale: 0.5,
      offset: 0.1,
      direction: "two-way",
    },
  ];
  const context = createBehaviorContext(f.behavior, f.animations, f.objects, {
      parameters: f.parameters,
    }),
    session = createBehaviorSession(context);
  expect(evaluateBehavior(context, session).parameters.get(parameter)).toBeCloseTo(0.35);
  const reversed = writeBehaviorBinding(context, session, "binding-strength", 0.5);
  expect(reversed.inputs.get("input-mood")).toBeCloseTo(0.8);
  expect(evaluateBehavior(context, reversed).parameters.get(parameter)).toBe(0.5);
  expect(session.inputs.get("input-mood")).toBe(0.5);
  expect(() => writeBehaviorBinding(context, session, "binding-strength", 1.1)).toThrow(/inválido/);
  const binding = f.behavior.bindings[0];
  if (!binding) throw new Error("Missing binding");
  expect(() =>
    createBehaviorContext({ ...f.behavior, version: 1 }, f.animations, f.objects, {
      parameters: f.parameters,
    }),
  ).toThrow(/v2/);
  expect(() =>
    createBehaviorContext(
      { ...f.behavior, bindings: [binding, { ...binding, id: "binding-duplicate" }] },
      f.animations,
      f.objects,
      { parameters: f.parameters },
    ),
  ).toThrow(/conflitantes/);
  const definitions = new Map(f.parameters.definitions);
  definitions.set(parameter, { initial: 0, bounds: [0, 1], discrete: true, ownerIds: ["node-a"] });
  expect(() =>
    createBehaviorContext(f.behavior, f.animations, f.objects, {
      parameters: { ...f.parameters, definitions },
    }),
  ).toThrow(/contínua invertível/);
});
test("discrete additive layers are refused during validation; zero-weight layers remain inactive", () => {
  const f = fixture(),
    layer = f.behavior.machines[0]?.layers[0];
  if (!layer) throw new Error("Missing layer");
  layer.mode = "additive";
  const definitions = new Map(f.parameters.definitions);
  definitions.set(parameter, { initial: 0, bounds: [0, 1], discrete: true, ownerIds: ["node-a"] });
  const parameters = { ...f.parameters, definitions };
  expect(() => createBehaviorContext(f.behavior, f.animations, f.objects, { parameters })).toThrow(
    /discreto/,
  );
  layer.weight = 0;
  const context = createBehaviorContext(f.behavior, f.animations, f.objects, { parameters });
  expect(evaluateBehavior(context, createBehaviorSession(context)).parameters.get(parameter)).toBe(
    0,
  );
});
test("numeric channels share exact interpolation, elastic bounds and discrete left-held values", () => {
  const values = [
    {
      id: "key-a",
      frame: 0,
      value: 0,
      easing: { kind: "elastic" as const, amplitude: 1, period: 0.3 },
    },
    { id: "key-b", frame: 10, value: 1, easing: "linear" as const },
  ];
  expect(evaluateNumericKeys(values, 4, [0, 1])).toBe(1);
  expect(evaluateNumericKeys(values, 9.99, [0, 1], true)).toBe(0);
  expect(evaluateNumericKeys(values, 10, [0, 1], true)).toBe(1);
});
test("parameter transitions freeze the actual interrupted blend, masks cover every owner, and additive layers use authored defaults", () => {
  const f = fixture(),
    context = createBehaviorContext(f.behavior, f.animations, f.objects, {
      parameters: f.parameters,
    }),
    initial = createBehaviorSession(context),
    blending = advanceBehavior(context, fireBehaviorTrigger(context, initial, "input-go"), 0.25);
  expect(blending.frame.parameters.get(parameter)).toBe(0.25);
  const interrupted = advanceBehavior(
    context,
    fireBehaviorTrigger(context, blending.session, "input-go"),
    0,
  );
  expect(interrupted.frame.parameters.get(parameter)).toBe(0.25);
  expect(
    advanceBehavior(context, interrupted.session, 0.5).frame.parameters.get(parameter),
  ).toBeCloseTo(0.525);
  expect(evaluateBehavior(context, blending.session).parameters.get(parameter)).toBe(0.25);
  const layer = f.behavior.machines[0]?.layers[0];
  if (!layer) throw new Error("Missing layer");
  layer.targetIds = ["node-a"];
  const masked = createBehaviorContext(f.behavior, f.animations, f.objects, {
    parameters: f.parameters,
  });
  expect(evaluateBehavior(masked, createBehaviorSession(masked)).parameters.get(parameter)).toBe(
    0.2,
  );
  layer.targetIds = ["node-a", "node-b"];
  layer.mode = "additive";
  layer.weight = 0.5;
  layer.entryStateId = "state-1";
  const additive = createBehaviorContext(f.behavior, f.animations, f.objects, {
    parameters: f.parameters,
  });
  expect(
    evaluateBehavior(additive, createBehaviorSession(additive)).parameters.get(parameter),
  ).toBeCloseTo(0.6);
  layer.mode = "override";
  layer.weight = 1;
  layer.states = [
    {
      kind: "blend1d",
      id: "state-mood",
      name: "Mood",
      x: 0,
      y: 0,
      speed: 1,
      inputId: "input-mood",
      points: [
        { at: 0, animationId: "animation-0" },
        { at: 1, animationId: "animation-1" },
      ],
    },
  ];
  layer.entryStateId = "state-mood";
  layer.transitions = [];
  const blended = createBehaviorContext(f.behavior, f.animations, f.objects, {
      parameters: f.parameters,
    }),
    session = createBehaviorSession(blended);
  expect(evaluateBehavior(blended, session).parameters.get(parameter)).toBe(0.5);
  expect(
    evaluateBehavior(blended, setBehaviorInput(blended, session, "input-mood", 0.8)).parameters.get(
      parameter,
    ),
  ).toBe(0.8);
});
test("nested parameter clocks use the exact wrapped/ping-pong driver phase, not elapsed wall time", () => {
  const f = fixture(),
    animation = f.animations[0];
  if (!animation) throw new Error("Missing clip");
  const drivers = [
      {
        id: "node-parent",
        parentId: null,
        animation: { ...animation, mode: "ping-pong" as const },
        speed: 2,
        offsetSeconds: 0,
      },
      {
        id: "node-child",
        parentId: "node-parent",
        animation: { ...animation, id: "animation-child", mode: "once" as const },
        speed: 0.5,
        offsetSeconds: 0.1,
      },
    ],
    parameters: ParameterContext = {
      definitions: f.parameters.definitions,
      clips: new Map([
        [
          "animation-child",
          [
            {
              key: parameter,
              clockId: "node-child",
              keys: [
                { id: "key-start", frame: 0, value: 0, easing: "linear" },
                { id: "key-end", frame: 10, value: 1, easing: "linear" },
              ],
            },
          ],
        ],
      ]),
    };
  const frames = driverFrames(0.75, drivers);
  expect(frames.get("node-parent")).toBe(5);
  expect(frames.get("node-child")).toBe(3.5);
  expect(evaluateParameters(parameters, undefined, 0, 0.75, drivers).get(parameter)).toBe(0.35);
});
test("rig channels require version, live references, unique ordered keys, finite bounds and valid clip duration", () => {
  const objects = new Map(
      ["node-a", "node-b"].map((id) => [
        id,
        { tag: "g", parentId: null, transform: identityTransform() },
      ]),
    ),
    rig = {
      version: 2,
      bones: [],
      constraints: [
        {
          id: "constraint-copy",
          kind: "distance",
          ownerId: "node-a",
          targetId: "node-b",
          min: 0,
          max: 100,
          strength: 1,
        },
      ],
      parameterClips: [
        {
          animationId: "animation-0",
          tracks: [
            {
              id: "track-strength",
              targetId: "constraint-copy",
              property: "strength",
              keys: keys(0.8),
            },
          ],
        },
      ],
    };
  const parsed = parseRig(rig, objects);
  validateRigAnimations(parsed, fixture().animations);
  expect(() => parseRig({ ...rig, version: 1 }, objects)).toThrow(/v2/);
  expect(() => parseRig({ ...rig, constraints: [] }, objects)).toThrow(/órfão/);
  expect(() =>
    parseRig(
      {
        ...rig,
        parameterClips: [
          {
            animationId: "animation-0",
            tracks: [{ ...rig.parameterClips[0]?.tracks[0], keys: keys(2) }],
          },
        ],
      },
      objects,
    ),
  ).toThrow(/limites/);
  expect(() => validateRigAnimations(parsed, [])).toThrow(/existente/);
});
