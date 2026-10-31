export type V3 = [number, number, number];

export const v = (x: number, y: number, z: number): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: V3, b: V3) => len(sub(a, b));
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (a: V3, b: V3, t: number): V3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const rad = (deg: number) => (deg * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;

/** Combina os eixos de um referencial: a*x + b*y + c*z. */
export const comb = (x: V3, a: number, y: V3, b: number, z: V3, c: number): V3 =>
  add(add(scale(x, a), scale(y, b)), scale(z, c));

/** Gira `a` em direção a `b` (ambos unitários e perpendiculares) pelo ângulo dado. */
export const rotateToward = (a: V3, b: V3, angle: number): V3 =>
  norm(add(scale(a, Math.cos(angle)), scale(b, Math.sin(angle))));

/** Ângulo interno em `b` formado por a-b-c, em graus. */
export const angleAt = (a: V3, b: V3, c: V3) => {
  const u = norm(sub(a, b));
  const w = norm(sub(c, b));
  return deg(Math.acos(clamp(dot(u, w), -1, 1)));
};

/**
 * IK de dois ossos: devolve a articulação do meio (cotovelo/joelho) para alcançar `target`
 * a partir de `root`, dobrando no sentido de `pole`. Se o alvo estiver longe demais, estica.
 */
export function twoBoneIK(root: V3, target: V3, l1: number, l2: number, pole: V3): V3 {
  const toT = sub(target, root);
  const d = clamp(len(toT), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const dir = norm(toT);
  // componente do polo perpendicular à linha raiz→alvo
  let bend = sub(pole, scale(dir, dot(pole, dir)));
  if (len(bend) < 1e-6) bend = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  bend = norm(bend);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return add(add(root, scale(dir, a)), scale(bend, h));
}
