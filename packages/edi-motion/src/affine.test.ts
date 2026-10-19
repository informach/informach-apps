import { expect, test } from "vitest";
import { identityMatrix, inverse, multiply, parseTransformList, transformPoint } from "./affine";

test("SVG transform order, centered rotation and inversion preserve coordinates", () => {
  const matrix = parseTransformList("translate(20 30) rotate(90 5 10) scale(2 -3) skewX(15)");
  const point = transformPoint(matrix, 7, 11);
  const restored = transformPoint(inverse(matrix), point.x, point.y);
  expect(restored.x).toBeCloseTo(7, 10);
  expect(restored.y).toBeCloseTo(11, 10);
  multiply(matrix, inverse(matrix)).forEach((value, index) => {
    expect(value).toBeCloseTo(identityMatrix()[index] ?? 0, 10);
  });
  expect(transformPoint(parseTransformList("translate(10) scale(2)"), 5, 0)).toEqual({
    x: 20,
    y: 0,
  });
  const rotated = transformPoint(parseTransformList("rotate(90 5 10)"), 6, 10);
  expect(rotated.x).toBeCloseTo(5);
  expect(rotated.y).toBeCloseTo(11);
});
test("transform parser refuses malformed lists, arities, excessive and non-finite coefficients", () => {
  for (const text of [
    "wat(1)",
    "matrix(1 0 0 1 0)",
    "scale(1 2 3)",
    "translate(1e999)",
    "rotate(1 2)",
    "translate(1) garbage",
    "skewX(90)",
    "translate(,1)",
    "translate(1,,2)",
  ])
    expect(() => parseTransformList(text)).toThrow();
  expect(() => inverse([1, 2, 2, 4, 0, 0])).toThrow(/singular/);
  expect(() => inverse([1, 0, 0, 1e-18, 0, 0])).toThrow(/instável/);
});
