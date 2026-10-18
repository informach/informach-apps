import type { Affine } from "@informach/edi-motion";
import { parseSolidSvgColor, parseSvgOpacity } from "@informach/edi-motion/graphics";
import { prepareLottieDashes } from "./dashes";

export interface LottieStroke {
  color: [number, number, number, number];
  opacity: number;
  width: number;
  cap: 1 | 2 | 3;
  join: 1 | 2 | 3;
  dashes?: number[];
}
export function prepareLottieStroke(
  appearance: Readonly<Record<string, string>>,
): LottieStroke | undefined {
  if (appearance.stroke === "none" || appearance.stroke === undefined) return undefined;
  const raw = appearance["stroke-width"] ?? "1";
  if (raw.length > 80 || !/^\+?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?(?:px)?$/i.test(raw.trim()))
    throw new Error(
      "Contorno Lottie requer largura absoluta numérica/px, não unidades relativas/físicas.",
    );
  const width = Number(raw.trim().replace(/px$/i, ""));
  if (!Number.isFinite(width) || width < 0 || width > 1e7)
    throw new Error("Largura de contorno Lottie fora do limite.");
  const dashes = prepareLottieDashes(appearance["stroke-dasharray"]);
  const cap = appearance["stroke-linecap"] ?? "butt",
    join = appearance["stroke-linejoin"] ?? "miter";
  if (!["butt", "round", "square"].includes(cap) || !["miter", "round", "bevel"].includes(join))
    throw new Error("Terminação/junção de contorno fora do perfil Lottie.");
  const paint = parseSolidSvgColor(appearance.stroke),
    hex = paint.color;
  return {
    color: [
      Number.parseInt(hex.slice(1, 3), 16) / 255,
      Number.parseInt(hex.slice(3, 5), 16) / 255,
      Number.parseInt(hex.slice(5, 7), 16) / 255,
      1,
    ],
    opacity: paint.alpha * parseSvgOpacity(appearance["stroke-opacity"]) * 100,
    width,
    cap: cap === "butt" ? 1 : cap === "round" ? 2 : 3,
    join: join === "miter" ? 1 : join === "round" ? 2 : 3,
    ...(dashes ? { dashes } : {}),
  };
}
/** A scalar width is exact only when A^T A = s²I, including reflections.
 * Tolerance covers floating-point composition, not visible anisotropy. */
export function conformalStrokeScale(matrix: Affine): number {
  const [a, b, c, d] = matrix,
    first = a * a + b * b,
    second = c * c + d * d,
    dot = a * c + b * d,
    scale = Math.max(first, second),
    tolerance = Number.EPSILON * 128 * scale;
  if (
    ![first, second, dot, scale].every(Number.isFinite) ||
    Math.abs(first - second) > tolerance ||
    Math.abs(dot) > tolerance
  )
    throw new Error(
      "Contorno Lottie requer matriz total com escala uniforme: anisotropia/skew não são aproximados.",
    );
  return Math.sqrt(first);
}
