import "server-only";

import { runBillableAgentCall } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { cozyaThreadId } from "@/ai/working-memory";
import { billing } from "@/features/billing/service";

export type ParseRecipeFromImageInput = {
  userId: string;
  imageDataUrl: string;
};

export type ParseRecipeFromImageResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.extract_from_photo" as const;

type RecipeAgentResponse = {
  object: unknown;
  usage?: unknown;
};

export async function parseRecipeFromImage(
  input: ParseRecipeFromImageInput,
): Promise<ParseRecipeFromImageResult> {
  const out = await runBillableAgentCall<RecipeAgentResponse>({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: FEATURE,
    model: COZYA_MODELS[FEATURE],
    recorder,
    agent: "recipeParserVision",
    getUsage: (response) => response.usage,
    call: async ({ runId }) => {
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
                image: input.imageDataUrl,
                providerOptions: { openai: { imageDetail: "low" } },
              },
            ],
          },
        ],
        {
          runId,
          memory: {
            thread: cozyaThreadId(input.userId, "extract_from_photo"),
            resource: input.userId,
          },
          structuredOutput: {
            schema: recipeParserSchema,
            errorStrategy: "strict",
          },
        },
      );
      return response;
    },
  });
  return out.result.object as RecipeParserOutput;
}
