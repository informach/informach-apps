import { describe, expect, it } from "vitest";

import { normalizeUsage } from "../usage";

describe("normalizeUsage", () => {
  it("aceita o shape do AI SDK v5+ (inputTokens/outputTokens)", () => {
    expect(normalizeUsage({ inputTokens: 120, outputTokens: 45, totalTokens: 165 })).toEqual({
      promptTokens: 120,
      completionTokens: 45,
      totalTokens: 165,
    });
  });

  it("aceita o shape legado (promptTokens/completionTokens)", () => {
    expect(normalizeUsage({ promptTokens: 120, completionTokens: 45, totalTokens: 165 })).toEqual({
      promptTokens: 120,
      completionTokens: 45,
      totalTokens: 165,
    });
  });

  it("prefere inputTokens/outputTokens quando ambos os shapes coexistem", () => {
    expect(
      normalizeUsage({
        inputTokens: 200,
        outputTokens: 50,
        totalTokens: 250,
        promptTokens: 1,
        completionTokens: 2,
      }),
    ).toEqual({ promptTokens: 200, completionTokens: 50, totalTokens: 250 });
  });

  it("deriva totalTokens quando ausente", () => {
    expect(normalizeUsage({ inputTokens: 70, outputTokens: 30 })).toEqual({
      promptTokens: 70,
      completionTokens: 30,
      totalTokens: 100,
    });
  });

  it("zera campos faltantes ou inválidos", () => {
    expect(normalizeUsage(undefined)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    expect(normalizeUsage(null)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    expect(normalizeUsage({})).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  it("zera valores negativos, não-finitos ou não-numéricos", () => {
    expect(
      normalizeUsage({ inputTokens: -5, outputTokens: Number.NaN, totalTokens: "10" }),
    ).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });

  it("trunca valores fracionários para inteiros", () => {
    expect(normalizeUsage({ inputTokens: 12.7, outputTokens: 5.4 })).toEqual({
      promptTokens: 12,
      completionTokens: 5,
      totalTokens: 17,
    });
  });
});
