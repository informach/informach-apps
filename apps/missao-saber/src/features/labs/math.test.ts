import { expect, it } from "vitest";
import { gridMeasures, successiveDiscounts } from "./math";

it("counts edges for empty, isolated, shared and hole cells", () => {
  expect(gridMeasures([false, false], 2)).toEqual({ area: 0, perimeter: 0 });
  expect(gridMeasures([true, true], 2)).toEqual({ area: 2, perimeter: 6 });
  expect(gridMeasures([true, false, true, false], 2)).toEqual({ area: 2, perimeter: 6 });
  const grid = Array<boolean>(9).fill(true);
  grid[4] = false;
  expect(gridMeasures(grid, 3)).toEqual({ area: 8, perimeter: 16 });
});
it("separates corner removal from edge removal", () => {
  const corner = Array<boolean>(20).fill(true);
  corner[0] = false;
  const edge = Array<boolean>(20).fill(true);
  edge[2] = false;
  expect(gridMeasures(corner, 5)).toEqual({ area: 19, perimeter: 18 });
  expect(gridMeasures(edge, 5)).toEqual({ area: 19, perimeter: 20 });
});
it("does not add discounts on different bases", () => {
  expect(successiveDiscounts(200, 20, 10).final).toBe(144);
  expect(successiveDiscounts(200, 20, 10).combinedPercent).toBeCloseTo(28);
});
