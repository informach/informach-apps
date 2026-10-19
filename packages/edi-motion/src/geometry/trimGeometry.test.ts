import { expect, test } from "vitest";
import type { Geometry } from "../geometry";
import { parseSvgPath } from "../svgPath";
import { contourCubic, splitCubic } from "./cubic";
import { type TrimOptions, trimGeometry } from "./trimGeometry";

const options: TrimOptions = {
  start: 0.25,
  end: 0.75,
  offset: 0,
  tolerance: 0.0001,
  mode: "parallel",
};
function result(source: Geometry, change: Partial<TrimOptions> = {}) {
  const value = trimGeometry(source, { ...options, ...change }, { remaining: 2_000_000 });
  if (value.kind !== "geometry") throw new Error("Expected modified geometry");
  return value.geometry;
}
function endpoints(geometry: Geometry, index = 0) {
  const contour = geometry[index],
    a = contour?.points[0],
    b = contour?.points.at(-1);
  if (!contour || !a || !b) throw new Error("Missing trim endpoints");
  return { contour, a, b };
}

test("trim follows arclength for native lines and nonlinear straight cubics without flattening authored curves", () => {
  for (const source of ["M0 0L100 0", "M0 0C0 0 100 0 100 0"]) {
    const geometry = parseSvgPath(source),
      before = structuredClone(geometry),
      output = result(geometry),
      { a, b, contour } = endpoints(output);
    expect(Math.abs(a.x - 25)).toBeLessThan(0.0001);
    expect(Math.abs(b.x - 75)).toBeLessThan(0.0001);
    expect(contour.closed).toBe(false);
    expect(contour.points).toHaveLength(2);
    if (source.includes("C")) {
      expect(a.out).not.toBeNull();
      expect(b.in).not.toBeNull();
    } else {
      expect(a.out).toBeNull();
      expect(b.in).toBeNull();
    }
    expect(result(geometry, { start: 0.75, end: 0.25 })).toEqual(output);
    expect(geometry).toEqual(before);
  }
});

test("closed wrap joins its seam once, preserving corners instead of producing extra caps", () => {
  const source = parseSvgPath("M0 0L100 0L100 100L0 100Z"),
    output = result(source, { start: 0.75, end: 1, offset: 45 }),
    { a, b, contour } = endpoints(output);
  expect(output).toHaveLength(1);
  expect(contour.closed).toBe(false);
  expect(contour.points).toHaveLength(3);
  expect(a.x).toBeCloseTo(0, 5);
  expect(a.y).toBeCloseTo(50, 4);
  expect(b.x).toBeCloseTo(50, 4);
  expect(b.y).toBeCloseTo(0, 5);
  expect(contour.points[1]).toEqual({ x: 0, y: 0, in: null, out: null });
  expect(result(source, { start: 0.75, end: 1, offset: -315 })).toEqual(output);
});

test("open wrap stays disconnected and parallel/sequential modes use the declared path lengths", () => {
  const open = result(parseSvgPath("M0 0L100 0"), { start: 0, end: 0.25, offset: 315 });
  expect(open).toHaveLength(2);
  expect(endpoints(open, 0).a.x).toBeCloseTo(87.5, 4);
  expect(endpoints(open, 0).b.x).toBe(100);
  expect(endpoints(open, 1).a.x).toBe(0);
  expect(endpoints(open, 1).b.x).toBeCloseTo(12.5, 4);
  const source = parseSvgPath("M0 0L100 0 M0 10L200 10"),
    parallel = result(source),
    sequential = result(source, { mode: "sequential" });
  expect(endpoints(parallel, 0).a.x).toBeCloseTo(25, 4);
  expect(endpoints(parallel, 1).a.x).toBeCloseTo(50, 4);
  expect(endpoints(parallel, 1).b.x).toBeCloseTo(150, 4);
  expect(endpoints(sequential, 0).a.x).toBeCloseTo(75, 4);
  expect(endpoints(sequential, 0).b.x).toBe(100);
  expect(endpoints(sequential, 1).a.x).toBe(0);
  expect(endpoints(sequential, 1).b.x).toBeCloseTo(125, 4);
});

test("full range is an explicit identity without rewriting native arcs; empty and zero-length partial ranges stay transient", () => {
  const source = parseSvgPath("M0 0A50 50 0 1 1 100 0");
  expect(
    trimGeometry(source, { ...options, start: 0, end: 1, offset: 36000 }, { remaining: 2_000_000 }),
  ).toEqual({ kind: "identity" });
  expect(result(source, { start: 0.5, end: 0.5 })).toEqual([]);
  expect(result(parseSvgPath("M0 0L0 0"))).toEqual([]);
  expect(result([])).toEqual([]);
  expect(result(source, { start: 0.5, end: 0.5 })).not.toBe(source);
});

test("partial curved geometry keeps Bézier controls and symmetry while leaving the entire source unchanged", () => {
  const source = parseSvgPath("M0 0C0 100 100 100 100 0"),
    before = structuredClone(source),
    output = result(source),
    { contour } = endpoints(output),
    point = splitCubic(contourCubic(contour, 0), 0.5).left[3];
  expect(contour.points).toHaveLength(2);
  expect(contour.points[0]?.out).not.toBeNull();
  expect(contour.points[1]?.in).not.toBeNull();
  expect(point.x).toBeCloseTo(50, 4);
  expect(point.y).toBeCloseTo(75, 4);
  expect(source).toEqual(before);
  const anchor = contour.points[0];
  if (!anchor) throw new Error("Missing cut anchor");
  anchor.x = 500;
  expect(source).toEqual(before);
});

test("trim refuses excessive output/work and invalid settings without changing authored geometry or relaxing its schema", () => {
  const source = parseSvgPath("M0 0C0 100 100 100 100 0"),
    before = structuredClone(source);
  for (const change of [
    { start: -1 },
    { end: 2 },
    { offset: NaN },
    { offset: 36001 },
    { tolerance: 0 },
    { tolerance: 101 },
  ])
    expect(() => result(source, change)).toThrow();
  expect(() => trimGeometry(source, options, { remaining: 1 })).toThrow(/orçamento/i);
  expect(source).toEqual(before);
  const large: Geometry = [
      {
        closed: true,
        points: Array.from({ length: 4000 }, (_, index) => ({
          x: 10 * Math.cos((index * 2 * Math.PI) / 4000),
          y: 10 * Math.sin((index * 2 * Math.PI) / 4000),
          in: null,
          out: null,
        })),
      },
    ],
    original = structuredClone(large);
  expect(() => result(large, { start: 0.00001, end: 0.99999 })).toThrow(/4000 vértices/);
  expect(large).toEqual(original);
});
