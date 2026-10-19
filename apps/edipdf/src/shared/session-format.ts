import { z } from "zod";
export const sessionSchema = z.strictObject({
  version: z.literal(1),
  activePath: z.string().max(32768).nullable(),
  tabs: z
    .array(
      z.object({
        path: z.string().min(1).max(32768),
        page: z.number().int().nonnegative(),
        zoom: z.number().finite().min(0.1).max(8),
        fit: z.enum(["width", "page"]).nullable(),
        reading: z.boolean(),
        layout: z.enum(["continuous", "single", "spread"]),
        offset: z.number().finite().min(-1e7).max(1e7),
        left: z.number().finite().min(0).max(1e7),
      }),
    )
    .max(100),
});
export type PdfSession = z.infer<typeof sessionSchema>;
export const EMPTY_SESSION: PdfSession = { version: 1, activePath: null, tabs: [] };
