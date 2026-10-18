import type { Doc, Gradient, Layer, Point, Transform } from "./doc.ts";
export type Affine = [number, number, number, number, number, number];
export const AFFINE_IDENTITY: Affine = [1, 0, 0, 1, 0, 0];
export function multiply(a: Affine, b: Affine): Affine {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function inverse(m: Affine): Affine {
  const determinant = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10)
    throw new Error("A transformação não pode ser invertida.");
  const a = m[3] / determinant,
    b = -m[1] / determinant,
    c = -m[2] / determinant,
    d = m[0] / determinant;
  return [a, b, c, d, -a * m[4] - c * m[5], -b * m[4] - d * m[5]];
}
export function apply(m: Affine, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}
export function placement(t: Transform): Affine {
  const r = (t.rotation * Math.PI) / 180,
    cos = Math.cos(r),
    sin = Math.sin(r),
    x = t.scale * (t.flipX ? -1 : 1),
    y = t.scale * (t.flipY ? -1 : 1);
  const [a, b, c, d] = t.basis ?? [1, 0, 0, 1];
  return multiply([a, b, c, d, t.x, t.y], [cos * x, sin * x, -sin * y, cos * y, 0, 0]);
}
export function localPlacement(t: Transform, width: number, height: number): Affine {
  return multiply(placement(t), [1, 0, 0, 1, -width / 2, -height / 2]);
}
export function maskPlacement(layer: Layer): Affine {
  if (!layer.mask?.reference || !("transform" in layer)) return AFFINE_IDENTITY;
  return multiply(placement(layer.mask.reference), inverse(placement(layer.transform)));
}
export function resizedPlacement(t: Transform, sx: number, sy: number): Transform {
  const [a, b, c, d] = t.basis ?? [1, 0, 0, 1];
  return { ...t, x: t.x * sx, y: t.y * sy, basis: [a * sx, b * sy, c * sx, d * sy] };
}

export function transformedGradient(g: Gradient, doc: Doc, world: Affine): Gradient {
  const space = g.space ?? { width: doc.width, height: doc.height, toLocal: AFFINE_IDENTITY };
  return { ...g, space: { ...space, toLocal: multiply(space.toLocal, inverse(world)) } };
}
