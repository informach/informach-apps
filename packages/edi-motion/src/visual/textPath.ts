import { z } from "zod";
import { geometryCost } from "../geometry";
import { measureTrimGeometry } from "../geometry/trimMeasure";
import { parseSvgPath } from "../svgPath";

/** Text laid along its own curve, in the text's local coordinates (the space
 * its x/y use). The offset is a percentage of the whole path length. */
export const textPathSchema = z.strictObject({
  d: z
    .string()
    .trim()
    .min(1)
    .max(200000)
    .superRefine((value, context) => {
      try {
        if (geometryCost(parseSvgPath(value)) > 4000)
          context.addIssue({ code: "custom", message: "Caminho do texto excede 4000 vértices." });
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        context.addIssue({ code: "custom", message: error.message });
      }
    }),
  startOffset: z.number().min(0).max(100),
});
export type TextPath = z.infer<typeof textPathSchema>;
/** Each text owns one generated definition; IDs are unique like object IDs. */
export const textPathId = (objectId: string) => `edi-text-path-${objectId}`;
export function textPathCost(textPath: TextPath | undefined) {
  return textPath ? geometryCost(parseSvgPath(textPath.d)) : 0;
}
/** Total length of a text path's curve (all subpaths), for converting
 * absolute SVG offsets into the stored percentage. */
export function textPathLength(d: string) {
  return measureTrimGeometry(parseSvgPath(d), 0.01, { remaining: 200_000 }).length;
}
