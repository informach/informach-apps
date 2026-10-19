import { z } from "zod";
import { engineOperationSchema, securitySchema } from "./engine-contracts.ts";
import { imageCropSchema } from "./image-crop.ts";
import { ocrPageSchema } from "./ocr-format.ts";
import { pdfOpeningPasswordSchema } from "./pdf-password.ts";
import { sanitizeOptionsSchema } from "./pdf-sanitize.ts";

const input = {
  bytes: z
    .custom<Uint8Array>((value) => value instanceof Uint8Array)
    .refine((b) => b.length > 0 && b.length <= 512 * 1024 * 1024),
};
export const engineRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...input,
    kind: z.literal("ocr"),
    pages: z.array(ocrPageSchema).min(1).max(100),
    font: z
      .custom<Uint8Array>((value) => value instanceof Uint8Array)
      .refine((font) => font.length > 0 && font.length < 32 * 1024 * 1024),
  }),
  z.object({ ...input, kind: z.literal("inspect") }),
  z.strictObject({
    ...input,
    kind: z.literal("inspectForm"),
    page: z.number().int().nonnegative().max(100000),
    occurrence: z.number().int().nonnegative().max(999),
  }),
  z.strictObject({
    ...input,
    kind: z.literal("transformForm"),
    page: z.number().int().nonnegative().max(100000),
    occurrence: z.number().int().nonnegative().max(999),
    operation: engineOperationSchema,
  }),
  z.object({
    ...input,
    kind: z.literal("cropImage"),
    occurrence: z.number().int().nonnegative().max(999).optional(),
    page: z.number().int().nonnegative(),
    object: z.number().int().nonnegative(),
    crop: imageCropSchema,
  }),
  z.object({
    ...input,
    kind: z.literal("text"),
    password: pdfOpeningPasswordSchema.optional(),
    includeAnnotations: z.boolean(),
    styles: z.boolean().optional(),
    layout: z.boolean().optional(),
  }),
  z.object({
    ...input,
    kind: z.literal("extractImage"),
    occurrence: z.number().int().nonnegative().max(999).optional(),
    page: z.number().int().nonnegative(),
    object: z.number().int().nonnegative(),
    rendered: z.boolean().optional(),
  }),
  z.object({ ...input, kind: z.literal("decrypt"), password: pdfOpeningPasswordSchema }),
  z.object({ ...input, kind: z.literal("encrypt"), security: securitySchema }),
  z.object({ ...input, kind: z.literal("sanitize"), options: sanitizeOptionsSchema }),
  z.object({
    ...input,
    kind: z.literal("transform"),
    operations: z.array(engineOperationSchema).max(10000),
  }),
]);
export type EngineRequest = z.infer<typeof engineRequestSchema>;
