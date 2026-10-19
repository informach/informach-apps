import { type Contour, type Geometry, geometryCost } from "../geometry";
import type { RigEvaluationBudget } from "../rig/kinematics";
import { type Cubic, contourCubic } from "./cubic";
import { type CurveMeasurement, measureCubic } from "./curveMeasure";

export interface TrimSegment {
  curve: Cubic;
  straight: boolean;
  measured: CurveMeasurement;
  start: number;
  end: number;
}
export interface TrimContour {
  index: number;
  source: Contour;
  start: number;
  end: number;
  segments: TrimSegment[];
}

/** One shared error/storage allowance for the whole path, not a fresh quota
 * for each contour or segment. The source is validated authored/frame geometry. */
export function measureTrimGeometry(
  geometry: Geometry,
  tolerance: number,
  budget: RigEvaluationBudget,
) {
  geometryCost(geometry);
  let count = 0;
  for (const contour of geometry) count += contour.points.length - (contour.closed ? 0 : 1);
  const allowance = tolerance / 8 / Math.max(1, count),
    contours: TrimContour[] = [];
  let length = 0,
    leaves = 0;
  for (const [index, source] of geometry.entries()) {
    const contour: TrimContour = { index, source, start: length, end: length, segments: [] },
      count = source.points.length - (source.closed ? 0 : 1);
    for (let segment = 0; segment < count; segment++) {
      if (--budget.remaining < 0) throw new Error("Trim excede orçamento de medição.");
      if (leaves >= 16384) throw new Error("Trim excede orçamento agregado de folhas.");
      const curve = contourCubic(source, segment),
        measured = measureCubic(curve, allowance, budget, 16384 - leaves),
        a = source.points[segment],
        b = source.points[(segment + 1) % source.points.length];
      if (!a || !b) throw new Error("Segmento de trim ausente.");
      leaves += measured.leaves.length;
      contour.segments.push({
        curve,
        straight: !a.out && !b.in,
        measured,
        start: length,
        end: length + measured.length,
      });
      length += measured.length;
    }
    contour.end = length;
    contours.push(contour);
  }
  return { length, contours };
}
