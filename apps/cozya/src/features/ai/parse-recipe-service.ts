import "server-only";

import { withCredits } from "@informach/ai-core";
import { mastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { billing } from "@/features/billing/service";
import { env } from "@/lib/env";

export type ParseRecipeFromVoiceInput = {
  userId: string;
  transcript: string;
};

export type ParseRecipeFromVoiceResult = RecipeParserOutput;

/**
 * Sends the Whisper transcript to the recipeParser Mastra agent and returns
 * the structured recipe object. Bills 1 credit via the standard
 * reserve→commit/release flow. Pro gating and rate limiting belong to the
 * route handler — this service trusts the caller has already enforced those.
 */
export async function parseRecipeFromVoice(
  input: ParseRecipeFromVoiceInput,
): Promise<ParseRecipeFromVoiceResult> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const out = await withCredits({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: "cozya.recipe.parse_voice",
    model: "gpt-4o-mini",
    estimateCost: () => ({ estimatedAmount: 1 }),
    computeActualCost: () => ({ actualAmount: 1 }),
    call: async ({ reservation }) => {
      await recorder.start({
        runId: reservation.id,
        app: "cozya",
        agent: "recipeParser",
      });
      try {
        const response = await mastra.getAgent("recipeParser").generate(input.transcript, {
          runId: reservation.id,
          structuredOutput: {
            schema: recipeParserSchema,
            errorStrategy: "strict",
          },
        });
        const usage = normalizeUsage(response.usage);
        await recorder.finish({
          runId: reservation.id,
          status: "succeeded",
          usage,
        });
        return response.object as RecipeParserOutput;
      } catch (err) {
        await recorder.finish({
          runId: reservation.id,
          status: "failed",
          metadata: { error: err instanceof Error ? err.message : String(err) },
        });
        throw err;
      }
    },
  });
  return out.result;
}

function normalizeUsage(raw: unknown): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  const u = (raw ?? {}) as Record<string, unknown>;
  const promptTokens = numberOr(u.inputTokens ?? u.promptTokens, 0);
  const completionTokens = numberOr(u.outputTokens ?? u.completionTokens, 0);
  const totalTokens = numberOr(u.totalTokens, promptTokens + completionTokens);
  return { promptTokens, completionTokens, totalTokens };
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}
