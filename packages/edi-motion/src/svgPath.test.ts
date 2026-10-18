import { expect, test } from "vitest";
import { parseSvgPath } from "./svgPath";

test("shared SVG grammar preserves editable arc endpoints, smooth segments and compact flags", () => {
  const compact = parseSvgPath("M0 0A10 10 0 0110 20"),
    last = compact[0]?.points.at(-1);
  expect(last?.x).toBe(10);
  expect(last?.y).toBe(20);
  expect(compact[0]?.points.some((point) => point.in !== null)).toBe(true);
  expect(parseSvgPath("M0 0q10 20 20 0t20 0")[0]?.points).toHaveLength(3);
  expect(parseSvgPath("M0 0L10 0ZL20 0")[1]?.points[0]?.x).toBe(0);
});
test("SVG grammar rejects incomplete data, invalid flags, nonfinite coordinates and oversized moveto-only paths", () => {
  for (const d of ["", "L0 0", "M0 0L1", "M0 0A1 1 0 3 0 10 10", "M0 0L1e999 3", "M0 0<script>"])
    expect(() => parseSvgPath(d)).toThrow();
  expect(() => parseSvgPath("M0 0 ".repeat(4001))).toThrow(/4000/);
});
