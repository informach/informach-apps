import "server-only";

import { withCredits, withRetry } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { cozyaThreadId } from "@/ai/working-memory";
import { billing } from "@/features/billing/service";
import { normalizeUsage } from "./_shared";

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
  const out = await withCredits({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: FEATURE,
    model: COZYA_MODELS[FEATURE],
    estimateCost: () => ({ estimatedAmount: 1 }),
    computeActualCost: () => ({ actualAmount: 1 }),
    call: async ({ reservation }) => {
      await recorder.start({
        runId: reservation.id,
        app: "cozya",
        agent: "recipeRefiner",
      });
      try {
        const response = await withRetry(() =>
          getMastra()
            .getAgent("recipeRefiner")
            .generate(input.refinementRequest, {
              runId: reservation.id,
              memory: {
                thread: cozyaThreadId(input.userId, "refine_conversational"),
                resource: input.userId,
              },
              system: `Receita atual:\n${JSON.stringify(input.currentRecipe, null, 2)}`,
              structuredOutput: {
                schema: recipeParserSchema,
                errorStrategy: "strict",
              },
            }),
        );
        const usage = normalizeUsage(response.usage);
        await recorder.finish({
          runId: reservation.id,
          status: "succeeded",
          usage,
        });
        return response.object as RecipeParserOutput;
      } catch (err) {
        await recorder.finish({
          runId: reservation.id,
          status: "failed",
          metadata: { error: err instanceof Error ? err.message : String(err) },
        });
        throw err;
      }
    },
  });
  return out.result;
}
