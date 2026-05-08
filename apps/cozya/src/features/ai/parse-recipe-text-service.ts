import "server-only";

import { runBillableAgentCall } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { cozyaThreadId } from "@/ai/working-memory";
import { billing } from "@/features/billing/service";

export type ParseRecipeFromTextInput = {
  userId: string;
  text: string;
};

export type ParseRecipeFromTextResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.extract_from_text" as const;

type RecipeAgentResponse = {
  object: unknown;
  usage?: unknown;
};

export async function parseRecipeFromText(
  input: ParseRecipeFromTextInput,
): Promise<ParseRecipeFromTextResult> {
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
      const response = await getMastra()
        .getAgent("recipeParser")
        .generate(input.text, {
          runId,
          memory: {
            thread: cozyaThreadId(input.userId, "extract_from_text"),
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
