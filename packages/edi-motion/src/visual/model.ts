import { z } from "zod";
import { svgAttributesSchema } from "../graphics/attributes";
import { transformSchema } from "../model";
import { isXmlText } from "../xmlText";
import { textDirectionSchema } from "./textDirection";
import { textPathSchema } from "./textPath";

export const visualTagSchema = z.enum([
  "image",
  "g",
  "svg",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
]);
export type VisualTag = z.infer<typeof visualTagSchema>;
export const textLayoutSchema = z.strictObject({ lineHeight: z.number().min(0.25).max(10) });
export type TextLayout = z.infer<typeof textLayoutSchema>;
/** The original path syntax preserves exact native SVG arcs. Spatial playback
 * owns the corresponding editable Bézier model and original affine matrix. */
export const visualContentSchema = z.strictObject({
  attrs: svgAttributesSchema.superRefine((attrs, context) => {
    for (const key of ["transform"])
      if (key in attrs)
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Geometria/transformação pertence ao playback espacial.",
        });
  }),
  text: z.string().max(10000).refine(isXmlText, "Texto deve conter caracteres XML válidos."),
  visible: z.boolean(),
  textLayout: textLayoutSchema.optional(),
  textDirection: textDirectionSchema.optional(),
  textPath: textPathSchema.optional(),
});
export type VisualContent = z.infer<typeof visualContentSchema>;
export const visualSceneSchema = z.strictObject({
  viewBox: z.tuple([
    z.number().min(-100000).max(100000),
    z.number().min(-100000).max(100000),
    z.number().positive().max(100000),
    z.number().positive().max(100000),
  ]),
  preserveAspectRatio: z
    .string()
    .regex(/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/),
  globalTransform: transformSchema,
});
export type VisualScene = z.infer<typeof visualSceneSchema>;
