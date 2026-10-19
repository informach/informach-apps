import { expect, test } from "vitest";
import { nineSlice } from "./nineSlice";
import { advanceScroll } from "./scroll";

test("scroll inertia is time-partition independent and overscroll returns within bounded coordinates", () => {
  const source = { x: { position: 0, velocity: 100 }, y: { position: 0, velocity: 0 } },
    bounds = { minX: 0, maxX: 100, minY: 0, maxY: 0 },
    settings = { axis: "x" as const, friction: 5, spring: 100, damping: 20, bounce: false },
    before = structuredClone(source);
  const whole = advanceScroll(source, bounds, 0.2, settings),
    first = advanceScroll(source, bounds, 0.1, settings),
    split = advanceScroll(first, bounds, 0.1, settings);
  expect(split.x.position).toBeCloseTo(whole.x.position, 10);
  expect(split.x.velocity).toBeCloseTo(whole.x.velocity, 10);
  expect(source).toEqual(before);
  expect(advanceScroll(source, { ...bounds, maxX: 1 }, 0.2, settings).x).toEqual({
    position: 1,
    velocity: 0,
  });
  const bounced = advanceScroll({ ...source, x: { position: 120, velocity: 0 } }, bounds, 1, {
    ...settings,
    bounce: true,
  });
  expect(bounced.x.position).toBeGreaterThanOrEqual(100);
  expect(bounced.x.position).toBeLessThan(101);
  expect(() => advanceScroll(source, bounds, Number.NaN, settings)).toThrow();
  const crossing = advanceScroll({ ...source, x: { position: 99, velocity: 200 } }, bounds, 0.05, {
    ...settings,
    bounce: true,
  });
  expect(crossing.x.position).toBeGreaterThan(100);
  const settled = advanceScroll(crossing, bounds, 2, { ...settings, bounce: true });
  expect(settled.x.position).toBeCloseTo(100, 1);
});
test("nine-slice preserves corner proportions, handles undersized targets without negative regions and refuses invalid source cuts", () => {
  const output = nineSlice(
    { width: 100, height: 100 },
    { width: 200, height: 150 },
    { left: 10, right: 10, top: 20, bottom: 20 },
  );
  expect(output[0]?.target).toEqual({ x: 0, y: 0, width: 10, height: 20 });
  expect(output[4]?.target).toEqual({ x: 10, y: 20, width: 180, height: 110 });
  const small = nineSlice(
    { width: 100, height: 100 },
    { width: 10, height: 10 },
    { left: 10, right: 10, top: 20, bottom: 20 },
  );
  expect(small[4]?.target.width).toBe(0);
  expect(small[0]?.target.width).toBe(5);
  expect(() =>
    nineSlice(
      { width: 10, height: 10 },
      { width: 100, height: 100 },
      { left: 10, right: 10, top: 0, bottom: 0 },
    ),
  ).toThrow();
});
