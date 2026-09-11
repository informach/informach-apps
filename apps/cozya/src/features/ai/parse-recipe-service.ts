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

export type ParseRecipeFromVoiceInput = {
  userId: string;
  transcript: string;
};

export type ParseRecipeFromVoiceResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.parse_voice" as const;

type RecipeAgentResponse = {
  object: unknown;
  usage?: unknown;
  providerMetadata?: unknown;
};

/**
 * Sends the Whisper transcript to the recipeParser Mastra agent and returns
 * the structured recipe object. Bills 1 credit via the standard
 * reserve→commit/release flow. Pro gating and rate limiting belong to the
 * route handler — this service trusts the caller has already enforced those.
 */
export async function parseRecipeFromVoice(
  input: ParseRecipeFromVoiceInput,
): Promise<ParseRecipeFromVoiceResult> {
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
      const response = await mastra.getAgent("recipeParser").generate(input.transcript, {
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
