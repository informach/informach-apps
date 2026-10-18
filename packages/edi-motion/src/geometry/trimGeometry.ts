import { type Contour, type Geometry, geometryCost, type Vertex } from "../geometry";
import type { RigEvaluationBudget } from "../rig/kinematics";
import { type Cubic, sliceCubic } from "./cubic";
import { curveParameterAtLength } from "./curveMeasure";
import { measureTrimGeometry, type TrimContour } from "./trimMeasure";

export interface TrimOptions {
  start: number;
  end: number;
  offset: number;
  tolerance: number;
  mode: "parallel" | "sequential";
}
export type TrimResult = { kind: "identity" } | { kind: "geometry"; geometry: Geometry };
interface Piece {
  source: TrimContour;
  contour: Contour;
}

function spend(budget: RigEvaluationBudget, cost = 1) {
  budget.remaining -= cost;
  if (budget.remaining < 0) throw new Error("Trim excede orçamento de extração.");
}
const vertex = (point: Cubic[0]): Vertex => ({ x: point.x, y: point.y, in: null, out: null });

/** A pure transient geometry operation. Identity explicitly means no d rewrite
 * (important for native arcs); authored geometry/schema are never relaxed to
 * accommodate an empty or variable-topology frame. Offset is in degrees. */
export function trimGeometry(
  geometry: Geometry,
  options: TrimOptions,
  budget: RigEvaluationBudget,
): TrimResult {
  geometryCost(geometry);
  const { start, end, offset, tolerance, mode } = options;
  if (
    ![start, end].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) ||
    !Number.isFinite(offset) ||
    Math.abs(offset) > 36000 ||
    !Number.isFinite(tolerance) ||
    tolerance < 0.000001 ||
    tolerance > 100 ||
    (mode !== "parallel" && mode !== "sequential")
  )
    throw new Error("Configuração de trim fora do perfil.");
  if (!Number.isInteger(budget.remaining) || budget.remaining < 0 || budget.remaining > 2_000_000)
    throw new Error("Orçamento de trim inválido.");
  spend(budget);
  const from = Math.min(start, end),
    range = Math.max(start, end) - from;
  if (range === 1) return { kind: "identity" };
  if (range === 0 || !geometry.length) return { kind: "geometry", geometry: [] };
  const measured = measureTrimGeometry(geometry, tolerance, budget);
  if (!measured.length) return { kind: "geometry", geometry: [] };
  const phase = (((offset % 360) + 360) % 360) / 360,
    first = (from + phase) % 1,
    last = first + range,
    intervals: [number, number][] =
      last <= 1
        ? [[first, last]]
        : [
            [first, 1],
            [0, last - 1],
          ];
  let outputVertices = 0;
  const output: Geometry = [];

  function extract(contours: readonly TrimContour[], from: number, to: number): Piece[] {
    const pieces: Piece[] = [];
    for (const source of contours) {
      spend(budget);
      if (source.end <= source.start || to <= source.start || from >= source.end) continue;
      if (from <= source.start && to >= source.end) {
        spend(budget, source.source.points.length * 3);
        pieces.push({ source, contour: structuredClone(source.source) });
        continue;
      }
      const contour: Contour = { closed: false, points: [] };
      for (const segment of source.segments) {
        spend(budget);
        if (segment.end <= segment.start || to <= segment.start || from >= segment.end) continue;
        const length = segment.measured.length,
          a = Math.max(0, from - segment.start),
          b = Math.min(length, to - segment.start),
          t0 =
            from <= segment.start
              ? 0
              : curveParameterAtLength(segment.measured, a, tolerance / 4, budget),
          t1 =
            to >= segment.end
              ? 1
              : curveParameterAtLength(segment.measured, b, tolerance / 4, budget),
          curve = sliceCubic(segment.curve, t0, t1);
        spend(budget, 6);
        let tail = contour.points.at(-1);
        if (!tail) {
          tail = vertex(curve[0]);
          contour.points.push(tail);
        }
        if (tail.x !== curve[0].x || tail.y !== curve[0].y)
          throw new Error("Extração de trim perdeu continuidade de segmento.");
        tail.out = segment.straight ? null : { ...curve[1] };
        const next = vertex(curve[3]);
        next.in = segment.straight ? null : { ...curve[2] };
        contour.points.push(next);
        if (contour.points.length > 4004)
          throw new Error("Trim excede orçamento temporário de pontos.");
      }
      if (contour.points.length) pieces.push({ source, contour });
    }
    return pieces;
  }
  function publish(pieces: Piece[]) {
    const firstBySource = new Map<number, Piece>(),
      joined: Piece[] = [];
    for (const piece of pieces) {
      spend(budget);
      const earlier = firstBySource.get(piece.source.index);
      if (earlier && piece.source.source.closed) {
        const tail = earlier.contour.points.at(-1),
          head = piece.contour.points[0];
        if (!tail || !head || tail.x !== head.x || tail.y !== head.y)
          throw new Error("Wrap de trim perdeu a junção do contorno fechado.");
        tail.out = head.out;
        earlier.contour.points.push(...piece.contour.points.slice(1));
      } else {
        firstBySource.set(piece.source.index, piece);
        joined.push(piece);
      }
    }
    for (const piece of joined) {
      spend(budget);
      outputVertices += piece.contour.points.length;
      if (outputVertices > 4000) throw new Error("Trim excede 4000 vértices transitórios.");
      output.push(piece.contour);
    }
  }
  if (mode === "parallel") {
    for (const contour of measured.contours) {
      const pieces: Piece[] = [],
        length = contour.end - contour.start;
      for (const [from, to] of intervals)
        pieces.push(
          ...extract([contour], contour.start + from * length, contour.start + to * length),
        );
      publish(pieces);
    }
  } else {
    const pieces: Piece[] = [];
    for (const [from, to] of intervals)
      pieces.push(...extract(measured.contours, from * measured.length, to * measured.length));
    publish(pieces);
  }
  geometryCost(output);
  return { kind: "geometry", geometry: output };
}
