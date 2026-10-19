import { ocrResultSchema, ocrTurnSchema } from "@informach/edi-ocr";
import { z } from "zod";

/** One recognized PDF page: result, rotation and deskew applied to the rendered viewport. */
export const ocrPageSchema = z.strictObject({
  page: z.number().int().nonnegative().max(100000),
  result: ocrResultSchema,
  turn: ocrTurnSchema,
  skew: z.number().finite().min(-10).max(10),
});
