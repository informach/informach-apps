import "server-only";

import { getMastra } from "@/ai";
import { COZYA_MODELS } from "@/ai/models";
import type { RecipeParserOutput } from "@/ai/recipe-parser/schema";
import { COZYA_AI_COSTS, COZYA_AI_LIMITS, modelUsageUsd, usdToCredits } from "./costs";
import { assertTextBudget, recipeGenerationOptions } from "./generation-budget";
import { validateRecipeOutput } from "./recipe-output";
import { providerCostMetadata } from "./usage-metadata";
import { runCozyaAiWorkflow } from "./workflow";

export type ParseRecipeFromTextInput = {
  userId: string;
  text: string;
};

export type ParseRecipeFromTextResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.extract_from_text" as const;

export async function parseRecipeFromText(
  input: ParseRecipeFromTextInput,
): Promise<ParseRecipeFromTextResult> {
  assertTextBudget(input.text, COZYA_AI_LIMITS.textBytes);
  return runCozyaAiWorkflow({
    userId: input.userId,
    feature: FEATURE,
    agent: "recipeParser",
    quote: COZYA_AI_COSTS.text,
    parseResult: validateRecipeOutput,
    call: async (runId) => {
      const mastra = await getMastra();
      const response = await mastra
        .getAgent("recipeParser")
        .generate(input.text, recipeGenerationOptions(runId, "parse"));
      return {
        value: validateRecipeOutput(response.object),
        actualCredits: usdToCredits(modelUsageUsd(COZYA_MODELS[FEATURE], response.usage)),
        usage: response.usage,
        metadata: providerCostMetadata(response.providerMetadata, response.usage),
      };
    },
  });
}
