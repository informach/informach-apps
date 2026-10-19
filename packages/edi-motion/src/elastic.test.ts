import { expect, test } from "vitest";
import { ease } from "./evaluator";
import { easingSchema } from "./model";

test("elastic has exact endpoints, damped oscillation and bounded parameters", () => {
  const curve = easingSchema.parse({ kind: "elastic", amplitude: 1, period: 0.3 });
  expect(ease(0, curve)).toBe(0);
  expect(ease(1, curve)).toBe(1);
  expect(ease(0.15, curve)).toBeGreaterThan(1);
  expect(ease(0.3, curve)).toBeLessThan(1);
  expect(Math.abs(ease(0.9, curve) - 1)).toBeLessThan(0.01);
  expect(() => easingSchema.parse({ kind: "elastic", amplitude: 0, period: 0 })).toThrow();
});
