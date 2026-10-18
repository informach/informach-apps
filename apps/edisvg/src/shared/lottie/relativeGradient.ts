import { identityMatrix, multiply } from "@informach/edi-motion";
import { type Contour, geometryBounds } from "@informach/edi-motion/geometry";
import type { Gradient } from "@informach/edi-motion/graphics";
import type { RigEvaluationBudget } from "@informach/edi-motion/rig";
import {
  type LottieGradientSample,
  type LottieGradientStyle,
  lottieGradientCoordinates,
  prepareGradientDefinition,
} from "./gradient";

export interface RelativeLottieGradient {
  ty: "relative-gradient";
  style: LottieGradientStyle;
  sample(geometry: readonly Contour[], budget: RigEvaluationBudget): LottieGradientSample;
}

export function hasNativeStraightSegments(geometry: readonly Contour[]) {
  for (const contour of geometry) {
    const count = contour.points.length - (contour.closed ? 0 : 1);
    for (let index = 0; index < count; index++) {
      const point = contour.points[index],
        next = contour.points[(index + 1) % contour.points.length];
      if (!point || !next) throw new Error("Segmento de geometria relativa ausente.");
      if (!point.out && !next.in) return true;
    }
  }
  return false;
}

/** Geometry-relative coordinates are derived artifacts, never persisted in
 * the source. The owned definition/stop palette is validated just once. */
export function prepareRelativeGradient(
  input: Gradient,
  opacity: number,
  rule: 1 | 2,
): RelativeLottieGradient {
  const { gradient, style } = prepareGradientDefinition(input, opacity, rule);
  if (gradient.units !== "objectBoundingBox" || gradient.kind !== "linear")
    throw new Error(
      "Gradiente relativo Lottie requer linear/objectBoundingBox; radial elíptico ainda não está homologado.",
    );
  return {
    ty: "relative-gradient",
    style,
    sample(geometry, budget) {
      if (
        geometry.length > 1 &&
        geometry.some((contour) => !contour.closed && contour.points.length === 1)
      )
        throw new Error(
          "Gradiente relativo com subcaminho isolado apenas de mover tem bounds divergentes no consumidor SVG; revise ou remova esse subcaminho explicitamente, ou use HTML/React. Nenhum subcaminho será removido automaticamente.",
        );
      const bounds = geometryBounds(geometry, budget);
      if (!bounds || bounds.width === 0 || bounds.height === 0)
        return { start: [0, 0], end: [0, 0], opacity: 0 };
      const matrix = multiply(
          [bounds.width, 0, 0, bounds.height, bounds.x, bounds.y],
          gradient.transform ?? identityMatrix(),
        ),
        { start, end } = lottieGradientCoordinates(gradient, matrix);
      return { start, end, opacity };
    },
  };
}
