import "server-only";
import { prepareVisionImage } from "@informach/ai-core/vision-image";

import { getMastra } from "@/ai";
import { COZYA_MODELS } from "@/ai/models";
import type { RecipeParserOutput } from "@/ai/recipe-parser/schema";
import { COZYA_AI_COSTS, modelUsageUsd, usdToCredits } from "./costs";
import { recipeGenerationOptions } from "./generation-budget";
import { validateRecipeOutput } from "./recipe-output";
import { providerCostMetadata } from "./usage-metadata";
import { runCozyaAiWorkflow } from "./workflow";

export type ParseRecipeFromImageInput = {
  userId: string;
  imageDataUrl: string;
};

export type ParseRecipeFromImageResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.extract_from_photo" as const;

export async function parseRecipeFromImage(
  input: ParseRecipeFromImageInput,
): Promise<ParseRecipeFromImageResult> {
  const imageDataUrl = await prepareVisionImage(input.imageDataUrl);
  return runCozyaAiWorkflow({
    userId: input.userId,
    feature: FEATURE,
    agent: "recipeParserVision",
    quote: COZYA_AI_COSTS.photo,
    parseResult: validateRecipeOutput,
    call: async (runId) => {
      // Vision agent (gpt-4o) — see apps/cozya/src/ai/index.ts. Other parse
      // flows reuse the cheaper recipeParser (gpt-4o-mini).
      const mastra = await getMastra();
      const response = await mastra.getAgent("recipeParserVision").generate(
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
                image: imageDataUrl,
                providerOptions: { openai: { imageDetail: "high" } },
              },
            ],
          },
        ],
        recipeGenerationOptions(runId, "parse"),
      );
      return {
        value: validateRecipeOutput(response.object),
        actualCredits: usdToCredits(modelUsageUsd(COZYA_MODELS[FEATURE], response.usage)),
        usage: response.usage,
        metadata: providerCostMetadata(response.providerMetadata, response.usage),
      };
    },
  });
}
