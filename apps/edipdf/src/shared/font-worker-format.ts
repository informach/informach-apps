import { z } from "zod";
export const fontInspectionRequestSchema = z.strictObject({
  bytes: z
    .custom<Uint8Array>((value) => value instanceof Uint8Array)
    .refine((bytes) => bytes.length >= 12 && bytes.length <= 8 * 1024 * 1024),
});
export const fontInspectionReplySchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    family: z.string().max(512),
    subfamily: z.string().max(512),
    info: z.strictObject({
      glyphs: z.number().int().min(1).max(40000),
      unitsPerEm: z.number().int().min(16).max(16384),
      subset: z.boolean(),
      embedding: z.enum(["installable", "editable"]),
    }),
  }),
  z.strictObject({ ok: z.literal(false), error: z.string().min(1).max(2000) }),
]);
