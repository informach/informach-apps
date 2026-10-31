import { z } from "zod";
import type { Artboard } from "./project";

/** A ruler guide of an artboard, in its viewBox units: `x` is a vertical line at
 * that x, `y` a horizontal line at that y. Guides only help the editor place
 * objects; no export draws them. */
export const guideSchema = z.strictObject({
  id: z.string().regex(/^guide-[\w-]{1,100}$/),
  axis: z.enum(["x", "y"]),
  position: z.number().min(-100000).max(100000),
});
export type Guide = z.infer<typeof guideSchema>;
export const GUIDE_LIMIT = 200;
export const guidesSchema = z
  .array(guideSchema)
  .max(GUIDE_LIMIT)
  .superRefine((guides, ctx) => {
    if (new Set(guides.map((guide) => guide.id)).size !== guides.length)
      ctx.addIssue({ code: "custom", message: "Guias com identificador repetido." });
  });
/** Replaces the active artboard's guides; an empty list removes them. */
export const guidesCommandSchema = z.strictObject({
  type: z.literal("guides"),
  guides: guidesSchema,
});
export function applyGuides(board: Artboard, command: z.infer<typeof guidesCommandSchema>) {
  if (command.guides.length) board.guides = command.guides;
  else delete board.guides;
}
