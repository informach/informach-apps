import "server-only";

import { runBillableAgentCall } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { cozyaThreadId } from "@/ai/working-memory";
import { billing } from "@/features/billing/service";

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
};

/**
 * Roda o agent `recipeRefiner` para aplicar um pedido conversacional sobre
 * uma receita já estruturada. A receita atual entra via `options.system`
 * (não via `prompt`) para que o agente trate a receita como contexto
 * imutável de leitura, e o pedido do usuário ocupa o slot de mensagem.
 *
 * Bilha 1 crédito via reserve→commit/release. Pro-gate + rate limit ficam no
 * route handler. Working memory (preferências do usuário) é compartilhada
 * com `recipeParser`/`recipeParserVision` por escopo de `resource`, então o
 * refiner já enxerga restrições alimentares lembradas em chamadas anteriores.
 */
export async function refineRecipe(input: RefineRecipeInput): Promise<RefineRecipeResult> {
  const out = await runBillableAgentCall<RecipeAgentResponse>({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: FEATURE,
    model: COZYA_MODELS[FEATURE],
    recorder,
    agent: "recipeRefiner",
    getUsage: (response) => response.usage,
    call: async ({ runId }) => {
      const mastra = await getMastra();
      const response = await mastra.getAgent("recipeRefiner").generate(input.refinementRequest, {
        runId,
        memory: {
          thread: cozyaThreadId(input.userId, "refine_conversational"),
          resource: input.userId,
        },
        system: `Receita atual:\n${JSON.stringify(input.currentRecipe, null, 2)}`,
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
