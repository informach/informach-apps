import { z } from "zod";
import { lottieOptionsSchema } from "./prepare";

export const lottieRequestSchema = z.strictObject({
  version: z.literal(1),
  operation: z.enum(["inspect", "compile"]),
  project: z.unknown(),
  options: lottieOptionsSchema,
});
const reportSchema = z.strictObject({
  supported: z.boolean(),
  issues: z
    .array(
      z.strictObject({
        objectId: z.string().max(200).nullable(),
        code: z.string().max(100),
        message: z.string().max(2000),
        severity: z.enum(["error", "warning"]),
      }),
    )
    .max(100),
  omitted: z.number().int().min(0).max(100000),
  frames: z.number().int().min(1).max(2_880_001),
  fps: z.number().finite().positive().max(1000),
  requiresSamplingConsent: z.boolean(),
  requiresRendererPrecisionConsent: z.boolean(),
  requiresAnimationOnlyConsent: z.boolean(),
});
export const lottieMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("progress"),
    completed: z.number().int().min(0).max(1201),
    total: z.number().int().min(1).max(1201),
  }),
  z.strictObject({
    kind: z.literal("error"),
    message: z.string().max(2000),
    truncated: z.boolean(),
  }),
  z.strictObject({ kind: z.literal("report"), report: reportSchema }),
  z.strictObject({
    kind: z.literal("export"),
    report: reportSchema,
    content: z.string().max(8_000_000),
  }),
]);
export type LottieTaskResult =
  | { kind: "report"; report: z.infer<typeof reportSchema> }
  | { kind: "export"; report: z.infer<typeof reportSchema>; content: string };

export function readLottieTaskMessage(
  raw: unknown,
  onProgress?: (done: number, total: number) => void,
): { done: false } | { done: true; value: LottieTaskResult } {
  const message = lottieMessageSchema.parse(raw);
  if (message.kind === "error")
    throw new Error(message.message + (message.truncated ? " [diagnóstico abreviado]" : ""));
  if (message.kind === "progress") {
    if (message.completed > message.total) throw new Error("Progresso Lottie inválido.");
    onProgress?.(message.completed, message.total);
    return { done: false };
  }
  if (message.kind === "export" && new TextEncoder().encode(message.content).length > 8_000_000)
    throw new Error("Lottie excede 8 MB UTF-8.");
  return { done: true, value: message };
}
