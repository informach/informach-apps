import { expect, test } from "vitest";
import type { RigEvaluationBudget } from "../rig/kinematics";
import { type Cubic, splitCubic } from "./cubic";
import { curveParameterAtLength, measureCubic } from "./curveMeasure";

const budget = (): RigEvaluationBudget => ({ remaining: 2_000_000 });

test("length brackets cover monotone lines and collinear backtracking, preserving source and error budget", () => {
  for (const [curve, exact] of [
    [
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 0 },
      ],
      100,
    ],
    [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: -100, y: 0 },
        { x: 0, y: 0 },
      ],
      200 / Math.sqrt(3),
    ],
  ] satisfies [Cubic, number][]) {
    const before = structuredClone(curve),
      work = budget(),
      measured = measureCubic(curve, 1e-5, work);
    expect(measured.lower).toBeLessThanOrEqual(exact + 1e-10);
    expect(measured.upper).toBeGreaterThanOrEqual(exact - 1e-10);
    expect(Math.abs(measured.length - exact)).toBeLessThanOrEqual(1e-5);
    expect(measured.error).toBeLessThanOrEqual(1e-5);
    expect(work.remaining).toBeLessThan(2_000_000);
    expect(curve).toEqual(before);
  }
});

test("distance inversion follows real cubic speed rather than interpolating t on a straight chord", () => {
  const curve: Cubic = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
    ],
    work = budget(),
    measured = measureCubic(curve, 1e-8, work),
    parameter = curveParameterAtLength(measured, 25, 1e-7, work),
    point = splitCubic(curve, parameter).left[3];
  expect(Math.abs(point.x - 25)).toBeLessThanOrEqual(1e-7);
  expect(Math.abs(parameter - 0.25)).toBeGreaterThan(0.05);
  expect(curveParameterAtLength(measured, 0, 1e-7, work)).toBe(0);
  expect(curveParameterAtLength(measured, 100, 1e-7, work)).toBe(1);
  expect(() => curveParameterAtLength(measured, 101, 1e-7, work)).toThrow();
  expect(() => curveParameterAtLength(measured, 25, 1e-14, work)).toThrow(/inversão/);
});

// Independent numerical quadrature for the fixture, not production geometry.
function referenceLength(curve: Cubic) {
  const speed = (t: number) => {
    const u = 1 - t,
      x =
        3 * u * u * (curve[1].x - curve[0].x) +
        6 * u * t * (curve[2].x - curve[1].x) +
        3 * t * t * (curve[3].x - curve[2].x),
      y =
        3 * u * u * (curve[1].y - curve[0].y) +
        6 * u * t * (curve[2].y - curve[1].y) +
        3 * t * t * (curve[3].y - curve[2].y);
    return Math.hypot(x, y);
  };
  const count = 10000;
  let sum = speed(0) + speed(1);
  for (let step = 1; step < count; step++) sum += (step % 2 ? 4 : 2) * speed(step / count);
  return sum / (3 * count);
}

test("curved length bounds agree with independent quadrature and are translation invariant at large authored coordinates", () => {
  const curve: Cubic = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
    ],
    exact = referenceLength(curve),
    translated: Cubic = [
      { x: 1e7, y: -1e7 },
      { x: 1e7, y: -1e7 + 100 },
      { x: 1e7 + 100, y: -1e7 + 100 },
      { x: 1e7 + 100, y: -1e7 },
    ],
    work = budget(),
    measured = measureCubic(curve, 1e-5, work),
    other = measureCubic(translated, 1e-5, work);
  expect(measured.lower).toBeLessThanOrEqual(exact + 1e-8);
  expect(measured.upper).toBeGreaterThanOrEqual(exact - 1e-8);
  expect(Math.abs(measured.length - exact)).toBeLessThanOrEqual(1e-5);
  expect(other.length).toBe(measured.length);
  expect(other.lower).toBe(measured.lower);
  expect(other.upper).toBe(measured.upper);
  for (const distance of [25, 50, 100, 150, 175]) {
    const t = curveParameterAtLength(measured, distance, 1e-4, work),
      prefix = measureCubic(splitCubic(curve, t).left, 1e-6, work);
    expect(Math.abs(prefix.length - distance)).toBeLessThanOrEqual(1e-4 + measured.error);
  }
});

test("measurement bounds recursion, storage and shared work and refuses invalid precision or distances", () => {
  const curve: Cubic = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
    ],
    before = structuredClone(curve);
  for (const point of curve) Object.freeze(point);
  Object.freeze(curve);
  expect(() => measureCubic(curve, 1e-5, budget(), 1)).toThrow(/folhas/);
  expect(() => measureCubic(curve, 1e-5, { remaining: 1 })).toThrow(/orçamento/);
  for (const tolerance of [0, -1, NaN, Infinity, 101, 1e-15])
    expect(() => measureCubic(curve, tolerance, budget())).toThrow();
  for (const leaves of [0, 16385, Infinity, 1.5])
    expect(() => measureCubic(curve, 1e-5, budget(), leaves)).toThrow();
  expect(curve).toEqual(before);
  const zero: Cubic = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    measured = measureCubic(zero, 1e-5, budget());
  expect(measured.length).toBe(0);
  expect(() => curveParameterAtLength(measured, 0, 1e-5, budget())).toThrow();
});
