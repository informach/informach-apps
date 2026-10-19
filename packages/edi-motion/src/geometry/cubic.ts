import type { Contour, Point } from "../geometry";

export type Cubic = readonly [Point, Point, Point, Point];
const copy = (point: Point): Point => ({ x: point.x, y: point.y });
const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
function fraction(t: number) {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error("Parâmetro de curva fora de 0–1.");
}

/** Geometry has already crossed parseGeometry. Returned controls are owned,
 * even at endpoints; callers cannot mutate an authored curve through a slice. */
export function contourCubic(contour: Contour, index: number): Cubic {
  const a = contour.points[index],
    b = contour.points[(index + 1) % contour.points.length];
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    !a ||
    !b ||
    (!contour.closed && index >= contour.points.length - 1)
  )
    throw new Error("Segmento de curva ausente.");
  return [copy(a), copy(a.out ?? a), copy(b.in ?? b), copy(b)];
}

export function splitCubic(curve: Cubic, t: number): { left: Cubic; right: Cubic } {
  fraction(t);
  const cloned = (): Cubic => [copy(curve[0]), copy(curve[1]), copy(curve[2]), copy(curve[3])];
  if (t === 0)
    return {
      left: [copy(curve[0]), copy(curve[0]), copy(curve[0]), copy(curve[0])],
      right: cloned(),
    };
  if (t === 1)
    return {
      left: cloned(),
      right: [copy(curve[3]), copy(curve[3]), copy(curve[3]), copy(curve[3])],
    };
  const [a, b, c, d] = curve,
    ab = mix(a, b, t),
    bc = mix(b, c, t),
    cd = mix(c, d, t),
    abc = mix(ab, bc, t),
    bcd = mix(bc, cd, t),
    point = mix(abc, bcd, t);
  return { left: [copy(a), ab, abc, copy(point)], right: [point, bcd, cd, copy(d)] };
}

export function sliceCubic(curve: Cubic, start: number, end: number): Cubic {
  fraction(start);
  fraction(end);
  if (start > end) throw new Error("Intervalo de curva invertido.");
  if (start === end) {
    const point = splitCubic(curve, start).left[3];
    return [copy(point), copy(point), copy(point), copy(point)];
  }
  const left = splitCubic(curve, end).left;
  return start === 0 ? left : splitCubic(left, start / end).right;
}
