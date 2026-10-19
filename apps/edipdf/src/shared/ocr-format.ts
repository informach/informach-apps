import { z } from "zod";

export const ocrLanguageSchema = z.enum(["por", "eng", "spa"]);
export type OcrLanguage = z.infer<typeof ocrLanguageSchema>;
export const ocrResultSchema = z
  .strictObject({
    width: z.number().int().positive().max(8192),
    height: z.number().int().positive().max(8192),
    confidence: z.number().finite().min(0).max(100),
    inclination: z.number().finite().min(-10).max(10).optional(),
    words: z
      .array(
        z.strictObject({
          text: z.string().max(2000),
          confidence: z.number().finite().min(0).max(100),
          x0: z.number().finite().nonnegative(),
          y0: z.number().finite().nonnegative(),
          x1: z.number().finite().nonnegative(),
          y1: z.number().finite().nonnegative(),
          line: z.number().int().nonnegative(),
        }),
      )
      .max(100_000),
  })
  .superRefine((result, ctx) => {
    if (result.width * result.height > 24_000_000)
      ctx.addIssue({ code: "custom", message: "Imagem OCR excede 24 megapixels." });
    for (const word of result.words)
      if (
        word.x1 <= word.x0 ||
        word.y1 <= word.y0 ||
        word.x1 > result.width ||
        word.y1 > result.height
      )
        ctx.addIssue({ code: "custom", message: "Coordenadas OCR fora da imagem." });
  });
export type OcrResult = z.infer<typeof ocrResultSchema>;
export const ocrPageSchema = z.strictObject({
  page: z.number().int().nonnegative().max(100000),
  result: ocrResultSchema,
  turn: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  skew: z.number().finite().min(-10).max(10),
});

export function ocrScore(result: OcrResult): number {
  return result.words.reduce(
    (sum, word) =>
      sum + (word.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) * (word.confidence / 100) ** 2,
    0,
  );
}

export function ocrInclination(
  lines: { x0: number; y0: number; x1: number; y1: number }[],
): number {
  const candidates = lines
    .flatMap((line) => {
      const width = line.x1 - line.x0;
      const angle = (Math.atan2(line.y1 - line.y0, width) * 180) / Math.PI;
      return width > 40 && Number.isFinite(angle) && Math.abs(angle) <= 10
        ? [{ angle, width }]
        : [];
    })
    .sort((a, b) => a.angle - b.angle);
  const total = candidates.reduce((sum, item) => sum + item.width, 0);
  let weight = 0;
  for (const candidate of candidates) {
    weight += candidate.width;
    if (weight >= total / 2) return candidate.angle;
  }
  return 0;
}
