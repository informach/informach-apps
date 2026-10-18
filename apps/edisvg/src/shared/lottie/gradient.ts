import { type Affine, identityMatrix, inverse, transformPoint } from "@informach/edi-motion";
import { type Gradient, gradientSchema } from "@informach/edi-motion/graphics";
import type { ShapeGradientFill, StaticShapeGradientFill, Vector2 } from "./model";
import { conformalStrokeScale } from "./stroke";

export const LOTTIE_GRADIENT_SAMPLE_COST = 32;
/** Closed SVG-light 5.13 profile. Its stop positions are quantized to integer
 * percentages, so finer authored offsets are refused, not silently rounded. */
export type LottieGradientStyle = Omit<ShapeGradientFill, "s" | "e" | "o">;
export interface LottieGradientSample {
  start: Vector2;
  end: Vector2;
  opacity: number;
}
export function prepareGradientDefinition(input: Gradient, opacity: number, rule: 1 | 2) {
  const gradient = gradientSchema.parse(input);
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100)
    throw new Error("Opacidade de gradiente Lottie fora do limite.");
  if (gradient.spread !== "pad")
    throw new Error("Gradiente Lottie requer spread pad; repeat/reflect não serão descartados.");
  if (gradient.stops.some((stop) => Math.round(stop.offset * 100) / 100 !== stop.offset))
    throw new Error(
      "O consumidor Lottie arredonda offsets para porcentagens inteiras; este perfil recusa paradas mais precisas sem alterá-las.",
    );
  const colors = gradient.stops.flatMap((stop) => [
      stop.offset,
      Number.parseInt(stop.color.slice(1, 3), 16) / 255,
      Number.parseInt(stop.color.slice(3, 5), 16) / 255,
      Number.parseInt(stop.color.slice(5, 7), 16) / 255,
    ]),
    alpha = gradient.stops.flatMap((stop) => [stop.offset, stop.opacity]);
  const style: LottieGradientStyle = {
    ty: "gf",
    nm: "Preenchimento em gradiente",
    g: { p: gradient.stops.length, k: { a: 0, k: [...colors, ...alpha] } },
    t: gradient.kind === "linear" ? 1 : 2,
    h: { a: 0, k: 0 },
    a: { a: 0, k: 0 },
    r: rule,
    bm: 0,
  };
  return { gradient, style, opacity };
}

/** Coordinates of an already validated definition. Shared by absolute and
 * geometry-relative painting; no second gradient policy or per-frame parse. */
export function lottieGradientCoordinates(gradient: Gradient, matrix: Affine) {
  let start: Vector2,
    end: Vector2,
    highlight = 0,
    angle = 0;
  if (gradient.kind === "linear") {
    const point = transformPoint(matrix, gradient.x1, gradient.y1),
      vx = gradient.x2 - gradient.x1,
      vy = gradient.y2 - gradient.y1,
      length = Math.hypot(vx, vy),
      undo = inverse(matrix),
      nx = undo[0] * (vx / length) + undo[1] * (vy / length),
      ny = undo[2] * (vx / length) + undo[3] * (vy / length),
      normalLength = Math.hypot(nx, ny),
      distance = length / normalLength;
    // Gradient coordinates are a scalar field. Under skew/anisotropy its
    // normal transforms by inverse-transpose, NOT by moving both endpoints.
    if (![normalLength, distance].every((value) => Number.isFinite(value) && value > 0))
      throw new Error("Vetor transformado de gradiente Lottie fora do perfil numérico.");
    start = [point.x, point.y];
    end = [point.x + (nx / normalLength) * distance, point.y + (ny / normalLength) * distance];
  } else {
    let scale: number;
    try {
      scale = conformalStrokeScale(matrix);
    } catch (error) {
      throw new Error(
        "Gradiente radial Lottie requer transformação própria conforme; elipse/skew não serão aproximados.",
        { cause: error },
      );
    }
    const center = transformPoint(matrix, gradient.cx, gradient.cy),
      focal = transformPoint(matrix, gradient.fx, gradient.fy),
      radius = gradient.r * scale,
      dx = focal.x - center.x,
      dy = focal.y - center.y;
    if (!Number.isFinite(radius) || radius <= 0)
      throw new Error("Raio transformado de gradiente Lottie fora do perfil numérico.");
    highlight = (Math.hypot(dx, dy) / radius) * 100;
    // SVG permits an exterior focus; this consumer clamps it. Keep a margin
    // from its boundary rather than pretending that clamp preserves SVG.
    if (!Number.isFinite(highlight) || highlight > 99)
      throw new Error(
        "Foco radial Lottie deste perfil deve ficar até 99% do raio; o consumidor limita focos externos.",
      );
    angle = highlight === 0 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
    start = [center.x, center.y];
    end = [center.x + radius, center.y];
  }
  if (
    ![...start, ...end].every((value) => Number.isFinite(value) && Math.abs(value) <= 1e7) ||
    (Math.fround(start[0]) === Math.fround(end[0]) && Math.fround(start[1]) === Math.fround(end[1]))
  )
    throw new Error(
      "Coordenadas de gradiente Lottie excedem o perfil ou colapsam na precisão do consumidor.",
    );
  return { start, end, highlight, angle };
}

export function prepareLottieGradient(
  input: Gradient,
  opacity: number,
  rule: 1 | 2,
): StaticShapeGradientFill {
  const definition = prepareGradientDefinition(input, opacity, rule),
    { gradient, style } = definition;
  if (gradient.units !== "userSpaceOnUse")
    throw new Error("Gradiente Lottie absoluto requer userSpaceOnUse.");
  const { start, end, highlight, angle } = lottieGradientCoordinates(
    gradient,
    gradient.transform ?? identityMatrix(),
  );
  return {
    ...style,
    s: { a: 0, k: start },
    e: { a: 0, k: end },
    h: { a: 0, k: highlight },
    a: { a: 0, k: angle },
    o: { a: 0, k: opacity },
  };
}
