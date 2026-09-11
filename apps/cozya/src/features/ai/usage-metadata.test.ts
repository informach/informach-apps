import { expect, it } from "vitest";
import { providerCostMetadata } from "./usage-metadata";

it("uses reported SDK or Mastra costs without persisting raw provider data", () => {
  expect(
    providerCostMetadata({ openrouter: { usage: { cost: 0.02 }, provider: "OpenAI" } }),
  ).toEqual({ providerCostUsd: 0.02, provider: "OpenAI" });
  expect(
    providerCostMetadata(undefined, { raw: { raw: { cost: 0.001, text: "private" } } }),
  ).toEqual({ providerCostUsd: 0.001 });
  expect(providerCostMetadata(undefined, { raw: { raw: { cost: "unknown" } } })).toEqual({});
  expect(providerCostMetadata(undefined, { inputTokens: 100 })).toEqual({});
});
