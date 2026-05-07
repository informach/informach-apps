import "server-only";

import { withCredits } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { billing } from "@/features/billing/service";
import { env } from "@/lib/env";
import { normalizeUsage } from "./_shared";

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
        const response = await getMastra()
          .getAgent("recipeParser")
          .generate(input.text, {
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
