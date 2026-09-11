import "server-only";

import { runBillableAgentCall } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { billing } from "@/features/billing/service";
import { NoRecipeResultError } from "./errors";
import { currentAiOperationId } from "./operation-context";
import { validateRecipeOutput } from "./recipe-output";
import { providerCostMetadata } from "./usage-metadata";

export type RefineRecipeInput = {
  userId: string;
  /**
   * Receita estruturada que está sendo refinada — vem do output do
   * `recipeParser` (parse de foto/texto/voz/url) ou de uma chamada anterior
   * de `refineRecipe`. Sempre `isValidRecipe: true` em chamadas reais; o
   * service não rejeita por isso (a UI já filtra antes de chamar).
   */
  currentRecipe: RecipeParserOutput;
  /**
   * Pedido livre do usuário em PT-BR ("torna sem lactose", "metade das
   * porções", "substitui chocolate por alfarroba"). Limite de chars é
   * imposto no route handler.
   */
  refinementRequest: string;
};

export type RefineRecipeResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.refine_conversational" as const;

type RecipeAgentResponse = {
  object: unknown;
  usage?: unknown;
  providerMetadata?: unknown;
};

/** Applies an explicit request to recipe data in the user message, without inferred memory.
 * Validation precedes credit commit; an accepted adaptation is still reviewed before saving.
 */
export async function refineRecipe(input: RefineRecipeInput): Promise<RefineRecipeResult> {
  if (
    input.currentRecipe.servings === null &&
    /\b(pessoas?|porç(?:ão|ões))\b/iu.test(input.refinementRequest)
  )
    throw new NoRecipeResultError(
      "Informe o rendimento original antes de adaptar para um número de pessoas. Nenhum crédito foi consumido.",
    );
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
    agent: "recipeRefiner",
    getUsage: (response) => response.usage,
    call: async ({ runId }) => {
      const mastra = await getMastra();
      const response = await mastra
        .getAgent("recipeRefiner")
        .generate(
          JSON.stringify({ receita: input.currentRecipe, pedido: input.refinementRequest }),
          {
            runId,
            abortSignal: AbortSignal.timeout(90000),
            modelSettings: { maxOutputTokens: 3500, temperature: 0 },
            structuredOutput: {
              schema: recipeParserSchema,
              errorStrategy: "strict",
            },
          },
        );
      validateRecipeOutput(response.object);
      return response;
    },
  });
  return validateRecipeOutput(out.result.object);
}
