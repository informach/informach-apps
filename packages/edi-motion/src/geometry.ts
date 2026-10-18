import { z } from "zod";
import { type Affine, transformPoint } from "./affine";
import type { RigEvaluationBudget } from "./rig/kinematics";

export {
  GEOMETRY_BOUNDS_VERTEX_COST,
  type GeometryBounds,
  geometryBounds,
} from "./geometry/bounds";

export {
  type SvgPrimitive,
  svgPrimitiveAttributes,
  svgPrimitiveFromAttributes,
  svgPrimitivePathData,
  svgPrimitiveSchema,
} from "./svgPrimitive";

const coordinate = z.number().min(-1e7).max(1e7);
export const pointSchema = z.strictObject({ x: coordinate, y: coordinate });
export const vertexSchema = pointSchema.extend({
  in: pointSchema.nullable(),
  out: pointSchema.nullable(),
});
export const contourSchema = z.strictObject({
  closed: z.boolean(),
  points: z.array(vertexSchema).min(1).max(4000),
});
export const geometrySchema = z.array(contourSchema).min(1).max(4000);
export type Point = z.infer<typeof pointSchema>;
export type Vertex = z.infer<typeof vertexSchema>;
export type Contour = z.infer<typeof contourSchema>;
export type Geometry = Contour[];
export function geometryCost(input: unknown): number {
  let count = 0;
  if (Array.isArray(input)) {
    if (input.length > 4000) throw new Error("Geometria excede 4000 contornos.");
    for (const contour of input)
      if (typeof contour === "object" && contour !== null && Array.isArray(contour.points)) {
        count += contour.points.length;
        if (count > 4000) throw new Error("Geometria excede 4000 vértices.");
      }
  }
  return count;
}
export function parseGeometry(input: unknown): Geometry {
  geometryCost(input);
  return geometrySchema.parse(input, { jitless: true });
}
export function assertSameTopology(base: readonly Contour[], target: readonly Contour[]) {
  if (base.length !== target.length) throw new Error("Morph requer o mesmo número de contornos.");
  for (const [index, contour] of base.entries()) {
    const other = target[index];
    if (!other || other.closed !== contour.closed || other.points.length !== contour.points.length)
      throw new Error("Morph requer topologia e fechamento idênticos.");
    for (const [i, point] of contour.points.entries()) {
      const next = other.points[i];
      if (
        !next ||
        (point.in === null) !== (next.in === null) ||
        (point.out === null) !== (next.out === null)
      )
        throw new Error(
          "Morph requer alças correspondentes; normalize a topologia antes de capturar.",
        );
    }
  }
}
export function geometryPath(geometry: readonly Contour[]) {
  const xy = (p: Point) => `${p.x} ${p.y}`,
    parts: string[] = [];
  for (const contour of geometry) {
    const first = contour.points[0];
    if (!first) throw new Error("Contorno vazio.");
    parts.push(`M${xy(first)}`);
    for (let i = 1; i < contour.points.length + (contour.closed ? 1 : 0); i++) {
      const a = contour.points[i - 1],
        b = contour.points[i % contour.points.length];
      if (!a || !b) throw new Error("Segmento órfão.");
      parts.push(a.out || b.in ? `C${xy(a.out ?? a)} ${xy(b.in ?? b)} ${xy(b)}` : `L${xy(b)}`);
    }
    if (contour.closed) parts.push("Z");
  }
  return parts.join(" ");
}
export interface ArcSample extends Point {
  distance: number;
}
/** Adaptive de Casteljau in world space, with explicit error and work bounds.
 * Handles collinear backtracking/loops; chord-only flatness would lose them. */
export function arcTable(
  contour: Contour,
  matrix: Affine,
  tolerance: number,
  budget: RigEvaluationBudget,
) {
  if (!Number.isFinite(tolerance) || tolerance < 0.000001 || tolerance > 100)
    throw new Error("Tolerância de caminho inválida.");
  const first = contour.points[0];
  if (!first) throw new Error("Caminho vazio.");
  const result: ArcSample[] = [{ ...transformPoint(matrix, first.x, first.y), distance: 0 }];
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y),
    mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  function add(p: Point) {
    if (--budget.remaining < 0 || result.length >= 16384)
      throw new Error("Caminho excede orçamento de amostragem.");
    const previous = result.at(-1);
    if (!previous) throw new Error("Tabela vazia.");
    const length = distance(previous, p);
    if (length > 0) result.push({ ...p, distance: previous.distance + length });
  }
  function cubic(a: Point, b: Point, c: Point, d: Point, depth: number, allowedError: number) {
    if (--budget.remaining < 0) throw new Error("Caminho excede orçamento de avaliação.");
    if (distance(a, b) + distance(b, c) + distance(c, d) - distance(a, d) <= allowedError) {
      add(d);
      return;
    }
    if (depth >= 20)
      throw new Error("Caminho não atingiu a tolerância dentro do limite de subdivisão.");
    const ab = mid(a, b),
      bc = mid(b, c),
      cd = mid(c, d),
      abc = mid(ab, bc),
      bcd = mid(bc, cd),
      m = mid(abc, bcd);
    cubic(a, ab, abc, m, depth + 1, allowedError / 2);
    cubic(m, bcd, cd, d, depth + 1, allowedError / 2);
  }
  for (let i = 1; i < contour.points.length + (contour.closed ? 1 : 0); i++) {
    const a = contour.points[i - 1],
      d = contour.points[i % contour.points.length];
    if (!a || !d) throw new Error("Segmento ausente.");
    const map = (p: Point) => transformPoint(matrix, p.x, p.y);
    if (a.out || d.in)
      cubic(
        map(a),
        map(a.out ?? a),
        map(d.in ?? d),
        map(d),
        0,
        tolerance / Math.max(1, contour.points.length - (contour.closed ? 0 : 1)),
      );
    else add(map(d));
  }
  if (result.length < 2) throw new Error("Seguir caminho requer comprimento positivo.");
  return result;
}
export function sampleArc(table: readonly ArcSample[], progress: number) {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1)
    throw new Error("Progresso de caminho fora de 0–1.");
  const last = table.at(-1);
  if (!last || table.length < 2) throw new Error("Tabela de caminho vazia.");
  const distance = last.distance * progress;
  let low = 0,
    high = table.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2),
      value = table[middle];
    if (!value) throw new Error("Amostra ausente.");
    if (value.distance <= distance) low = middle;
    else high = middle;
  }
  const a = table[low],
    b = table[high];
  if (!a || !b) throw new Error("Amostra ausente.");
  const fraction = (distance - a.distance) / (b.distance - a.distance),
    dx = b.x - a.x,
    dy = b.y - a.y;
  return {
    x: a.x + dx * fraction,
    y: a.y + dy * fraction,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}
