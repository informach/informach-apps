import type { Contour, Point } from "../geometry";
import type { RigEvaluationBudget } from "../rig/kinematics";

export interface GeometryBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Constant work allowance for both derivative quadratics and at most four
 * De Casteljau evaluations per segment. Closed contours have one per vertex. */
export const GEOMETRY_BOUNDS_VERTEX_COST = 64;

function extrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const d0 = p1 - p0,
    d1 = p2 - p1,
    d2 = p3 - p2,
    scale = Math.max(Math.abs(d0), Math.abs(d1), Math.abs(d2));
  if (scale === 0) return [];
  const u = d0 / scale,
    v = d1 / scale,
    w = d2 / scale,
    a = u - 2 * v + w,
    b = 2 * (v - u),
    c = u;
  let roots: number[];
  if (a === 0) roots = b === 0 ? [] : [-c / b];
  else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return [];
    if (discriminant === 0) roots = [-b / (2 * a)];
    else {
      // q avoids cancellation in the small root of a nearly linear curve.
      const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(discriminant));
      roots = [q / a, c / q];
    }
  }
  return roots.filter((t) => Number.isFinite(t) && t > 0 && t < 1);
}

function at(p0: number, p1: number, p2: number, p3: number, t: number) {
  // Translate before evaluating; handles outside the actual curve must not
  // enlarge the object bounds. No flattening or sampling tolerance is used.
  const a = (p1 - p0) * t,
    b = p1 - p0 + (p2 - p1) * t,
    c = p2 - p0 + (p3 - p2) * t,
    ab = a + (b - a) * t,
    bc = b + (c - b) * t;
  return p0 + ab + (bc - ab) * t;
}

/** Bounds of validated local geometry, not its control hull or its stroke.
 * Empty transient geometry has no bounds; move-only/degenerate contours keep
 * their authored positions. Input is never changed or retained by the result. */
export function geometryBounds(
  geometry: readonly Contour[],
  budget: RigEvaluationBudget,
): GeometryBounds | null {
  if (!Number.isInteger(budget.remaining) || budget.remaining < 0 || budget.remaining > 2_000_000)
    throw new Error("Orçamento de bounds inválido.");
  if (geometry.length > 4000) throw new Error("Bounds excedem 4000 contornos.");
  let count = 0;
  for (const contour of geometry) {
    count += contour.points.length;
    if (!contour.points.length || count > 4000)
      throw new Error("Bounds requerem contornos não vazios e até 4000 vértices.");
  }
  if (!count) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  function include(point: Point) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  for (const contour of geometry)
    for (const [index, point] of contour.points.entries()) {
      budget.remaining -= GEOMETRY_BOUNDS_VERTEX_COST;
      if (budget.remaining < 0) throw new Error("Bounds excedem orçamento compartilhado.");
      for (const value of [point, point.in, point.out])
        if (
          value &&
          ![value.x, value.y].every(
            (coordinate) => Number.isFinite(coordinate) && Math.abs(coordinate) <= 1e7,
          )
        )
          throw new Error("Coordenadas de bounds fora do perfil numérico.");
      include(point);
      const next = contour.points[(index + 1) % contour.points.length];
      if (!next || (!contour.closed && index === contour.points.length - 1)) continue;
      const before = point.out ?? point,
        after = next.in ?? next;
      for (const t of extrema(point.x, before.x, after.x, next.x))
        include({ x: at(point.x, before.x, after.x, next.x, t), y: point.y });
      for (const t of extrema(point.y, before.y, after.y, next.y))
        include({ x: point.x, y: at(point.y, before.y, after.y, next.y, t) });
    }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
