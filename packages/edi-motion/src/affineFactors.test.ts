import { expect, test } from "vitest";
import { type Affine, multiply, transformMatrix } from "./affine";
import { factorAffine } from "./affineFactors";

test("affine factors recompose rotation, skew, reflection, rank-one and collapsed spaces without an inverse", () => {
  const matrices: Affine[] = [
    [0, 0, 0, 0, 8, -3],
    [0, 0, 3, 4, 8, -3],
    [1, 2, 2, 4, 8, -3],
    [1, 0, 0, 1, 8, -3],
    [-1, 0, 0, 1, 8, -3],
    [1e150, 2e150, -3e150, 4e150, 0, 0],
    [1e-150, 2e-150, -3e-150, 4e-150, 0, 0],
  ];
  for (let rotation = -180; rotation <= 180; rotation += 15)
    for (const sx of [-2, 0, 2])
      for (const sy of [-3, 0, 3])
        matrices.push(transformMatrix({ x: 8, y: -3, rotation, sx, sy, skewX: 23, px: 5, py: 7 }));
  for (const matrix of matrices) {
    const before = [...matrix],
      factors = factorAffine(matrix),
      outer = transformMatrix({
        x: factors.position.x,
        y: factors.position.y,
        rotation: factors.rotation,
        sx: factors.scale.x,
        sy: factors.scale.y,
      }),
      inner = transformMatrix({ x: 0, y: 0, rotation: factors.innerRotation, sx: 1, sy: 1 }),
      result = multiply(outer, inner),
      scale = Math.max(...matrix.slice(0, 4).map(Math.abs), Number.MIN_VALUE);
    for (const [index, value] of matrix.entries()) {
      const actual = result[index];
      expect(actual).toBeDefined();
      if (actual === undefined) throw new Error("Missing factor coefficient");
      expect(Math.abs(actual - value)).toBeLessThanOrEqual(index < 4 ? scale * 1e-12 : 1e-12);
    }
    expect(matrix).toEqual(before);
  }
  expect(() => factorAffine([Infinity, 0, 0, 1, 0, 0])).toThrow();
  expect(() => factorAffine([1e308, 1e308, 1e308, 1e308, 0, 0])).toThrow();
});
