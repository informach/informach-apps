import "server-only";

import { withCredits } from "@informach/ai-core";
import { createOpenRouter } from "@informach/ai-core/providers";
import { generateText } from "ai";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { billing } from "@/features/billing/service";
import { env } from "@/lib/env";
import { openRouterAttributionHeaders } from "@/lib/openrouter";
import { normalizeUsage } from "./_shared";
import { buildResearchPrompt } from "./research-recipe-prompt";

export type ResearchRecipeFromPromptInput = {
  userId: string;
  prompt: string;
};

export type ResearchRecipeFromPromptResult = RecipeParserOutput;

const RECIPE_NOT_FOUND_REASON =
  "Não encontrei uma receita popular pra esse pedido. Tente algo mais específico.";

export async function researchRecipeFromPrompt(
  input: ResearchRecipeFromPromptInput,
): Promise<ResearchRecipeFromPromptResult> {
  const openrouter = createOpenRouter({
    apiKey: env.OPENROUTER_API_KEY,
    headers: openRouterAttributionHeaders(),
  });

  const out = await withCredits({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: "cozya.recipe.generate_from_prompt",
    model: "openai/gpt-4o-mini",
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
          model: openrouter("openai/gpt-4o-mini"),
          tools: {
            web_search: openrouter.tools.webSearch({
              maxResults: 5,
              engine: "auto",
            }),
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
        const searchMiss = isRecipeResearchMiss({ usedWebSearch, researchText });
        await recorder.finish({
          runId: reservation.id,
          status: "succeeded",
          usage: normalizeUsage(research.usage),
          metadata: {
            outcome: searchMiss ? "not_found" : "research_found",
            usedWebSearch,
          },
        });
        if (searchMiss) {
          return recipeNotFoundResult();
        }
      } catch (err) {
        await recorder.finish({
          runId: reservation.id,
          status: "failed",
          metadata: { error: err instanceof Error ? err.message : String(err) },
        });
        throw err;
      }

      // Step 2 — estrutura. Reusa o `recipeParser` (mesmo runId), que já tem
      // instruções para "texto colado de um site". Mastra registra o segundo
      // run em ai_mastra.mastra_traces sob o mesmo runId.
      try {
        const response = await getMastra()
          .getAgent("recipeParser")
          .generate(researchText, {
            runId: reservation.id,
            structuredOutput: {
              schema: recipeParserSchema,
              errorStrategy: "strict",
            },
          });
        await recorder.finish({
          runId: reservation.id,
          status: "succeeded",
          usage: normalizeUsage(response.usage),
          metadata: { outcome: "parsed" },
        });
        return response.object as RecipeParserOutput;
      } catch (err) {
        await recorder.finish({
          runId: reservation.id,
          status: "failed",
          metadata: {
            stage: "structured_parse",
            error: err instanceof Error ? err.message : String(err),
          },
        });
        throw err;
      }
    },
  });
  return out.result;
}

function isRecipeResearchMiss(input: { usedWebSearch: boolean; researchText: string }): boolean {
  return (
    !input.usedWebSearch ||
    input.researchText.startsWith("NAO_ENCONTRADA") ||
    input.researchText.length < 30
  );
}

function recipeNotFoundResult(): RecipeParserOutput {
  return {
    isValidRecipe: false,
    reason: RECIPE_NOT_FOUND_REASON,
    name: null,
    ingredients: null,
    preparation: null,
    finishing: null,
  };
}
