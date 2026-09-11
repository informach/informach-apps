import "server-only";

import { runBillableAgentCall } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { billing } from "@/features/billing/service";
import { currentAiOperationId } from "./operation-context";
import { validateRecipeOutput } from "./recipe-output";
import { providerCostMetadata } from "./usage-metadata";

export type ParseRecipeFromTextInput = {
  userId: string;
  text: string;
};

export type ParseRecipeFromTextResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.extract_from_text" as const;

type RecipeAgentResponse = {
  object: unknown;
  usage?: unknown;
  providerMetadata?: unknown;
};

export async function parseRecipeFromText(
  input: ParseRecipeFromTextInput,
): Promise<ParseRecipeFromTextResult> {
  const out = await runBillableAgentCall<RecipeAgentResponse>({
    billing,
    runId: currentAiOperationId(),
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: FEATURE,
    model: COZYA_MODELS[FEATURE],
    recorder,
    retry: false,
    metadata: { userId: input.userId },
    getErrorMetadata: (error) => ({ error: error instanceof Error ? error.name : "UnknownError" }),
    getSuccessMetadata: (response) =>
      providerCostMetadata(response.providerMetadata, response.usage),
    agent: "recipeParser",
    getUsage: (response) => response.usage,
    call: async ({ runId }) => {
      const mastra = await getMastra();
      const response = await mastra.getAgent("recipeParser").generate(input.text, {
        runId,
        abortSignal: AbortSignal.timeout(90000),
        modelSettings: { maxOutputTokens: 3500, temperature: 0 },
        structuredOutput: {
          schema: recipeParserSchema,
          errorStrategy: "strict",
        },
      });
      validateRecipeOutput(response.object);
      return response;
    },
  });
  return validateRecipeOutput(out.result.object);
}
