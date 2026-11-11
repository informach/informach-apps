import { z } from "zod";
import type { CozyaModel } from "@/ai/models";
import { COZYA_MODEL_PRICES } from "@/ai/provider-policy";

export const COZYA_AI_TARIFF = "2026-11-10-v1";
export const COZYA_AI_LIMITS = {
  outputTokens: 3500,
  researchOutputTokens: 2200,
  contextTokens: 128000,
  fixedPromptBytes: 20000,
  // prepareVisionImage emits a single 1280px square; this exceeds its tile budget.
  imageTokens: 3000,
  textBytes: 32000,
  refinementBytes: 68000,
  researchResultBytes: 32000,
  // One Exa request, enforced by max_tool_calls; five source results.
  searchUsd: 0.007,
} as const;
export type AiCostAcceptance = { version: string; maxCredits: number };
export function usdToCredits(usd: number) {
  if (!Number.isFinite(usd) || usd < 0) throw new Error("INVALID_AI_COST");
  return Math.max(1, Math.ceil((usd * 6 * 1.3) / 0.05));
}
function tokenUsd(model: CozyaModel, input: number, output: number) {
  const price = COZYA_MODEL_PRICES[model];
  return (input * price.prompt + output * price.completion) / 1_000_000;
}
const mini = "openai/gpt-4o-mini";
const textUsd = tokenUsd(mini, COZYA_AI_LIMITS.fixedPromptBytes + COZYA_AI_LIMITS.textBytes, 3500);
const researchUsd =
  tokenUsd(mini, COZYA_AI_LIMITS.contextTokens, COZYA_AI_LIMITS.researchOutputTokens) +
  COZYA_AI_LIMITS.searchUsd +
  textUsd;
const quote = (maxCredits: number): AiCostAcceptance => ({ version: COZYA_AI_TARIFF, maxCredits });
export const COZYA_AI_COSTS = {
  text: quote(usdToCredits(textUsd)),
  photo: quote(
    usdToCredits(
      tokenUsd(
        "openai/gpt-4o",
        COZYA_AI_LIMITS.fixedPromptBytes + COZYA_AI_LIMITS.imageTokens,
        3500,
      ),
    ),
  ),
  voice: quote(usdToCredits(textUsd)),
  refine: quote(
    usdToCredits(
      tokenUsd(mini, COZYA_AI_LIMITS.fixedPromptBytes + COZYA_AI_LIMITS.refinementBytes, 3500),
    ),
  ),
  research: quote(usdToCredits(researchUsd)),
  audioRecipe: quote(2 + usdToCredits(textUsd)),
  audioResearch: quote(2 + usdToCredits(researchUsd)),
  speech: quote(2),
} as const;
export function assertCostAcceptance(accepted: AiCostAcceptance, expected: AiCostAcceptance) {
  if (accepted.version !== expected.version || accepted.maxCredits !== expected.maxCredits)
    throw new Error("AI_PRICE_CHANGED");
}
const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative().max(COZYA_AI_LIMITS.contextTokens),
  outputTokens: z.number().int().positive().max(COZYA_AI_LIMITS.outputTokens),
});
/** Published token tariff, distinct from provider-reported USD in telemetry. */
export function modelUsageUsd(model: CozyaModel, usage: unknown) {
  const parsed = usageSchema.safeParse(usage);
  if (!parsed.success) throw new Error("INVALID_AI_USAGE");
  return tokenUsd(model, parsed.data.inputTokens, parsed.data.outputTokens);
}
export function speechCredits(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120)
    throw new Error("INVALID_SPEECH_DURATION");
  return Math.ceil(seconds / 60);
}
