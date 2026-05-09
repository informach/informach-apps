import "server-only";

import { runBillableAgentCall } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { cozyaThreadId } from "@/ai/working-memory";
import { billing } from "@/features/billing/service";

export type ParseRecipeFromVoiceInput = {
  userId: string;
  transcript: string;
};

export type ParseRecipeFromVoiceResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.parse_voice" as const;

type RecipeAgentResponse = {
  object: unknown;
  usage?: unknown;
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
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: FEATURE,
    model: COZYA_MODELS[FEATURE],
    recorder,
    agent: "recipeParser",
    getUsage: (response) => response.usage,
    call: async ({ runId }) => {
      const mastra = await getMastra();
      const response = await mastra.getAgent("recipeParser").generate(input.transcript, {
        runId,
        memory: {
          thread: cozyaThreadId(input.userId, "parse_voice"),
          resource: input.userId,
        },
        structuredOutput: {
          schema: recipeParserSchema,
          errorStrategy: "strict",
        },
      });
      return response;
    },
  });
  return out.result.object as RecipeParserOutput;
}
