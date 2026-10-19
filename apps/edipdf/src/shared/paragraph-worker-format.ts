import { z } from "zod";
import { paragraphAnnotationSchema } from "./document-format.ts";
export const paragraphLayoutSchema = z.strictObject({
  runs: z
    .array(
      z.strictObject({
        text: z.string().max(100000),
        x: z.number().finite(),
        baseline: z.number().finite(),
        width: z.number().finite().nonnegative(),
      }),
    )
    .max(10000),
  lines: z.number().int().min(0).max(10000),
  height: z.number().finite().nonnegative(),
});
export const paragraphWorkerRequestSchema = z.strictObject({
  annotation: paragraphAnnotationSchema,
  font: z
    .custom<Uint8Array>((value) => value instanceof Uint8Array)
    .refine((bytes) => bytes.length > 0 && bytes.length <= 8 * 1024 * 1024),
});
export const paragraphWorkerReplySchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), layout: paragraphLayoutSchema }),
  z.strictObject({ ok: z.literal(false), error: z.string().min(1).max(2000) }),
]);
