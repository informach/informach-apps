import { z } from "zod";
import { conversionResultSchema } from "./conversion-format.ts";
export const mergeRequestSchema = z
  .strictObject({
    files: z
      .array(
        z.strictObject({
          name: z.string().min(1).max(1000),
          bytes: z
            .custom<Uint8Array>((value) => value instanceof Uint8Array)
            .refine((bytes) => bytes.length > 0 && bytes.length <= 512 * 1024 * 1024),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((input, context) => {
    if (input.files.reduce((sum, file) => sum + file.bytes.length, 0) > 512 * 1024 * 1024)
      context.addIssue({ code: "custom", message: "A seleção para juntar excede 512 MB." });
    if (input.files.some((file) => !/\.(?:pdf|png|jpe?g)$/i.test(file.name)))
      context.addIssue({
        code: "custom",
        message: "Escolha somente PDF, PNG ou JPEG para juntar.",
      });
  });
export type MergeRequest = z.infer<typeof mergeRequestSchema>;
export const mergeReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("progress"),
    index: z.number().int().nonnegative().max(99),
    total: z.number().int().min(1).max(100),
  }),
  z.strictObject({
    kind: z.literal("complete"),
    bytes: conversionResultSchema.shape.bytes,
    pages: z.number().int().min(1).max(1000),
  }),
  z.strictObject({ kind: z.literal("error"), error: z.string().max(2000) }),
]);
