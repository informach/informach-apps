import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { z } from "zod";
import { inverse } from "../affine";
import { affineSchema } from "../affineSchema";

const coordinate = z.number().min(-100000).max(100000);
const common = {
  units: z.enum(["objectBoundingBox", "userSpaceOnUse"]),
  spread: z.enum(["pad", "reflect", "repeat"]),
  transform: affineSchema.optional(),
  stops: z
    .unknown()
    .refine((value) => Array.isArray(value) && value.length >= 2 && value.length <= 32, {
      error: "Gradiente requer 2–32 paradas.",
      abort: true,
    })
    .pipe(
      z
        .array(
          z.strictObject({
            offset: z.number().min(0).max(1),
            color: z
              .string()
              .regex(/^#[\da-f]{6}$/i)
              .transform((color) => color.toLowerCase()),
            opacity: z.number().min(0).max(1),
          }),
        )
        .min(2)
        .max(32),
    ),
};
export const gradientSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...common,
      kind: z.literal("linear"),
      x1: coordinate,
      y1: coordinate,
      x2: coordinate,
      y2: coordinate,
    }),
    z.strictObject({
      ...common,
      kind: z.literal("radial"),
      cx: coordinate,
      cy: coordinate,
      r: z.number().positive().max(100000),
      fx: coordinate,
      fy: coordinate,
    }),
  ])
  .superRefine((gradient, context) => {
    if (gradient.transform) {
      try {
        inverse(gradient.transform);
      } catch {
        context.addIssue({
          code: "custom",
          message: "Transformação do gradiente precisa ser invertível.",
        });
      }
    }
    if (
      gradient.stops.some(
        (stop, index) => index > 0 && stop.offset < (gradient.stops[index - 1]?.offset ?? 0),
      )
    )
      context.addIssue({ code: "custom", message: "Paradas do gradiente devem estar ordenadas." });
    if (gradient.kind === "linear" && gradient.x1 === gradient.x2 && gradient.y1 === gradient.y2)
      context.addIssue({
        code: "custom",
        message: "Vetor de gradiente linear precisa ter extensão.",
      });
  });
export type Gradient = z.infer<typeof gradientSchema>;
export const gradientPaintsSchema = z
  .strictObject({ fill: gradientSchema.optional(), stroke: gradientSchema.optional() })
  .refine((value) => value.fill || value.stroke, "Informe ao menos um gradiente.");
export type GradientPaints = z.infer<typeof gradientPaintsSchema>;
export interface GradientElement {
  tag: "linearGradient" | "radialGradient" | "stop";
  attrs: Record<string, string>;
  children: GradientElement[];
}
export function gradientId(input: Gradient) {
  const value = gradientSchema.parse(input),
    canonical = JSON.stringify(value);
  return `edi-gradient-${bytesToHex(sha256(new TextEncoder().encode(canonical)))}`;
}
export function gradientElement(input: Gradient): GradientElement {
  const value = gradientSchema.parse(input),
    attrs: Record<string, string> = {
      id: gradientId(value),
      gradientUnits: value.units,
      spreadMethod: value.spread,
      "color-interpolation": "sRGB",
    };
  if (value.transform) attrs.gradientTransform = `matrix(${value.transform.join(" ")})`;
  if (value.kind === "linear")
    Object.assign(attrs, {
      x1: String(value.x1),
      y1: String(value.y1),
      x2: String(value.x2),
      y2: String(value.y2),
    });
  else
    Object.assign(attrs, {
      cx: String(value.cx),
      cy: String(value.cy),
      r: String(value.r),
      fx: String(value.fx),
      fy: String(value.fy),
    });
  return {
    tag: value.kind === "linear" ? "linearGradient" : "radialGradient",
    attrs,
    children: value.stops.map((stop) => ({
      tag: "stop",
      attrs: {
        offset: String(stop.offset),
        "stop-color": stop.color,
        "stop-opacity": String(stop.opacity),
      },
      children: [],
    })),
  };
}
export function gradientDefinitions(paints: Iterable<GradientPaints | undefined>) {
  const definitions = new Map<string, GradientElement>();
  let inspected = 0;
  for (const value of paints) {
    if (++inspected > 12000) throw new Error("Orçamento de pinturas inspecionadas excedido.");
    for (const gradient of [value?.fill, value?.stroke])
      if (gradient) {
        const element = gradientElement(gradient),
          id = element.attrs.id;
        if (!id) throw new Error("Identidade de gradiente ausente.");
        definitions.set(id, element);
        if (definitions.size > 256)
          throw new Error("Limite de 256 gradientes distintos por cena/documento.");
      }
  }
  return [...definitions.values()];
}
export function gradientAttributes(value: GradientPaints | undefined) {
  const attrs: Record<string, string> = {};
  if (value?.fill) attrs.fill = `url(#${gradientId(value.fill)})`;
  if (value?.stroke) attrs.stroke = `url(#${gradientId(value.stroke)})`;
  return attrs;
}
export const gradientTags: ReadonlySet<string> = new Set([
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
]);
