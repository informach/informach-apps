import { describe, expect, test } from "vitest";
import { type Animation, identityTransform, propertySchema } from "../model";
import {
  advanceBehavior,
  createBehaviorContext,
  createBehaviorSession,
  evaluateBehavior,
  fireBehaviorTrigger,
  setBehaviorInput,
  writeBehaviorBinding,
} from "./engine";
import { timelineEventsBetween } from "./events";
import { type Behavior, emptyBehavior, parseBehavior } from "./model";

function fixture() {
  const animations: Animation[] = [0, 100, 200].map((x, index) => ({
    id: `animation-${index}`,
    name: `Clip ${index}`,
    fps: 10,
    frames: 10,
    mode: "once",
    tracks: [
      {
        id: `track-${index}`,
        targetId: "node-body",
        property: "x",
        keys: [{ id: `key-${index}`, frame: 0, value: x, easing: "linear" }],
      },
    ],
  }));
  const behavior: Behavior = {
    ...emptyBehavior(),
    inputs: [
      { id: "input-go", name: "Acenar", kind: "trigger" },
      { id: "input-mood", name: "Humor", kind: "number", min: 0, max: 1, initial: 0.5 },
      { id: "input-name", name: "Nome", kind: "string", initial: "Ana" },
    ],
    defaultMachineId: "machine-main",
    machines: [
      {
        id: "machine-main",
        name: "Interação",
        layers: [
          {
            id: "layer-body",
            name: "Corpo",
            entryStateId: "state-idle",
            weight: 1,
            mode: "override",
            targetIds: [],
            properties: [...propertySchema.options],
            states: [0, 1, 2].map((index) => ({
              id: ["state-idle", "state-wave", "state-jump"][index] ?? "state-invalid",
              name: `State ${index}`,
              x: index * 200,
              y: 100,
              speed: 1,
              kind: "animation",
              animationId: `animation-${index}`,
            })),
            transitions: [
              {
                id: "transition-wave",
                from: "state-idle",
                to: "state-wave",
                conditions: [{ inputId: "input-go", operator: "trigger" }],
                priority: 0,
                exitAt: null,
                duration: 0.2,
                easing: "linear",
                interrupt: "never",
              },
              {
                id: "transition-end",
                from: "state-wave",
                to: "state-idle",
                conditions: [],
                priority: 0,
                exitAt: 1,
                duration: 0.2,
                easing: "linear",
                interrupt: "never",
              },
            ],
          },
        ],
      },
    ],
  };
  const objects = new Map([
    ["node-body", { tag: "rect", transform: identityTransform() }],
    ["node-name", { tag: "text", transform: identityTransform() }],
  ]);
  return { behavior, animations, objects };
}
describe("authored behavior engine", () => {
  test("trigger, exact exit and continuous blend are deterministic and leave the input session untouched", () => {
    const f = fixture(),
      context = createBehaviorContext(f.behavior, f.animations, f.objects);
    const initial = createBehaviorSession(context),
      fired = fireBehaviorTrigger(context, initial, "input-go"),
      before = structuredClone(fired);
    const middle = advanceBehavior(context, fired, 0.1);
    expect(middle.frame.poses.get("node-body")?.x).toBe(50);
    expect(fired).toEqual(before);
    expect(middle.session.triggers.size).toBe(0);
    const full = advanceBehavior(context, fired, 0.2);
    expect(full.frame.poses.get("node-body")?.x).toBe(100);
    const exit = advanceBehavior(context, full.session, 0.8);
    expect(exit.session.layers.get("layer-body")?.stateId).toBe("state-idle");
    expect(exit.frame.poses.get("node-body")?.x).toBe(100);
    expect(advanceBehavior(context, exit.session, 0.1).frame.poses.get("node-body")?.x).toBe(50);
    let stepped = fired;
    for (const step of [0.07, 0.13, 0.3, 0.2, 0.3, 0.2])
      stepped = advanceBehavior(context, stepped, step).session;
    const once = advanceBehavior(context, fired, 1.2);
    expect(evaluateBehavior(context, stepped).poses.get("node-body")?.x).toBeCloseTo(
      once.frame.poses.get("node-body")?.x ?? -1,
      8,
    );
  });
  test("layers broadcast triggers once, apply masks/weights and blend 1D using a common normalized phase", () => {
    const f = fixture(),
      first = f.behavior.machines[0]?.layers[0];
    if (!first || !f.behavior.machines[0]) throw new Error("Missing layer");
    const face = structuredClone(first);
    face.id = "layer-face";
    face.mode = "additive";
    face.weight = 0.5;
    face.entryStateId = "state-face-idle";
    face.states = [
      {
        id: "state-face-idle",
        name: "Face",
        x: 0,
        y: 0,
        speed: 1,
        kind: "blend1d",
        inputId: "input-mood",
        points: [
          { at: 0, animationId: "animation-0" },
          { at: 1, animationId: "animation-2" },
        ],
      },
      {
        id: "state-face-wave",
        name: "Wave",
        x: 100,
        y: 0,
        speed: 1,
        kind: "animation",
        animationId: "animation-2",
      },
    ];
    face.transitions = [
      {
        id: "transition-face",
        from: "state-face-idle",
        to: "state-face-wave",
        conditions: [{ inputId: "input-go", operator: "trigger" }],
        priority: 0,
        exitAt: null,
        duration: 0,
        easing: "linear",
        interrupt: "never",
      },
    ];
    f.behavior.machines[0].layers.push(face);
    const context = createBehaviorContext(f.behavior, f.animations, f.objects),
      initial = createBehaviorSession(context);
    expect(evaluateBehavior(context, initial).poses.get("node-body")?.x).toBe(50);
    const advanced = advanceBehavior(
      context,
      fireBehaviorTrigger(context, initial, "input-go"),
      0.2,
    );
    expect(advanced.frame.poses.get("node-body")?.x).toBe(200);
    expect(advanced.session.layers.get("layer-face")?.stateId).toBe("state-face-wave");
    expect(
      evaluateBehavior(context, setBehaviorInput(context, initial, "input-mood", 0)).poses.get(
        "node-body",
      )?.x,
    ).toBe(0);
  });
  test("interruptions freeze the mixed source, priorities win and cycles fail atomically", () => {
    const f = fixture(),
      layer = f.behavior.machines[0]?.layers[0];
    if (!layer?.transitions[0]) throw new Error("Missing transition");
    layer.transitions[0].interrupt = "immediate";
    layer.transitions.push({
      id: "transition-jump",
      from: "*",
      to: "state-jump",
      conditions: [{ inputId: "input-mood", operator: "gt", value: 0.8 }],
      priority: 10,
      exitAt: null,
      duration: 0.2,
      easing: "linear",
      interrupt: "never",
    });
    const context = createBehaviorContext(f.behavior, f.animations, f.objects),
      initial = createBehaviorSession(context);
    const half = advanceBehavior(context, fireBehaviorTrigger(context, initial, "input-go"), 0.1);
    const input = setBehaviorInput(context, half.session, "input-mood", 1),
      start = advanceBehavior(context, input, 0);
    expect(start.frame.poses.get("node-body")?.x).toBe(50);
    expect(advanceBehavior(context, start.session, 0.1).frame.poses.get("node-body")?.x).toBe(125);
    layer.transitions = [
      { ...layer.transitions[0], conditions: [], duration: 0, interrupt: "never" },
      {
        id: "transition-cycle",
        from: "state-wave",
        to: "state-idle",
        conditions: [],
        priority: 0,
        exitAt: null,
        duration: 0,
        easing: "linear",
        interrupt: "never",
      },
    ];
    const cyclic = createBehaviorContext(f.behavior, f.animations, f.objects),
      source = createBehaviorSession(cyclic),
      before = structuredClone(source);
    expect(() => advanceBehavior(cyclic, source, 0.1)).toThrow(/Ciclo/);
    expect(source).toEqual(before);
  });
  test("bindings have strict types, explicit conversions and reversible writes without observer loops", () => {
    const f = fixture();
    f.behavior.bindings = [
      {
        id: "binding-name",
        inputId: "input-name",
        targetId: "node-name",
        kind: "text",
        direction: "two-way",
      },
      {
        id: "binding-x",
        inputId: "input-mood",
        targetId: "node-body",
        kind: "transform",
        property: "x",
        scale: 100,
        offset: 20,
        direction: "two-way",
      },
    ];
    const context = createBehaviorContext(f.behavior, f.animations, f.objects),
      initial = createBehaviorSession(context);
    expect(evaluateBehavior(context, initial).poses.get("node-body")?.x).toBe(70);
    expect(evaluateBehavior(context, initial).text.get("node-name")).toBe("Ana");
    const reversed = writeBehaviorBinding(context, initial, "binding-x", 120);
    expect(reversed.inputs.get("input-mood")).toBe(1);
    expect(initial.inputs.get("input-mood")).toBe(0.5);
    expect(setBehaviorInput(context, initial, "input-name", "Ana")).toBe(initial);
    expect(() => writeBehaviorBinding(context, initial, "binding-x", 121)).toThrow(/intervalo/);
    expect(() => setBehaviorInput(context, initial, "input-name", 4)).toThrow(/texto/);
  });
  test("events fire exactly on forward/reverse crossings, not on seek, and excessive work refuses", () => {
    const f = fixture(),
      animation = f.animations[0];
    if (!animation) throw new Error("Missing animation");
    f.behavior.events = [
      {
        id: "event-middle",
        animationId: animation.id,
        frame: 5,
        name: "acenou",
        data: { count: 1 },
      },
      { id: "event-zero", animationId: animation.id, frame: 0, name: "entrou", data: {} },
    ];
    const context = createBehaviorContext(f.behavior, f.animations, f.objects),
      initial = createBehaviorSession(context);
    const first = advanceBehavior(context, initial, 0.5);
    expect(first.events.map((event) => event.name)).toEqual(["entrou", "acenou"]);
    expect(advanceBehavior(context, first.session, 0.5).events).toEqual([]);
    expect(evaluateBehavior(context, initial).poses.get("node-body")?.x).toBe(0);
    animation.mode = "ping-pong";
    expect(
      timelineEventsBetween(f.behavior.events, animation, 0, 2, true).map((event) => [
        event.event.name,
        event.direction,
        event.seconds,
      ]),
    ).toEqual([
      ["entrou", "forward", 0],
      ["acenou", "forward", 0.5],
      ["acenou", "reverse", 1.5],
      ["entrou", "forward", 2],
    ]);
    expect(() => timelineEventsBetween(f.behavior.events, animation, 0, 20000)).toThrow(
      /Orçamento|orçamento/,
    );
  });
  test("schema rejects orphan references, duplicate destinations, wrong kinds and hostile aggregate cost", () => {
    const f = fixture();
    expect(() => parseBehavior({ ...f.behavior, future: true }, f.objects, f.animations)).toThrow();
    const orphan = structuredClone(f.behavior);
    const layer = orphan.machines[0]?.layers[0];
    if (!layer) throw new Error("Missing layer");
    layer.entryStateId = "state-orphan";
    expect(() => parseBehavior(orphan, f.objects, f.animations)).toThrow(/entrada/);
    expect(() =>
      parseBehavior({ ...f.behavior, events: Array(10001).fill(null) }, f.objects, f.animations),
    ).toThrow(/Array/);
    const binding = {
      id: "binding-x",
      kind: "transform",
      inputId: "input-mood",
      targetId: "node-body",
      property: "x",
      scale: 0,
      offset: 0,
      direction: "two-way",
    };
    expect(() =>
      parseBehavior({ ...f.behavior, bindings: [binding] }, f.objects, f.animations),
    ).toThrow(/invertível/);
    expect(() =>
      parseBehavior(
        {
          ...f.behavior,
          bindings: [
            { ...binding, scale: 1 },
            { ...binding, id: "binding-y", scale: 1 },
          ],
        },
        f.objects,
        f.animations,
      ),
    ).toThrow(/conflitantes/);
  });
});
