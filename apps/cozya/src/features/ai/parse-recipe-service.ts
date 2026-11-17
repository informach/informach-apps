import "server-only";

import { getMastra } from "@/ai";
import { COZYA_MODELS } from "@/ai/models";
import type { RecipeParserOutput } from "@/ai/recipe-parser/schema";
import { COZYA_AI_COSTS, COZYA_AI_LIMITS, modelUsageUsd, usdToCredits } from "./costs";
import { assertTextBudget, recipeGenerationOptions } from "./generation-budget";
import { validateRecipeOutput } from "./recipe-output";
import { providerCostMetadata } from "./usage-metadata";
import { runCozyaAiWorkflow } from "./workflow";

export type ParseRecipeFromVoiceInput = {
  userId: string;
  transcript: string;
};

export type ParseRecipeFromVoiceResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.parse_voice" as const;

/** Parses a bounded transcript under the accepted shared-wallet operation. */
export async function parseRecipeFromVoice(
  input: ParseRecipeFromVoiceInput,
): Promise<ParseRecipeFromVoiceResult> {
  assertTextBudget(input.transcript, COZYA_AI_LIMITS.textBytes);
  return runCozyaAiWorkflow({
    userId: input.userId,
    feature: FEATURE,
    agent: "recipeParser",
    quote: COZYA_AI_COSTS.voice,
    parseResult: validateRecipeOutput,
    call: async (runId) => {
      const mastra = await getMastra();
      const response = await mastra
        .getAgent("recipeParser")
        .generate(input.transcript, recipeGenerationOptions(runId, "parse"));
      return {
        value: validateRecipeOutput(response.object),
        actualCredits: usdToCredits(modelUsageUsd(COZYA_MODELS[FEATURE], response.usage)),
        usage: response.usage,
        metadata: providerCostMetadata(response.providerMetadata, response.usage),
      };
    },
  });
}
