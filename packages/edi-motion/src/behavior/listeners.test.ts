import { expect, test } from "vitest";
import { identityTransform } from "../model";
import { type BehaviorSession, createBehaviorContext } from "./engine";
import { dispatchBehaviorListeners } from "./listeners";
import { emptyBehavior } from "./model";

test("listener actions share central writes, transform artboard coordinates, clamp and fail atomically", () => {
  const behavior = {
    ...emptyBehavior(),
    inputs: [{ id: "input-x", name: "Olho", kind: "number", initial: 0, min: 0, max: 1 }],
    listeners: [
      {
        id: "listener-move",
        targetId: null,
        event: "move",
        actions: [{ kind: "pointer-coordinate", inputId: "input-x", axis: "x", normalized: true }],
      },
    ],
  };
  const context = createBehaviorContext(
    behavior,
    [],
    new Map([["node-body", { tag: "rect", transform: identityTransform() }]]),
  );
  const initial: BehaviorSession = {
    machineId: "machine-unused",
    inputs: new Map([["input-x", 0]]),
    triggers: new Set(),
    layers: new Map(),
    seconds: 0,
  };
  const point = { x: 150, y: 300, viewBox: [100, 200, 100, 200] as const };
  expect(
    dispatchBehaviorListeners(context, initial, "move", null, point).inputs.get("input-x"),
  ).toBe(0.5);
  expect(
    dispatchBehaviorListeners(context, initial, "move", null, { ...point, x: 1000 }).inputs.get(
      "input-x",
    ),
  ).toBe(1);
  expect(initial.inputs.get("input-x")).toBe(0);
  expect(() => dispatchBehaviorListeners(context, initial, "move", null)).toThrow(/coordenada/);
});
