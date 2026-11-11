import { COMPASSO_LEGACY_CREDIT_POLICIES } from "@informach/config/collections";
import { expect, it } from "vitest";
import {
  assertCostAcceptance,
  COZYA_AI_COSTS,
  COZYA_AI_TARIFF,
  modelUsageUsd,
  speechCredits,
  usdToCredits,
} from "./costs";
import { assertTextBudget, recipeGenerationOptions } from "./generation-budget";

it("preserves one complete operation per old credit at the migration tariff", () => {
  const policy = COMPASSO_LEGACY_CREDIT_POLICIES.cozya;
  expect(COZYA_AI_TARIFF).toBe(policy.tariffVersion);
  expect(Math.max(...Object.values(COZYA_AI_COSTS).map((cost) => cost.maxCredits))).toBe(
    policy.multiplier,
  );
});

it("rejects unknown usage and counts every started minute without trusting an audio MIME type", () => {
  for (const usage of [
    {},
    { inputTokens: -1, outputTokens: 3 },
    { inputTokens: 3, outputTokens: 0 },
    { inputTokens: 3, outputTokens: 3501 },
    { inputTokens: 128001, outputTokens: 1 },
  ])
    expect(() => modelUsageUsd("openai/gpt-4o-mini", usage)).toThrow("INVALID_AI_USAGE");
  expect(
    usdToCredits(modelUsageUsd("openai/gpt-4o-mini", { inputTokens: 52000, outputTokens: 3500 })),
  ).toBeLessThanOrEqual(COZYA_AI_COSTS.text.maxCredits);
  expect(speechCredits(60)).toBe(1);
  expect(speechCredits(60.001)).toBe(2);
  for (const seconds of [0, -1, 120.001, Number.NaN])
    expect(() => speechCredits(seconds)).toThrow();
});
it("binds the accepted tariff and includes real instructions/schema in the prompt budget", () => {
  expect(() =>
    assertCostAcceptance({ ...COZYA_AI_COSTS.text, maxCredits: 1 }, COZYA_AI_COSTS.text),
  ).toThrow("AI_PRICE_CHANGED");
  expect(() =>
    assertCostAcceptance({ ...COZYA_AI_COSTS.text, version: "old" }, COZYA_AI_COSTS.text),
  ).toThrow("AI_PRICE_CHANGED");
  expect(() => recipeGenerationOptions("synthetic", "parse")).not.toThrow();
  expect(() => recipeGenerationOptions("synthetic", "refine")).not.toThrow();
  expect(() => assertTextBudget("á".repeat(16001), 32000)).toThrow("AI_CONTEXT_TOO_LARGE");
});
