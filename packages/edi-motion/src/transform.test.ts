import { expect, test } from "vitest";
import { parseTransformList, transformAttribute, transformMatrix, transformPoint } from "./affine";
import { emptyMotion, parseMotion } from "./model";

test("pivot, skew, signed and zero scales use one matrix and SVG order", () => {
  for (const sx of [-2, 0, 3])
    for (const sy of [-3, 0, 2]) {
      const transform = { x: 30, y: 40, rotation: 35, sx, sy, px: 10, py: -5, skewX: 23 };
      const matrix = transformMatrix(transform),
        svg = parseTransformList(transformAttribute(transform));
      for (let index = 0; index < 6; index++)
        expect(matrix[index]).toBeCloseTo(svg[index] ?? NaN, 10);
      const pivot = transformPoint(matrix, 10, -5);
      expect(pivot.x).toBeCloseTo(40, 10);
      expect(pivot.y).toBeCloseTo(35, 10);
    }
  expect(parseMotion({ version: 1, animations: [] }, new Set())).toEqual(emptyMotion());
  expect(emptyMotion().version).toBe(2);
  expect(() =>
    parseMotion(
      {
        version: 1,
        animations: [
          {
            id: "animation-legacy",
            name: "Legado",
            fps: 30,
            frames: 30,
            mode: "once",
            tracks: [
              {
                id: "track-new",
                targetId: "node-a",
                property: "px",
                keys: [{ id: "key-new", frame: 0, value: 0, easing: "linear" }],
              },
            ],
          },
        ],
      },
      new Set(["node-a"]),
    ),
  ).toThrow(/v2/);
});
