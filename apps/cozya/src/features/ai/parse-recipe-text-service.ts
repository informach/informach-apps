import "server-only";

import { withCredits, withRetry } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { billing } from "@/features/billing/service";
import { normalizeUsage } from "./_shared";

export type ParseRecipeFromTextInput = {
  userId: string;
  text: string;
};

export type ParseRecipeFromTextResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.extract_from_text" as const;

export async function parseRecipeFromText(
  input: ParseRecipeFromTextInput,
): Promise<ParseRecipeFromTextResult> {
  const out = await withCredits({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: FEATURE,
    model: COZYA_MODELS[FEATURE],
    estimateCost: () => ({ estimatedAmount: 1 }),
    computeActualCost: () => ({ actualAmount: 1 }),
    call: async ({ reservation }) => {
      await recorder.start({
        runId: reservation.id,
        app: "cozya",
        agent: "recipeParser",
      });
      try {
        const response = await withRetry(() =>
          getMastra()
            .getAgent("recipeParser")
            .generate(input.text, {
              runId: reservation.id,
              structuredOutput: {
                schema: recipeParserSchema,
                errorStrategy: "strict",
              },
            }),
        );
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
