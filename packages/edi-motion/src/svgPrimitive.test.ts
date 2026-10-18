import { expect, test } from "vitest";
import {
  svgPrimitiveAttributes,
  svgPrimitiveFromAttributes,
  svgPrimitivePathData,
  svgPrimitiveSchema,
} from "./svgPrimitive";

test("native SVG primitives keep typed native attributes and a shared path model without approximating their rendering", () => {
  const circle = svgPrimitiveFromAttributes("circle", { cx: "4px", cy: "5", r: "20" });
  expect(circle).toEqual({ kind: "circle", cx: 4, cy: 5, r: 20 });
  expect(svgPrimitiveAttributes(circle)).toEqual({ cx: "4", cy: "5", r: "20" });
  expect(svgPrimitivePathData(circle)).toContain("A20 20");
  expect(svgPrimitiveFromAttributes("rect", { width: "10", height: "20", rx: "100" })).toEqual({
    kind: "rect",
    x: 0,
    y: 0,
    width: 10,
    height: 20,
    rx: 5,
    ry: 10,
  });
  expect(svgPrimitivePathData(svgPrimitiveFromAttributes("circle", { r: "0" }))).toBe("M0 0");
  const polygon = svgPrimitiveFromAttributes("polygon", { points: "0,0 10,0 0,10" });
  expect(svgPrimitiveAttributes(polygon)).toEqual({ points: "0 0 10 0 0 10" });
  expect(svgPrimitivePathData(polygon)).toBe("M0 0 L10 0 L0 10Z");
});
test("native SVG primitive boundaries reject non-finite/excessive/unsupported units, raw fields and unnormalized corners", () => {
  for (const attrs of [
    { r: "NaN" },
    { r: "Infinity" },
    { r: "10%" },
    { r: "1mm" },
    { r: "-1" },
    { r: "1e20" },
    { r: "" },
  ])
    expect(() => svgPrimitiveFromAttributes("circle", attrs)).toThrow();
  expect(() => svgPrimitiveFromAttributes("polygon", { points: "0 0 ".repeat(4001) })).toThrow();
  expect(() => svgPrimitiveFromAttributes("polygon", { points: "0 0 1" })).toThrow();
  expect(() =>
    svgPrimitiveSchema.parse({ kind: "circle", cx: 0, cy: 0, r: 2, onload: "bad" }),
  ).toThrow();
  expect(() =>
    svgPrimitiveSchema.parse({ kind: "rect", x: 0, y: 0, width: 10, height: 10, rx: 9, ry: 0 }),
  ).toThrow();
});
