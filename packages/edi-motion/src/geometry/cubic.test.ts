import { expect, test } from "vitest";
import { parseSvgPath } from "../svgPath";
import { type Cubic, contourCubic, sliceCubic, splitCubic } from "./cubic";

const at = (curve: Cubic, t: number) => splitCubic(curve, t).left[3];
test("De Casteljau slices preserve the original curve parameter range, endpoints and input ownership", () => {
  const curve: Cubic = [
      { x: 0, y: 0 },
      { x: 40, y: 100 },
      { x: -30, y: 150 },
      { x: 100, y: -10 },
    ],
    before = structuredClone(curve);
  for (const [start, end] of [
    [0, 1],
    [0, 0.25],
    [0.25, 0.75],
    [0.5, 1],
    [0.5, 0.5],
    [1, 1],
  ]) {
    if (start === undefined || end === undefined) throw new Error("Missing interval");
    const slice = sliceCubic(curve, start, end);
    for (let step = 0; step <= 20; step++) {
      const actual = at(slice, step / 20),
        expected = at(curve, start + ((end - start) * step) / 20);
      expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThan(1e-10);
    }
    for (const point of slice) expect(curve.includes(point)).toBe(false);
    slice[0].x = 500;
    expect(curve).toEqual(before);
  }
  expect(() => sliceCubic(curve, 0.5, 0.25)).toThrow();
  for (const value of [-1, 1.1, NaN, Infinity]) expect(() => splitCubic(curve, value)).toThrow();
  const extreme: Cubic = [
    { x: 1e7, y: 1e7 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: -1e-7, y: -1e-7 },
  ];
  expect(splitCubic(extreme, 1).left[3]).toEqual(extreme[3]);
  expect(splitCubic(extreme, 0).right[0]).toEqual(extreme[0]);
});

test("contour segments retain real handles and closed edges without silently inventing another contour", () => {
  const contours = parseSvgPath("M0 0C10 20 30 40 50 60L100 60Z"),
    contour = contours[0];
  if (!contour) throw new Error("Missing contour");
  expect(contourCubic(contour, 0)).toEqual([
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 30, y: 40 },
    { x: 50, y: 60 },
  ]);
  expect(contourCubic(contour, 2)).toEqual([
    { x: 100, y: 60 },
    { x: 100, y: 60 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]);
  expect(() => contourCubic(contour, 3)).toThrow();
  expect(() => contourCubic(contour, -1)).toThrow();
  const open = parseSvgPath("M0 0L10 0")[0];
  if (!open) throw new Error("Missing open contour");
  expect(() => contourCubic(open, 1)).toThrow();
});
