import { z } from "zod";
import { inspectionSchema } from "./engine-contracts.ts";

export const formContentInspectionSchema = z.strictObject({
  sourceSignatures: z.number().int().nonnegative(),
  bytes: z
    .custom<Uint8Array>((value) => value instanceof Uint8Array)
    .refine((value) => value.length > 0 && value.length <= 64 * 1024 * 1024),
  inspection: inspectionSchema.refine((value) => value.pages.length === 1),
});
export type FormContentInspection = z.infer<typeof formContentInspectionSchema>;
