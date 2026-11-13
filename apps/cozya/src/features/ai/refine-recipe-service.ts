import "server-only";

import { getMastra } from "@/ai";
import { COZYA_MODELS } from "@/ai/models";
import type { RecipeParserOutput } from "@/ai/recipe-parser/schema";
import { COZYA_AI_COSTS, COZYA_AI_LIMITS, modelUsageUsd, usdToCredits } from "./costs";
import { NoRecipeResultError } from "./errors";
import { assertTextBudget, recipeGenerationOptions } from "./generation-budget";
import { validateRecipeOutput } from "./recipe-output";
import { providerCostMetadata } from "./usage-metadata";
import { runCozyaAiWorkflow } from "./workflow";

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
  assertTextBudget(
    JSON.stringify({ receita: input.currentRecipe, pedido: input.refinementRequest }),
    COZYA_AI_LIMITS.refinementBytes,
  );
  return runCozyaAiWorkflow({
    userId: input.userId,
    feature: FEATURE,
    agent: "recipeRefiner",
    quote: COZYA_AI_COSTS.refine,
    parseResult: validateRecipeOutput,
    call: async (runId) => {
      const mastra = await getMastra();
      const response = await mastra
        .getAgent("recipeRefiner")
        .generate(
          JSON.stringify({ receita: input.currentRecipe, pedido: input.refinementRequest }),
          recipeGenerationOptions(runId, "refine"),
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
