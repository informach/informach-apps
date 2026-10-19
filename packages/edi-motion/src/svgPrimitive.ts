import { z } from "zod";

const coordinate = z.number().min(-1e7).max(1e7),
  size = z.number().min(0).max(1e7),
  points = z
    .array(z.tuple([coordinate, coordinate]))
    .min(2)
    .max(4000);
export const svgPrimitiveSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("circle"), cx: coordinate, cy: coordinate, r: size }),
  z.strictObject({
    kind: z.literal("ellipse"),
    cx: coordinate,
    cy: coordinate,
    rx: size,
    ry: size,
  }),
  z
    .strictObject({
      kind: z.literal("rect"),
      x: coordinate,
      y: coordinate,
      width: size,
      height: size,
      rx: size,
      ry: size,
    })
    .refine(
      (value) => value.rx <= value.width / 2 && value.ry <= value.height / 2,
      "Raios de canto devem estar normalizados à dimensão da primitiva.",
    ),
  z.strictObject({
    kind: z.literal("line"),
    x1: coordinate,
    y1: coordinate,
    x2: coordinate,
    y2: coordinate,
  }),
  z.strictObject({ kind: z.literal("polyline"), points }),
  z.strictObject({ kind: z.literal("polygon"), points }),
]);
type ImmutablePrimitive<T> = {
  readonly [K in keyof T]: T[K] extends [number, number][]
    ? readonly (readonly [number, number])[]
    : T[K];
};
export type SvgPrimitive = ImmutablePrimitive<z.infer<typeof svgPrimitiveSchema>>;

/** Closed native primitive data, separate from arbitrary presentation attrs.
 * User-space numbers/px only: percentages and physical/font units require a
 * viewport/font conversion profile, never parseFloat guesses. */
export function svgPrimitiveFromAttributes(
  tag: string,
  attrs: Readonly<Record<string, string>>,
): SvgPrimitive {
  function number(name: string, fallback = 0) {
    const raw = attrs[name];
    if (raw === undefined) return fallback;
    if (raw.length > 80 || !/^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?(?:px)?$/i.test(raw.trim()))
      throw new Error("Primitiva SVG requer dimensões numéricas/px em userSpaceOnUse.");
    const value = Number(raw.trim().replace(/px$/i, ""));
    if (!Number.isFinite(value) || Math.abs(value) > 1e7)
      throw new Error("Coordenada de primitiva SVG fora do limite.");
    return value;
  }
  if (tag === "circle")
    return svgPrimitiveSchema.parse({
      kind: tag,
      cx: number("cx"),
      cy: number("cy"),
      r: number("r"),
    });
  if (tag === "ellipse")
    return svgPrimitiveSchema.parse({
      kind: tag,
      cx: number("cx"),
      cy: number("cy"),
      rx: number("rx"),
      ry: number("ry"),
    });
  if (tag === "rect") {
    const width = number("width"),
      height = number("height"),
      rx = number("rx", number("ry")),
      ry = number("ry", number("rx"));
    if (rx < 0 || ry < 0) throw new Error("Raio de canto SVG não pode ser negativo.");
    return svgPrimitiveSchema.parse({
      kind: tag,
      x: number("x"),
      y: number("y"),
      width,
      height,
      rx: Math.min(width / 2, rx),
      ry: Math.min(height / 2, ry),
    });
  }
  if (tag === "line")
    return svgPrimitiveSchema.parse({
      kind: tag,
      x1: number("x1"),
      y1: number("y1"),
      x2: number("x2"),
      y2: number("y2"),
    });
  if (tag === "polyline" || tag === "polygon") {
    const raw = attrs.points ?? "",
      tokens = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi,
      values: number[] = [];
    if (raw.length > 500000 || raw.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?|[\s,]/gi, ""))
      throw new Error("Lista de pontos SVG inválida/excessiva.");
    for (const match of raw.matchAll(tokens)) {
      if (values.length >= 8000) throw new Error("Primitiva SVG excede 4000 pontos.");
      values.push(Number(match[0]));
    }
    if (values.length < 4 || values.length % 2) throw new Error("Lista de pontos SVG incompleta.");
    const normalized: [number, number][] = [];
    for (let index = 0; index < values.length; index += 2) {
      const x = values[index],
        y = values[index + 1];
      if (x === undefined || y === undefined) throw new Error("Coordenada SVG ausente.");
      normalized.push([x, y]);
    }
    return svgPrimitiveSchema.parse({ kind: tag, points: normalized });
  }
  throw new Error("Tag não é primitiva SVG suportada.");
}
/** Native rendering keeps the primitive; this path is only its spatial model
 * for bounds/operations that explicitly consume editable Bézier geometry. */
export function svgPrimitivePathData(shape: SvgPrimitive): string {
  if (shape.kind === "line") return `M${shape.x1} ${shape.y1}L${shape.x2} ${shape.y2}`;
  if (shape.kind === "polygon" || shape.kind === "polyline")
    return (
      shape.points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(" ") +
      (shape.kind === "polygon" ? "Z" : "")
    );
  if (shape.kind === "rect") {
    const { x, y, width: w, height: h, rx, ry } = shape;
    return rx && ry
      ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
      : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  }
  const { cx: x, cy: y } = shape,
    rx = shape.kind === "circle" ? shape.r : shape.rx,
    ry = shape.kind === "circle" ? shape.r : shape.ry;
  if (!rx || !ry) return `M${x} ${y}`;
  return `M${x + rx} ${y}A${rx} ${ry} 0 0 1 ${x - rx} ${y}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
}
export function svgPrimitiveAttributes(shape: SvgPrimitive): Record<string, string> {
  if (shape.kind === "polyline" || shape.kind === "polygon")
    return { points: shape.points.map((point) => point.join(" ")).join(" ") };
  const attributes: Record<string, string> = {};
  for (const [name, value] of Object.entries(shape))
    if (name !== "kind") attributes[name] = String(value);
  return attributes;
}
