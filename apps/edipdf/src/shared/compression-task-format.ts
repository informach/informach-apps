import { z } from "zod";

const identity = {
  sha256: z.string().regex(/^[a-f\d]{64}$/),
  length: z
    .number()
    .int()
    .positive()
    .max(512 * 1024 * 1024),
};
export const compressionSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("file"), path: z.string().min(1).max(32768), ...identity }),
  z.strictObject({ kind: z.literal("snapshot"), ...identity }),
]);
export const compressionSettingsSchema = z.strictObject({
  level: z.enum(["light", "balanced", "strong"]),
  target: z
    .number()
    .int()
    .min(1024)
    .max(512 * 1024 * 1024)
    .optional(),
  acceptLarger: z.boolean(),
  previewPage: z.number().int().nonnegative().max(100000),
  review: z.boolean(),
});
export const compressionInputSchema = z
  .strictObject({
    kind: z.literal("compression"),
    source: compressionSourceSchema,
    settings: compressionSettingsSchema,
    bytes: z
      .custom<Uint8Array>((value) => value instanceof Uint8Array)
      .refine((value) => value.length > 0 && value.length <= 128 * 1024 * 1024)
      .optional(),
  })
  .superRefine((input, context) => {
    if (
      input.source.kind === "snapshot"
        ? !input.bytes || input.bytes.length !== input.source.length
        : input.bytes !== undefined
    )
      context.addIssue({
        code: "custom",
        message: "A entrada de compactação não corresponde à cópia ou ao arquivo escolhido.",
      });
  });
export type CompressionInput = z.infer<typeof compressionInputSchema>;
export type CompressionSettings = z.infer<typeof compressionSettingsSchema>;
export type CompressionSource = z.infer<typeof compressionSourceSchema>;
export function sameCompressionSource(a: CompressionSource, b: CompressionSource): boolean {
  return (
    a.sha256 === b.sha256 &&
    a.length === b.length &&
    (a.kind === "file" ? b.kind === "file" && a.path === b.path : b.kind === "snapshot")
  );
}
