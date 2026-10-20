import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { z } from "zod";
import { inverse } from "../affine";
import { affineSchema } from "../affineSchema";
import { parseSvgPath } from "../svgPath";

const coordinate = z.number().min(-100000).max(100000),
  extent = z.number().positive().max(100000),
  unit = z.number().min(0).max(1),
  color = z
    .string()
    .regex(/^#[\da-f]{6}$/i)
    .transform((value) => value.toLowerCase());
/** Vertices across every shape of one pattern tile, and across every distinct tile of a scene,
 * style library or blueprint (definitions are pooled, so copies do not count twice). */
export const PATTERN_TILE_VERTICES = 4000;
export const PATTERN_POOL_VERTICES = 100000;
export function patternVertices(pattern: Pattern) {
  return pattern.shapes.reduce(
    (sum, shape) =>
      sum + parseSvgPath(shape.d).reduce((count, contour) => count + contour.points.length, 0),
    0,
  );
}

/** Tile content: static vector paths with solid paint. No nested paint servers, text, images,
 * scripts or references, so a pattern renders identically wherever its definition is copied. */
export const patternShapeSchema = z.strictObject({
  d: z.string().min(1).max(200000),
  fill: z.union([z.literal("none"), color]),
  fillOpacity: unit,
  fillRule: z.enum(["nonzero", "evenodd"]),
  stroke: z.union([z.literal("none"), color]),
  strokeOpacity: unit,
  strokeWidth: z.number().min(0).max(10000),
  strokeLinecap: z.enum(["butt", "round", "square"]),
  strokeLinejoin: z.enum(["miter", "round", "bevel"]),
  opacity: unit,
  transform: affineSchema.optional(),
});
export type PatternShape = z.infer<typeof patternShapeSchema>;
const aspect = z.string().regex(/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/);
export const patternSchema = z
  .strictObject({
    kind: z.literal("pattern"),
    /** `patternUnits`: the tile rectangle in fractions of the shape or local pixels. */
    units: z.enum(["objectBoundingBox", "userSpaceOnUse"]),
    /** `patternContentUnits` when there is no viewBox. */
    contentUnits: z.enum(["objectBoundingBox", "userSpaceOnUse"]),
    x: coordinate,
    y: coordinate,
    width: extent,
    height: extent,
    viewBox: z.tuple([coordinate, coordinate, extent, extent]).optional(),
    preserveAspectRatio: aspect.optional(),
    transform: affineSchema.optional(),
    shapes: z.array(patternShapeSchema).min(1).max(64),
  })
  .superRefine((pattern, context) => {
    for (const matrix of [pattern.transform, ...pattern.shapes.map((shape) => shape.transform)])
      if (matrix)
        try {
          inverse(matrix);
        } catch {
          context.addIssue({
            code: "custom",
            message: "Transformação do padrão precisa ser invertível.",
          });
        }
    if (pattern.preserveAspectRatio && !pattern.viewBox)
      context.addIssue({
        code: "custom",
        message: "preserveAspectRatio do padrão requer viewBox.",
      });
    if (pattern.viewBox && pattern.contentUnits !== "userSpaceOnUse")
      context.addIssue({
        code: "custom",
        message: "Com viewBox, o conteúdo do padrão usa o sistema do viewBox (userSpaceOnUse).",
      });
    let vertices = 0;
    for (const shape of pattern.shapes) {
      try {
        vertices += parseSvgPath(shape.d).reduce((sum, contour) => sum + contour.points.length, 0);
      } catch (error) {
        context.addIssue({
          code: "custom",
          message: error instanceof Error ? error.message : "Caminho do padrão inválido.",
        });
        return;
      }
      if (shape.fill === "none" && shape.stroke === "none")
        context.addIssue({ code: "custom", message: "Forma do padrão sem pintura visível." });
    }
    if (vertices > PATTERN_TILE_VERTICES)
      context.addIssue({
        code: "custom",
        message: `Padrão excede ${PATTERN_TILE_VERTICES} vértices por tile.`,
      });
  });
export type Pattern = z.infer<typeof patternSchema>;
export interface PatternElement {
  tag: "pattern" | "path";
  attrs: Record<string, string>;
  children: PatternElement[];
}
export function patternId(input: Pattern) {
  const value = patternSchema.parse(input);
  return `edi-pattern-${bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))))}`;
}
const matrix = (value: readonly number[]) => `matrix(${value.join(" ")})`;
export function patternElement(input: Pattern): PatternElement {
  const value = patternSchema.parse(input),
    attrs: Record<string, string> = {
      id: patternId(value),
      patternUnits: value.units,
      patternContentUnits: value.contentUnits,
      x: String(value.x),
      y: String(value.y),
      width: String(value.width),
      height: String(value.height),
    };
  if (value.viewBox) attrs.viewBox = value.viewBox.join(" ");
  if (value.preserveAspectRatio) attrs.preserveAspectRatio = value.preserveAspectRatio;
  if (value.transform) attrs.patternTransform = matrix(value.transform);
  return {
    tag: "pattern",
    attrs,
    children: value.shapes.map((shape) => ({
      tag: "path",
      attrs: {
        d: shape.d,
        fill: shape.fill,
        "fill-opacity": String(shape.fillOpacity),
        "fill-rule": shape.fillRule,
        stroke: shape.stroke,
        "stroke-opacity": String(shape.strokeOpacity),
        "stroke-width": String(shape.strokeWidth),
        "stroke-linecap": shape.strokeLinecap,
        "stroke-linejoin": shape.strokeLinejoin,
        opacity: String(shape.opacity),
        ...(shape.transform ? { transform: matrix(shape.transform) } : {}),
      },
      children: [],
    })),
  };
}
