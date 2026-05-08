import "server-only";

import { withCredits, withRetry } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { billing } from "@/features/billing/service";
import { normalizeUsage } from "./_shared";

export type ParseRecipeFromImageInput = {
  userId: string;
  imageDataUrl: string;
};

export type ParseRecipeFromImageResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.extract_from_photo" as const;

export async function parseRecipeFromImage(
  input: ParseRecipeFromImageInput,
): Promise<ParseRecipeFromImageResult> {
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
        agent: "recipeParserVision",
      });
      try {
        // Vision agent (gpt-4o) — see apps/cozya/src/ai/index.ts. Other parse
        // flows reuse the cheaper recipeParser (gpt-4o-mini). withRetry só
        // reentra falhas transitórias (429/5xx/timeout) — se a reserva estourar
        // o TTL no meio, o sweeper de release cobre. Validation/4xx propaga.
        const response = await withRetry(() =>
          getMastra()
            .getAgent("recipeParserVision")
            .generate(
              [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "Extraia a receita desta imagem.",
                    },
                    {
                      type: "image",
                      image: input.imageDataUrl,
                      providerOptions: { openai: { imageDetail: "low" } },
                    },
                  ],
                },
              ],
              {
                runId: reservation.id,
                structuredOutput: {
                  schema: recipeParserSchema,
                  errorStrategy: "strict",
                },
              },
            ),
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
