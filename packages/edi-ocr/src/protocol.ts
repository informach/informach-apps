import { z } from "zod";
import {
  createOcrResultSchema,
  type OcrLimits,
  ocrLanguageSchema,
  ocrUnavailableReasonSchema,
} from "./format.ts";

/** Messages between the host (`./canvas`) and the worker (`./worker`). */
export function ocrRequestSchema(limits: OcrLimits) {
  return z.strictObject({
    image: z.instanceof(Uint8Array),
    width: z.number().int().positive().max(limits.maxSide),
    height: z.number().int().positive().max(limits.maxSide),
    languages: z.array(ocrLanguageSchema).min(1).max(limits.maxLanguages),
    /** Base URL holding `worker.min.js`, `core/` and `models/`, ending with `/`. */
    assets: z.string().url(),
  });
}

export function ocrResponseSchema(limits: OcrLimits) {
  return z.discriminatedUnion("ok", [
    z.strictObject({ ok: z.literal(true), result: createOcrResultSchema(limits) }),
    z.strictObject({
      ok: z.literal(false),
      error: z.string(),
      unavailable: ocrUnavailableReasonSchema.optional(),
    }),
  ]);
}

export const ocrProgressSchema = z.strictObject({
  progress: z.number().finite().min(0).max(1),
  status: z.string(),
});
