import { z } from "zod";

/** Languages whose verified models ship in `resources/models`. */
export const OCR_LANGUAGES = ["por", "eng", "spa"] as const;
export const ocrLanguageSchema = z.enum(OCR_LANGUAGES);
export type OcrLanguage = z.infer<typeof ocrLanguageSchema>;

export const ocrTurnSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
export type OcrTurn = z.infer<typeof ocrTurnSchema>;

export interface OcrLimits {
  /** Largest side, in pixels, of one image sent to the engine. */
  maxSide: number;
  /** Largest area, in pixels, of one image sent to the engine. */
  maxPixels: number;
  /** Largest encoded image accepted by the worker. */
  maxImageBytes: number;
  maxWords: number;
  maxWordLength: number;
  maxLanguages: number;
  /** Largest deskew angle, in degrees, in either direction. */
  maxInclination: number;
}

/** Per-call engine limits. Larger images go through `planOcrTiles`. */
export const OCR_LIMITS: Readonly<OcrLimits> = Object.freeze({
  maxSide: 8192,
  maxPixels: 24_000_000,
  maxImageBytes: 96_000_000,
  maxWords: 100_000,
  maxWordLength: 2000,
  maxLanguages: 3,
  maxInclination: 10,
});

/**
 * Source limits for tiled recognition. Chromium canvases stop at 32767 px per side and
 * 268 435 456 px of area, so a larger source cannot be drawn in the renderer anyway.
 */
export const OCR_TILED_LIMITS: Readonly<OcrLimits> = Object.freeze({
  ...OCR_LIMITS,
  maxSide: 32_767,
  maxPixels: 268_435_456,
});

export function ocrLimits(overrides: Partial<OcrLimits> = {}): OcrLimits {
  const limits = { ...OCR_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits))
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`Limite OCR inválido: ${name}.`);
  return limits;
}

function megapixels(pixels: number): string {
  return (pixels / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** Word boxes are pixels of the recognized image: x0/y0 inclusive, x1/y1 exclusive. */
export function createOcrResultSchema(overrides: Partial<OcrLimits> = {}) {
  const limits = ocrLimits(overrides);
  return z
    .strictObject({
      width: z.number().int().positive().max(limits.maxSide),
      height: z.number().int().positive().max(limits.maxSide),
      confidence: z.number().finite().min(0).max(100),
      inclination: z
        .number()
        .finite()
        .min(-limits.maxInclination)
        .max(limits.maxInclination)
        .optional(),
      words: z
        .array(
          z.strictObject({
            text: z.string().max(limits.maxWordLength),
            confidence: z.number().finite().min(0).max(100),
            x0: z.number().finite().nonnegative(),
            y0: z.number().finite().nonnegative(),
            x1: z.number().finite().nonnegative(),
            y1: z.number().finite().nonnegative(),
            line: z.number().int().nonnegative(),
          }),
        )
        .max(limits.maxWords),
    })
    .superRefine((result, ctx) => {
      if (result.width * result.height > limits.maxPixels)
        ctx.addIssue({
          code: "custom",
          message: `Imagem OCR excede ${megapixels(limits.maxPixels)} megapixels.`,
        });
      for (const word of result.words)
        if (
          word.x1 <= word.x0 ||
          word.y1 <= word.y0 ||
          word.x1 > result.width ||
          word.y1 > result.height
        )
          ctx.addIssue({ code: "custom", message: "Coordenadas OCR fora da imagem." });
    });
}

export const ocrResultSchema = createOcrResultSchema();
export type OcrResult = z.infer<typeof ocrResultSchema>;
export type OcrWord = OcrResult["words"][number];

/** Why recognition could not run at all. A result without words is not unavailability. */
export const ocrUnavailableReasonSchema = z.enum(["language", "assets", "engine", "limits"]);
export type OcrUnavailableReason = z.infer<typeof ocrUnavailableReasonSchema>;

export type OcrOutcome =
  | { status: "text"; result: OcrResult }
  | { status: "empty"; result: OcrResult }
  | { status: "unavailable"; reason: OcrUnavailableReason; message: string };

/** Thrown when the engine, its assets or the requested language cannot be used. */
export class OcrUnavailableError extends Error {
  readonly reason: OcrUnavailableReason;
  constructor(reason: OcrUnavailableReason, message: string) {
    super(message);
    this.name = "OcrUnavailableError";
    this.reason = reason;
  }
}

/** Keep "engine ran and found nothing" separate from "engine could not run". */
export function ocrOutcome(result: OcrResult): OcrOutcome {
  return result.words.some((word) => word.text.trim())
    ? { status: "text", result }
    : { status: "empty", result };
}

/**
 * Convert a recognition failure into an outcome. Unavailability becomes a state; other
 * errors, including cancellation, are rethrown so callers do not mistake them for it.
 */
export function ocrUnavailableOutcome(error: unknown): OcrOutcome {
  if (error instanceof OcrUnavailableError)
    return { status: "unavailable", reason: error.reason, message: error.message };
  throw error;
}

/** Orientation score: letters/digits weighted by squared word confidence; punctuation is noise. */
export function ocrScore(result: Pick<OcrResult, "words">): number {
  return result.words.reduce(
    (sum, word) =>
      sum + (word.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) * (word.confidence / 100) ** 2,
    0,
  );
}

/** Width-weighted median baseline angle, in degrees, ignoring short or implausible lines. */
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

export interface OcrPlacement {
  result: { width: number; height: number };
  /** Input image rotated clockwise by `turn`, then deskewed by `skew` around its centre. */
  turn: OcrTurn;
  skew: number;
}

/**
 * Inverse of `prepareOcrImage`: a point of the recognized image, normalized (0–1) to the
 * original input before rotation and deskew.
 */
export function ocrPoint(placement: OcrPlacement, x: number, y: number): [number, number] {
  const { width, height } = placement.result;
  const a = (-placement.skew * Math.PI) / 180;
  const dx = x - width / 2,
    dy = y - height / 2;
  const u = (Math.cos(a) * dx - Math.sin(a) * dy + width / 2) / width;
  const v = (Math.sin(a) * dx + Math.cos(a) * dy + height / 2) / height;
  switch (placement.turn) {
    case 90:
      return [v, 1 - u];
    case 180:
      return [1 - u, 1 - v];
    case 270:
      return [1 - v, u];
    default:
      return [u, v];
  }
}
