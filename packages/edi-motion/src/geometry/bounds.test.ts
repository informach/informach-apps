import { expect, test } from "vitest";
import type { Geometry } from "../geometry";
import { parseSvgPath } from "../svgPath";
import { GEOMETRY_BOUNDS_VERTEX_COST, geometryBounds } from "./bounds";

const bounds = (geometry: Geometry) => geometryBounds(geometry, { remaining: 2_000_000 });

test("cubic bounds use actual extrema, not the control hull, and preserve input ownership", () => {
  const geometry = parseSvgPath("M0 0C0 100 100 100 100 0"),
    before = structuredClone(geometry),
    result = bounds(geometry);
  expect(result).toEqual({ x: 0, y: 0, width: 100, height: 75 });
  const returning = bounds(parseSvgPath("M0 0C100 0 -100 0 0 0"));
  if (!returning) throw new Error("Missing returning bounds");
  expect(returning.x).toBeCloseTo(-100 / (2 * Math.sqrt(3)), 12);
  expect(returning.width).toBeCloseTo(100 / Math.sqrt(3), 12);
  expect(returning.y).toBe(0);
  expect(returning.height).toBe(0);
  if (!result) throw new Error("Missing bounds");
  result.x = 500;
  expect(geometry).toEqual(before);
});

test("bounds include closed edges, disconnected move-only subpaths and degenerate axes", () => {
  expect(bounds(parseSvgPath("M0 0L10 0L10 10Z M-20 -30"))).toEqual({
    x: -20,
    y: -30,
    width: 30,
    height: 40,
  });
  const closed = parseSvgPath("M0 0C0 0 10 0 10 0Z"),
    first = closed[0]?.points[0],
    last = closed[0]?.points.at(-1);
  if (!first || !last) throw new Error("Missing closed contour");
  first.in = { x: 0, y: 40 };
  last.out = { x: 10, y: 40 };
  expect(bounds(closed)).toEqual({ x: 0, y: 0, width: 10, height: 30 });
  expect(bounds(parseSvgPath("M7 9"))).toEqual({ x: 7, y: 9, width: 0, height: 0 });
  expect(bounds(parseSvgPath("M3 2L3 50"))).toEqual({ x: 3, y: 2, width: 0, height: 48 });
  expect(bounds([])).toBeNull();
});

test("derivative roots remain bounded for linear, repeated and nearly linear cases and large translated coordinates", () => {
  for (const source of [
    "M0 0C1 1 2 2 3 3",
    "M0 0C1 1 0 0 1 1",
    "M0 0C1 1 2.000000000001 -1 3 0",
    "M9999990 9999990C9999990 10000000 10000000 10000000 10000000 9999990",
  ]) {
    const result = bounds(parseSvgPath(source));
    expect(result).not.toBeNull();
    if (!result) throw new Error("Missing bounds");
    expect(Object.values(result).every(Number.isFinite)).toBe(true);
    expect(result.width).toBeGreaterThanOrEqual(0);
    expect(result.height).toBeGreaterThanOrEqual(0);
  }
  expect(
    bounds(parseSvgPath("M9999990 9999990C9999990 10000000 10000000 10000000 10000000 9999990")),
  ).toEqual({
    x: 9999990,
    y: 9999990,
    width: 10,
    height: 7.5,
  });
});

test("bounds debit the caller's budget and reject excess geometry and invalid numeric inputs", () => {
  const geometry = parseSvgPath("M0 0L10 10"),
    budget = { remaining: 2 * GEOMETRY_BOUNDS_VERTEX_COST };
  geometryBounds(geometry, budget);
  expect(budget.remaining).toBe(0);
  expect(() => geometryBounds(geometry, budget)).toThrow(/orçamento/);
  for (const remaining of [-1, 2_000_001, NaN, 1.5])
    expect(() => geometryBounds(geometry, { remaining })).toThrow(/Orçamento/);
  const point = geometry[0]?.points[0];
  if (!point) throw new Error("Missing point");
  point.x = Infinity;
  expect(() => bounds(geometry)).toThrow(/Coordenadas/);
  expect(() => bounds([{ closed: false, points: [] }])).toThrow(/não vazios/);
  expect(() => bounds(Array.from({ length: 4001 }, () => ({ closed: false, points: [] })))).toThrow(
    /4000/,
  );
});

test("analytic bounds enclose independent Bernstein evaluations and stay tight across a deterministic cubic corpus", () => {
  let excess = 0,
    gap = 0;
  for (let index = 0; index < 96; index++) {
    const c = Array.from(
        { length: 8 },
        (_, offset) => Math.sin((index + 1) * (offset + 3) * 1.37) * 500,
      ),
      result = bounds(parseSvgPath(`M${c.slice(0, 2).join(" ")}C${c.slice(2).join(" ")}`));
    if (!result) throw new Error("Missing bounds");
    for (const axis of [0, 1]) {
      let minimum = Infinity,
        maximum = -Infinity;
      for (let step = 0; step <= 1024; step++) {
        const t = step / 1024,
          u = 1 - t;
        const [a, b, d, e] = [c[axis], c[axis + 2], c[axis + 4], c[axis + 6]];
        if (a === undefined || b === undefined || d === undefined || e === undefined)
          throw new Error("Missing coordinate");
        const value = u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * e;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
      const low = axis === 0 ? result.x : result.y,
        high = low + (axis === 0 ? result.width : result.height);
      excess = Math.max(excess, low - minimum, maximum - high);
      gap = Math.max(gap, minimum - low, high - maximum);
    }
  }
  expect(excess).toBeLessThan(1e-10);
  expect(gap).toBeLessThan(0.01);
});

test("maximum vertex geometry has deterministic cost and excess is refused before any work debit", () => {
  const geometry: Geometry = [
      {
        closed: false,
        points: Array.from({ length: 4000 }, (_, x) => ({ x, y: 0, in: null, out: null })),
      },
    ],
    budget = { remaining: 4000 * GEOMETRY_BOUNDS_VERTEX_COST };
  expect(geometryBounds(geometry, budget)).toEqual({ x: 0, y: 0, width: 3999, height: 0 });
  expect(budget.remaining).toBe(0);
  const contour = geometry[0];
  if (!contour) throw new Error("Missing contour");
  contour.points.push({ x: 4000, y: 0, in: null, out: null });
  const untouched = { remaining: 2_000_000 };
  expect(() => geometryBounds(geometry, untouched)).toThrow(/4000 vértices/);
  expect(untouched.remaining).toBe(2_000_000);
});
