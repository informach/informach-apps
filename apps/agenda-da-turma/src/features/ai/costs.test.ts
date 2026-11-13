import { COMPASSO_LEGACY_CREDIT_POLICIES } from "@informach/config/collections";
import { expect, it } from "vitest";
import {
  AGENDA_AI_TARIFF,
  actualNoticeCredits,
  actualSubjectTextCredits,
  assertCostAcceptance,
  noticeCostQuote,
  SPEECH_COST,
  SUBJECT_IMAGE_COST,
  SUBJECT_TEXT_COST,
  speechCredits,
  usdToCredits,
} from "./costs";

it("preserves every legacy one-credit operation including the entire PDF budget", () => {
  const policy = COMPASSO_LEGACY_CREDIT_POLICIES["agenda-da-turma"];
  expect(AGENDA_AI_TARIFF).toBe(policy.tariffVersion);
  const pdf = noticeCostQuote({
    text: "",
    attachment: { dataUrl: "data:application/pdf;base64,example" },
  });
  expect(pdf.maxCredits).toBe(policy.multiplier);
  for (const cost of [SPEECH_COST, SUBJECT_IMAGE_COST, SUBJECT_TEXT_COST])
    expect(cost.maxCredits).toBeLessThanOrEqual(policy.multiplier);
});

it("preserves the approved economics for text, vision and a minute of speech", () => {
  expect(actualSubjectTextCredits({ inputTokens: 4000, outputTokens: 2000 })).toBe(1);
  expect(actualNoticeCredits({ inputTokens: 4000, outputTokens: 2000 })).toBe(5);
  expect(usdToCredits(0.006)).toBe(1);
  expect(usdToCredits(0.012)).toBe(SPEECH_COST.maxCredits);
});
it("bounds worst-case inputs and output, including native PDF context", () => {
  const pdf = noticeCostQuote({
    text: "",
    attachment: { dataUrl: "data:application/pdf;base64,example" },
  });
  expect(actualNoticeCredits({ inputTokens: 128000, outputTokens: 4096 })).toBeLessThanOrEqual(
    pdf.maxCredits,
  );
  expect(actualSubjectTextCredits({ inputTokens: 40000, outputTokens: 4096 })).toBeLessThanOrEqual(
    SUBJECT_TEXT_COST.maxCredits,
  );
  expect(actualNoticeCredits({ inputTokens: 23000, outputTokens: 4096 })).toBeLessThanOrEqual(
    SUBJECT_IMAGE_COST.maxCredits,
  );
  expect(noticeCostQuote({ text: "😀".repeat(8000) }).maxCredits).toBeGreaterThan(
    noticeCostQuote({ text: "a".repeat(16000) }).maxCredits,
  );
});
it("refuses stale acceptance and malformed usage rather than inventing a cheap charge", () => {
  const quote = noticeCostQuote({ text: "Test" });
  expect(() => assertCostAcceptance({ ...quote, maxCredits: 1 }, quote)).toThrow(
    "AI_PRICE_CHANGED",
  );
  expect(() => assertCostAcceptance({ ...quote, version: "old" }, quote)).toThrow(
    "AI_PRICE_CHANGED",
  );
  for (const usage of [
    undefined,
    {},
    { inputTokens: 1, outputTokens: 0 },
    { inputTokens: 1.5, outputTokens: 2 },
    { inputTokens: 1, outputTokens: 5000 },
  ])
    expect(() => actualNoticeCredits(usage)).toThrow("INVALID_AI_USAGE");
});

it("charges the published duration bands and rejects unbounded speech before billing", () => {
  for (const seconds of [0.01, 59.99, 60]) expect(speechCredits(seconds)).toBe(1);
  for (const seconds of [60.01, 119.99, 120]) expect(speechCredits(seconds)).toBe(2);
  for (const seconds of [0, -1, NaN, Infinity, 120.01])
    expect(() => speechCredits(seconds)).toThrow();
});
