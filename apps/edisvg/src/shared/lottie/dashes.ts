import type { Geometry } from "@informach/edi-motion/geometry";
import { validateSvgNumbers } from "@informach/edi-motion/graphics";
import type { StrokeDash } from "./model";

export function lottieDashProperties(pattern: readonly number[]): StrokeDash[] {
  const properties: StrokeDash[] = pattern.map((value, index) => ({
    n: index % 2 ? "g" : "d",
    v: { a: 0, k: value },
  }));
  properties.push({ n: "o", v: { a: 0, k: 0 } });
  return properties;
}

/** Absolute numeric profile already admitted by the document, not CSS lengths
 * or expressions. SVG repeats odd patterns and paints all-zero patterns solid. */
export function prepareLottieDashes(raw: string | undefined): number[] | undefined {
  if (raw === undefined || raw === "none") return undefined;
  if (raw.length > 4096) throw new Error("Tracejados Lottie excedem o limite textual.");
  if (!/^[\t\n\r\x20-\x7e]*$/.test(raw))
    throw new Error("Tracejados Lottie exigem números e separadores ASCII do perfil SVG.");
  validateSvgNumbers("stroke-dasharray", raw);
  const values = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (values.length > 32) throw new Error("Tracejados Lottie limitados a 32 valores de origem.");
  if (values.every((value) => value === 0)) return undefined;
  return values.length % 2 ? [...values, ...values] : values;
}

/** The control polygon bounds curve length from above. Charge potential dash
 * pieces, including zero-length dots, before a consumer sees the output.
 * Shared sample budget also covers later morph/skin geometry, not just rest. */
export function lottieDashWork(geometry: Geometry, pattern: readonly number[] | undefined) {
  if (!pattern) return 0;
  const period = pattern.reduce((sum, value) => sum + value, 0);
  if (!(period > 0) || !Number.isFinite(period)) throw new Error("Período de tracejado inválido.");
  let cost = 0;
  for (const contour of geometry) {
    let length = 0;
    const count = contour.points.length - (contour.closed ? 0 : 1);
    for (let index = 0; index < count; index++) {
      const a = contour.points[index],
        b = contour.points[(index + 1) % contour.points.length];
      if (!a || !b) throw new Error("Segmento de tracejado ausente.");
      const out = a.out ?? a,
        incoming = b.in ?? b;
      length +=
        Math.hypot(out.x - a.x, out.y - a.y) +
        Math.hypot(incoming.x - out.x, incoming.y - out.y) +
        Math.hypot(b.x - incoming.x, b.y - incoming.y);
    }
    cost += Math.ceil(length / period + 1) * pattern.length * 2;
    if (!Number.isSafeInteger(cost) || cost > 2_000_000)
      throw new Error(
        "Densidade de tracejados Lottie excede orçamento; aumente os traços/espaços ou reduza a curva.",
      );
  }
  return cost;
}
