import { expect, test } from "vitest";
import {
  evaluateJoystick,
  JOYSTICK_SAMPLE_COST,
  joystickSchema,
  resolveJoystickAxes,
} from "./joystick";

const controller = joystickSchema.parse({
  id: "joystick-hand",
  name: "Mão",
  targetId: "node-hand",
  x: 0,
  y: 0,
  rangeX: 120,
  rangeY: 80,
  limit: "circle",
});

test("strict joystick definition rejects unknown fields, unsafe references, invalid ranges/axes and empty names", () => {
  for (const change of [
    { extra: true },
    { id: "node-not-a-controller" },
    { targetId: "../personal" },
    { x: NaN },
    { y: 1.01 },
    { rangeX: 0 },
    { rangeY: 10001 },
    { limit: "triangle" },
    { name: " " },
  ])
    expect(joystickSchema.safeParse({ ...controller, ...change }).success).toBe(false);
  expect(joystickSchema.parse({ ...controller, name: " Mão " }).name).toBe("Mão");
});

test("square and circular control preserve center/cardinals, project coupled corners and apply unequal local extents", () => {
  for (const limit of ["square", "circle"] as const)
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (x === undefined || y === undefined) throw new Error("Missing axis");
      expect(resolveJoystickAxes(x, y, limit)).toEqual({ x, y });
    }
  expect(resolveJoystickAxes(1, 1, "square")).toEqual({ x: 1, y: 1 });
  const result = evaluateJoystick(controller, { x: 1, y: -1 }, { remaining: 100 });
  expect(result.axes.x).toBeCloseTo(Math.SQRT1_2, 14);
  expect(result.axes.y).toBeCloseTo(-Math.SQRT1_2, 14);
  expect(Math.hypot(result.axes.x, result.axes.y)).toBeCloseTo(1, 14);
  expect(result.offset.x).toBeCloseTo(120 * Math.SQRT1_2, 12);
  expect(result.offset.y).toBeCloseTo(-80 * Math.SQRT1_2, 12);
});

test("joystick evaluation debits one shared constant cost, owns its results and refuses invalid composed input", () => {
  const before = structuredClone(controller),
    values = { x: 0.5, y: -0.25 },
    budget = { remaining: JOYSTICK_SAMPLE_COST },
    result = evaluateJoystick(controller, values, budget);
  expect(budget.remaining).toBe(0);
  expect(result.offset).toEqual({ x: 60, y: -20 });
  result.axes.x = 100;
  expect(controller).toEqual(before);
  expect(values).toEqual({ x: 0.5, y: -0.25 });
  expect(() => evaluateJoystick(controller, values, budget)).toThrow(/orçamento/);
  for (const remaining of [-1, 2_000_001, NaN, 0.5])
    expect(() => evaluateJoystick(controller, values, { remaining })).toThrow(/Orçamento/);
  for (const x of [-1.01, 1.01, Infinity, NaN])
    expect(() => resolveJoystickAxes(x, 0, "circle")).toThrow(/Eixos/);
});
