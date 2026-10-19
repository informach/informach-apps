import { describe, expect, it } from "vitest";
import {
  createOcrResultSchema,
  type OcrResult,
  OcrUnavailableError,
  ocrInclination,
  ocrOutcome,
  ocrPoint,
  ocrResultSchema,
  ocrScore,
  ocrUnavailableOutcome,
} from "../src/index.ts";

const first = { text: "Ação", confidence: 94, x0: 60, y0: 100, x1: 110, y1: 120, line: 0 };
const result: OcrResult = {
  width: 600,
  height: 800,
  confidence: 90,
  words: [first, { text: "local", confidence: 60, x0: 120, y0: 100, x1: 170, y1: 120, line: 0 }],
};

describe("ocrPoint", () => {
  it("inverts all quarter turns and skew without moving the document", () => {
    const placement = { result, turn: 0, skew: 0 } as const;
    expect(ocrPoint(placement, 60, 80)).toEqual([0.1, 0.1]);
    expect(ocrPoint({ ...placement, turn: 90 }, 60, 80)).toEqual([0.1, 0.9]);
    expect(ocrPoint({ ...placement, turn: 180 }, 60, 80)).toEqual([0.9, 0.9]);
    expect(ocrPoint({ ...placement, turn: 270 }, 60, 80)).toEqual([0.9, 0.1]);
    const angle = (5 * Math.PI) / 180,
      dx = 60 - 300,
      dy = 80 - 400;
    const [u, v] = ocrPoint(
      { ...placement, skew: 5 },
      Math.cos(angle) * dx - Math.sin(angle) * dy + 300,
      Math.sin(angle) * dx + Math.cos(angle) * dy + 400,
    );
    expect(u).toBeCloseTo(0.1, 9);
    expect(v).toBeCloseTo(0.1, 9);
  });
});

describe("orientation scoring and deskew", () => {
  it("rejects punctuation noise and implausible baselines", () => {
    expect(ocrScore(result)).toBeGreaterThan(
      ocrScore({ ...result, words: [{ ...first, text: "...!?", confidence: 100 }] }),
    );
    expect(ocrScore(result)).toBeGreaterThan(
      ocrScore({ ...result, words: result.words.map((word) => ({ ...word, confidence: 10 })) }),
    );
    const slope = Math.tan((4 * Math.PI) / 180);
    expect(
      ocrInclination([
        { x0: 0, y0: 100, x1: 500, y1: 100 + slope * 500 },
        { x0: 0, y0: 0, x1: 20, y1: 0 },
      ]),
    ).toBeCloseTo(4, 9);
    expect(ocrInclination([{ x0: 0, y0: 0, x1: 0, y1: 500 }])).toBe(0);
  });
});

describe("result schema", () => {
  it("rejects boxes outside the image and images above the per-call limit", () => {
    expect(ocrResultSchema.safeParse({ ...result, words: [{ ...first, x1: 900 }] }).success).toBe(
      false,
    );
    const large = ocrResultSchema.safeParse({ ...result, width: 8192, height: 8192 });
    expect(large.success).toBe(false);
    expect(large.error?.issues.map((issue) => issue.message)).toContain(
      "Imagem OCR excede 24 megapixels.",
    );
    expect(ocrResultSchema.safeParse({ ...result, width: 8193 }).success).toBe(false);
  });

  it("accepts larger merged results only with explicit limits", () => {
    const tall = { ...result, width: 1920, height: 30000 };
    expect(ocrResultSchema.safeParse(tall).success).toBe(false);
    expect(
      createOcrResultSchema({ maxSide: 32767, maxPixels: 268_435_456 }).safeParse(tall).success,
    ).toBe(true);
    expect(() => createOcrResultSchema({ maxSide: 0 })).toThrow(/Limite OCR inválido/);
  });
});

describe("outcome", () => {
  it("keeps empty recognition distinct from unavailability", () => {
    expect(ocrOutcome(result).status).toBe("text");
    expect(ocrOutcome({ ...result, words: [] })).toEqual({
      status: "empty",
      result: { ...result, words: [] },
    });
    expect(ocrUnavailableOutcome(new OcrUnavailableError("assets", "Modelo ausente"))).toEqual({
      status: "unavailable",
      reason: "assets",
      message: "Modelo ausente",
    });
    const aborted = new DOMException("OCR cancelado", "AbortError");
    expect(() => ocrUnavailableOutcome(aborted)).toThrow(aborted);
  });
});
