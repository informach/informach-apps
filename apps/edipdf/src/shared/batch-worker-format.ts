import { z } from "zod";
import { batchDetailSchema, batchSettingsSchema } from "./batch-format.ts";
import { conversionResultSchema } from "./conversion-format.ts";

const payload = z.strictObject({
  bytes: conversionResultSchema.shape.bytes,
  detail: batchDetailSchema,
  warnings: conversionResultSchema.shape.warnings,
});
export const batchWorkerRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("start"),
    pdf: conversionResultSchema.shape.bytes,
    settings: batchSettingsSchema,
    previous: z
      .strictObject({ bytes: conversionResultSchema.shape.bytes, detail: batchDetailSchema })
      .optional(),
  }),
  z.strictObject({ kind: z.literal("ack"), seq: z.number().int().positive() }),
]);
export type BatchWorkerInput = Extract<z.infer<typeof batchWorkerRequestSchema>, { kind: "start" }>;
export const batchPreviewRequestSchema = z.strictObject({
  bytes: conversionResultSchema.shape.bytes,
  detail: batchDetailSchema,
  name: z.string().min(1).max(40),
});
export const batchPreviewReplySchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), bytes: conversionResultSchema.shape.bytes }),
  z.strictObject({ ok: z.literal(false), error: z.string().max(2000) }),
]);
export const batchWorkerReplySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("checkpoint"), seq: z.number().int().positive(), payload }),
  z.strictObject({ kind: z.literal("complete"), payload }),
  z.strictObject({
    kind: z.literal("planning"),
    stage: z.enum(["bookmarks", "size"]),
    checked: z.number().int().min(0).max(1000),
  }),
  z.strictObject({
    kind: z.literal("progress"),
    done: z.number().int().nonnegative().max(100),
    total: z.number().int().min(1).max(100),
  }),
  z.strictObject({ kind: z.literal("error"), error: z.string().max(2000) }),
]);
