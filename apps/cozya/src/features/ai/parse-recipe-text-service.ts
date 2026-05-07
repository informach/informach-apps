import "server-only";

import {
  createAgentRunRecorder,
  createDrizzleAgentRunStore,
  withCredits,
} from "@informach/ai-core";
import { db } from "@informach/db";
import { mastra } from "@/ai";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { billing } from "@/features/billing/service";
import { env } from "@/lib/env";

const recorder = createAgentRunRecorder({ store: createDrizzleAgentRunStore(db) });

export type ParseRecipeFromTextInput = {
  userId: string;
  text: string;
};

export type ParseRecipeFromTextResult = RecipeParserOutput;

export async function parseRecipeFromText(
  input: ParseRecipeFromTextInput,
): Promise<ParseRecipeFromTextResult> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const out = await withCredits({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: "cozya.recipe.extract_from_text",
    model: "gpt-4o-mini",
    estimateCost: () => ({ estimatedAmount: 1 }),
    computeActualCost: () => ({ actualAmount: 1 }),
    call: async ({ reservation }) => {
      await recorder.start({
        runId: reservation.id,
        app: "cozya",
        agent: "recipeParserText",
      });
      try {
        const response = await mastra.getAgent("recipeParser").generate(input.text, {
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
