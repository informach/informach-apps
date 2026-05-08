import "server-only";

import { withCredits } from "@informach/ai-core";
import { createOpenAI } from "@informach/ai-core/providers";
import { generateText } from "ai";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { billing } from "@/features/billing/service";
import { env } from "@/lib/env";
import { normalizeUsage } from "./_shared";
import { buildResearchPrompt } from "./research-recipe-prompt";

export type ResearchRecipeFromPromptInput = {
  userId: string;
  prompt: string;
};

export type ResearchRecipeFromPromptResult = RecipeParserOutput;

/**
 * Sinaliza que a busca na web não encontrou nenhuma receita popular
 * correspondente ao prompt do usuário. O route handler converte em
 * `{ isValidRecipe: false, reason }` para que o dialog reuse o painel
 * `not_recipe` existente.
 */
export class RecipeNotFoundError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "RecipeNotFoundError";
  }
}

export async function researchRecipeFromPrompt(
  input: ResearchRecipeFromPromptInput,
): Promise<ResearchRecipeFromPromptResult> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

  const out = await withCredits({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: "cozya.recipe.generate_from_prompt",
    model: "gpt-4o-mini",
    estimateCost: () => ({ estimatedAmount: 1 }),
    computeActualCost: () => ({ actualAmount: 1 }),
    call: async ({ reservation }) => {
      // Step 1 — pesquisa na web. Roda como um agente sintético "recipeResearcher"
      // para que o ai.agent_runs registre o run separadamente do parsing.
      await recorder.start({
        runId: reservation.id,
        app: "cozya",
        agent: "recipeResearcher",
      });
      let researchText: string;
      let usedWebSearch = false;
      try {
        const research = await generateText({
          model: openai.responses("gpt-4o-mini"),
          tools: {
            web_search: openai.tools.webSearchPreview({ searchContextSize: "low" }),
          },
          toolChoice: "auto",
          prompt: buildResearchPrompt(input.prompt),
        });
        researchText = research.text.trim();
        // Fail closed: if the model answered without calling web_search, treat
        // the response as hallucinated and reject. Optional chaining keeps the
        // check safe across `ai` SDK versions that may not expose `steps`.
        usedWebSearch =
          research.steps?.some((step) =>
            step.toolCalls?.some((call) => call.toolName === "web_search"),
          ) ?? false;
        await recorder.finish({
          runId: reservation.id,
          status: "succeeded",
          usage: normalizeUsage(research.usage),
        });
      } catch (err) {
        await recorder.finish({
          runId: reservation.id,
          status: "failed",
          metadata: { error: err instanceof Error ? err.message : String(err) },
        });
        throw err;
      }

      if (!usedWebSearch || researchText.startsWith("NAO_ENCONTRADA") || researchText.length < 30) {
        throw new RecipeNotFoundError(
          "Não encontrei uma receita popular pra esse pedido. Tente algo mais específico.",
        );
      }

      // Step 2 — estrutura. Reusa o `recipeParser` (mesmo runId), que já tem
      // instruções para "texto colado de um site". Mastra registra o segundo
      // run em ai_mastra.mastra_traces sob o mesmo runId.
      const response = await getMastra()
        .getAgent("recipeParser")
        .generate(researchText, {
          runId: reservation.id,
          structuredOutput: {
            schema: recipeParserSchema,
            errorStrategy: "strict",
          },
        });
      return response.object as RecipeParserOutput;
    },
  });
  return out.result;
}
