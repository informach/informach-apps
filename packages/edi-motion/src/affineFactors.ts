import type { Affine } from "./affine";

/** A = T(position) · R(rotation) · S(scale) · R(innerRotation).
 * Two rotations represent rank-one, reflected and skewed spaces without an
 * inverse or an infinite shear. Scaled 2×2 SVD avoids squared-value overflow. */
export function factorAffine(matrix: Affine) {
  if (!matrix.every(Number.isFinite)) throw new Error("Matriz afim não finita.");
  const [a, b, c, d, x, y] = matrix,
    magnitude = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  if (!magnitude)
    return { position: { x, y }, rotation: 0, innerRotation: 0, scale: { x: 0, y: 0 } };
  const aa = a / magnitude,
    bb = b / magnitude,
    cc = c / magnitude,
    dd = d / magnitude,
    first = aa * aa + bb * bb,
    second = cc * cc + dd * dd,
    dot = aa * cc + bb * dd,
    beta = first === second && dot === 0 ? 0 : Math.atan2(2 * dot, first - second) / 2,
    cosine = Math.cos(beta),
    sine = Math.sin(beta),
    u = aa * cosine + cc * sine,
    v = bb * cosine + dd * sine,
    largest = Math.hypot(u, v),
    sx = magnitude * largest,
    sy = magnitude * ((aa * dd - bb * cc) / largest),
    rotation = (Math.atan2(v, u) * 180) / Math.PI,
    innerRotation = beta === 0 ? 0 : (-beta * 180) / Math.PI;
  if (![sx, sy, rotation, innerRotation].every(Number.isFinite))
    throw new Error("Fatores afins excedem precisão numérica.");
  return {
    position: { x, y },
    rotation: rotation === 0 ? 0 : rotation,
    innerRotation,
    scale: { x: sx, y: sy === 0 ? 0 : sy },
  };
}
