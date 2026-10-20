import { describe, expect, test } from "vitest";
import {
  advanceBehavior,
  createBehaviorContext,
  createBehaviorSession,
  evaluateBehavior,
  fireBehaviorTrigger,
} from "./behavior/engine";
import { type Behavior, emptyBehavior } from "./behavior/model";
import { applyMotionCommands } from "./commands";
import { evaluateDrawOrders, ROOT_DRAW_SCOPE } from "./drawOrder";
import { type Animation, identityTransform, parseMotion, propertySchema } from "./model";
import { parsePlaybackDocument } from "./playback";
import { createPlaybackContext, evaluatePlaybackFrame } from "./playbackFrame";

const targets = new Set(["node-group", "node-a", "node-b", "node-c"]);
function clip(drawOrders: unknown, frames = 10): unknown {
  return {
    id: "animation-main",
    name: "Main",
    fps: 10,
    frames,
    mode: "loop",
    tracks: [],
    drawOrders,
  };
}
const stacked = {
  id: "order-group",
  scopeId: "node-group",
  keys: [
    { id: "key-front-a", frame: 2, order: ["node-b", "node-c", "node-a"] },
    { id: "key-front-c", frame: 6, order: ["node-a", "node-b", "node-c"] },
  ],
};

describe("animated draw order", () => {
  test("validation keeps keys sorted, unique, inside the clip and on existing objects", () => {
    expect(
      parseMotion({ version: 2, animations: [clip([stacked])] }, targets).animations[0],
    ).toMatchObject({ drawOrders: [stacked] });
    const refuse = (drawOrders: unknown, message: RegExp) =>
      expect(() => parseMotion({ version: 2, animations: [clip(drawOrders)] }, targets)).toThrow(
        message,
      );
    refuse([{ ...stacked, keys: [...stacked.keys].reverse() }], /ordenadas/);
    refuse([{ ...stacked, keys: [{ ...stacked.keys[0], frame: 11 }] }], /duração/);
    refuse([{ ...stacked, keys: [{ ...stacked.keys[0], order: ["node-a", "node-a"] }] }], /repete/);
    refuse([{ ...stacked, keys: [{ ...stacked.keys[0], order: ["node-x"] }] }], /inexistente/);
    refuse([{ ...stacked, keys: [{ ...stacked.keys[0], order: ["node-group"] }] }], /inexistente/);
    refuse([{ ...stacked, scopeId: "node-x" }], /grupo inexistente/);
    refuse(
      [stacked, { ...stacked, id: "order-again", keys: [{ ...stacked.keys[0], id: "key-other" }] }],
      /mesmo grupo/,
    );
    refuse([{ ...stacked, keys: [{ ...stacked.keys[0], id: "order-group" }] }], /duplicado/);
    // Root orders of several artboards may share a project clip; a runtime document allows one.
    const roots = [
      { id: "order-root-a", scopeId: null, keys: [{ id: "key-ra", frame: 0, order: ["node-a"] }] },
      { id: "order-root-b", scopeId: null, keys: [{ id: "key-rb", frame: 0, order: ["node-b"] }] },
    ];
    expect(() => parseMotion({ version: 2, animations: [clip(roots)] }, targets)).not.toThrow();
    expect(() =>
      parsePlaybackDocument({
        version: 2,
        motion: { version: 2, animations: [clip(roots)] },
        objects: [...targets].map((id) => ({ id, transform: identityTransform() })),
        drivers: [],
      }),
    ).toThrow(/raiz/);
  });
  test("raw keys count against the aggregate budget before schema parsing", () => {
    const keys = Array.from({ length: 1000 }, (_, frame) => ({
      id: `key-${frame}`,
      frame,
      order: Array.from({ length: 200 }, () => "node-a"),
    }));
    expect(() =>
      parseMotion(
        { version: 2, animations: [clip([{ id: "order-x", scopeId: null, keys }], 1000)] },
        targets,
      ),
    ).toThrow(/Orçamento de chaves/);
  });
  test("keys step: the first key holds before it and each key until the next", () => {
    const motion = parseMotion({ version: 2, animations: [clip([stacked])] }, targets),
      animation = motion.animations[0];
    if (!animation) throw new Error("Missing clip");
    const at = (frame: number) => evaluateDrawOrders(animation, frame).get("node-group");
    expect(at(0)).toEqual(["node-b", "node-c", "node-a"]);
    expect(at(5.99)).toEqual(["node-b", "node-c", "node-a"]);
    expect(at(6)).toEqual(["node-a", "node-b", "node-c"]);
    expect(at(10)).toEqual(["node-a", "node-b", "node-c"]);
    expect(evaluateDrawOrders(undefined, 3).size).toBe(0);
  });
  test("playback frames carry the clip's orders and each component clock's at its own phase", () => {
    const component = {
        id: "animation-component",
        name: "Component",
        fps: 10,
        frames: 10,
        mode: "loop",
        tracks: [],
        drawOrders: [
          {
            id: "order-inner",
            scopeId: "node-viewport",
            keys: [
              { id: "key-inner-0", frame: 0, order: ["node-c", "node-b"] },
              { id: "key-inner-5", frame: 5, order: ["node-b", "node-c"] },
            ],
          },
        ],
      },
      document = parsePlaybackDocument({
        version: 2,
        motion: { version: 2, animations: [clip([{ ...stacked, scopeId: null }])] },
        objects: ["node-group", "node-a", "node-b", "node-c", "node-viewport"].map((id) => ({
          id,
          transform: identityTransform(),
        })),
        drivers: [{ id: "node-group", animation: component, speed: 1, offsetSeconds: 0.3 }],
      }),
      context = createPlaybackContext(document),
      main = document.motion.animations[0];
    if (!main) throw new Error("Missing clip");
    const frame = evaluatePlaybackFrame(context, main, 2);
    expect(frame.orders.get(ROOT_DRAW_SCOPE)).toEqual(["node-b", "node-c", "node-a"]);
    // 0.2s of the root plus a 0.3s offset: the component is at its frame 5.
    expect(frame.orders.get("node-viewport")).toEqual(["node-b", "node-c"]);
    expect(evaluatePlaybackFrame(context, main, 1).orders.get("node-viewport")).toEqual([
      "node-c",
      "node-b",
    ]);
    expect(() =>
      parsePlaybackDocument({
        version: 2,
        motion: { version: 2, animations: [clip([])] },
        objects: ["node-group", "node-a", "node-b", "node-c"].map((id) => ({
          id,
          transform: identityTransform(),
        })),
        drivers: [
          {
            id: "node-group",
            animation: {
              ...component,
              drawOrders: [{ ...component.drawOrders[0], scopeId: null }],
            },
            speed: 1,
            offsetSeconds: 0,
          },
        ],
      }),
    ).toThrow(/grupo próprio/);
  });
  test("commands upsert a key per frame, delete it and give duplicated clips new identities", () => {
    let motion = parseMotion({ version: 2, animations: [clip(undefined)] }, targets);
    const set = (frame: number, order: string[]) => {
      motion = applyMotionCommands(motion, targets, [
        {
          type: "set-draw-order",
          animationId: "animation-main",
          scopeId: "node-group",
          frame,
          order,
        },
      ]);
    };
    set(4, ["node-a", "node-b"]);
    set(1, ["node-b", "node-a"]);
    set(4, ["node-b", "node-a"]);
    const drawOrder = motion.animations[0]?.drawOrders?.[0];
    if (!drawOrder) throw new Error("Missing draw order");
    expect(drawOrder.keys.map((key) => [key.frame, key.order])).toEqual([
      [1, ["node-b", "node-a"]],
      [4, ["node-b", "node-a"]],
    ]);
    motion = applyMotionCommands(motion, targets, [
      {
        type: "duplicate-animation",
        animationId: "animation-main",
        id: "animation-copy",
        name: "C",
      },
    ]);
    const copy = motion.animations[1]?.drawOrders?.[0];
    expect(copy?.id).not.toBe(drawOrder.id);
    expect(copy?.keys.map((key) => key.order)).toEqual(drawOrder.keys.map((key) => key.order));
    for (const frame of [1, 4])
      motion = applyMotionCommands(motion, targets, [
        {
          type: "delete-draw-order-key",
          animationId: "animation-main",
          drawOrderId: drawOrder.id,
          frame,
        },
      ]);
    expect(motion.animations[0]?.drawOrders).toBeUndefined();
    expect(() =>
      applyMotionCommands(motion, targets, [
        {
          type: "delete-draw-order-key",
          animationId: "animation-main",
          drawOrderId: drawOrder.id,
          frame: 1,
        },
      ]),
    ).toThrow(/não encontrada/);
  });
  test("state blends switch stacking at half weight; masked layers own only their groups", () => {
    const animations = (
      [
        ["node-a", "node-b"],
        ["node-b", "node-a"],
      ] as const
    ).map(
      (order, index): Animation => ({
        id: `animation-${index}`,
        name: `Clip ${index}`,
        fps: 10,
        frames: 10,
        mode: "once",
        tracks: [],
        drawOrders: [
          {
            id: `order-${index}`,
            scopeId: null,
            keys: [{ id: `key-${index}`, frame: 0, order: [...order] }],
          },
          {
            id: `order-group-${index}`,
            scopeId: "node-group",
            keys: [{ id: `key-group-${index}`, frame: 0, order: [...order].reverse() }],
          },
        ],
      }),
    );
    const layer = (id: string, targetIds: string[]) => ({
      id,
      name: id,
      entryStateId: "state-a",
      weight: 1,
      mode: "override" as const,
      targetIds,
      properties: [...propertySchema.options],
      states: [0, 1].map((index) => ({
        id: index ? "state-b" : "state-a",
        name: `State ${index}`,
        x: 0,
        y: 0,
        speed: 1,
        kind: "animation" as const,
        animationId: `animation-${index}`,
      })),
      transitions: [
        {
          id: `transition-${id}`,
          from: "state-a",
          to: "state-b",
          conditions: [{ inputId: "input-go", operator: "trigger" as const }],
          priority: 0,
          exitAt: null,
          duration: 0.2,
          easing: "linear" as const,
          interrupt: "never" as const,
        },
      ],
    });
    const behavior = (layers: ReturnType<typeof layer>[]): Behavior => ({
        ...emptyBehavior(),
        inputs: [{ id: "input-go", name: "Ir", kind: "trigger" }],
        defaultMachineId: "machine-main",
        machines: [{ id: "machine-main", name: "Main", layers }],
      }),
      objects = new Map(
        ["node-group", "node-a", "node-b"].map((id) => [
          id,
          { tag: id === "node-group" ? "g" : "rect", transform: identityTransform() },
        ]),
      );
    const full = createBehaviorContext(behavior([layer("layer-all", [])]), animations, objects),
      fired = fireBehaviorTrigger(full, createBehaviorSession(full), "input-go");
    expect(evaluateBehavior(full, fired).orders.get(ROOT_DRAW_SCOPE)).toEqual(["node-a", "node-b"]);
    expect(advanceBehavior(full, fired, 0.09).frame.orders.get(ROOT_DRAW_SCOPE)).toEqual([
      "node-a",
      "node-b",
    ]);
    expect(advanceBehavior(full, fired, 0.1).frame.orders.get(ROOT_DRAW_SCOPE)).toEqual([
      "node-b",
      "node-a",
    ]);
    const masked = createBehaviorContext(
        behavior([layer("layer-group", ["node-group"])]),
        animations,
        objects,
      ),
      frame = evaluateBehavior(masked, createBehaviorSession(masked));
    expect(frame.orders.has(ROOT_DRAW_SCOPE)).toBe(false);
    expect(frame.orders.get("node-group")).toEqual(["node-b", "node-a"]);
  });
});
