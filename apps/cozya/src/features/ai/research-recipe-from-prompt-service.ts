import "server-only";

import { withCredits, withRetry } from "@informach/ai-core";
import { generateText } from "ai";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { withModelFallbacks } from "@/ai/fallbacks";
import { COZYA_MODELS } from "@/ai/models";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { billing } from "@/features/billing/service";
import { logger } from "@/lib/logger";
import { getOpenRouter } from "@/lib/openrouter";
import { normalizeUsage } from "./_shared";
import { buildResearchPrompt } from "./research-recipe-prompt";

export type ResearchRecipeFromPromptInput = {
  userId: string;
  prompt: string;
};

export type ResearchRecipeFromPromptResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.generate_from_prompt" as const;

const RECIPE_NOT_FOUND_REASON =
  "Não encontrei uma receita popular pra esse pedido. Tente algo mais específico.";

export async function researchRecipeFromPrompt(
  input: ResearchRecipeFromPromptInput,
): Promise<ResearchRecipeFromPromptResult> {
  const openrouter = getOpenRouter();
  const researchModelId = COZYA_MODELS[FEATURE];

  const out = await withCredits({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: FEATURE,
    model: researchModelId,
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
        const research = await withRetry(() =>
          generateText({
            // Fallback embutido via `extraBody.models` — quando o primário cai,
            // OpenRouter tenta o próximo modelo da lista (cobra só o que respondeu).
            model: openrouter(researchModelId, withModelFallbacks(researchModelId)),
            tools: {
              web_search: openrouter.tools.webSearch({
                maxResults: 5,
                engine: "auto",
              }),
            },
            toolChoice: "auto",
            prompt: buildResearchPrompt(input.prompt),
          }),
        );
        researchText = research.text.trim();
        // Fail closed: se o modelo respondeu sem chamar `web_search`, tratamos
        // a resposta como alucinação. Checagem positiva (Array.isArray antes
        // de `.some`) — assim o guard não passa silenciosamente quando o shape
        // do `ai` SDK mudar (ex.: ausência de `steps`/`toolCalls`).
        usedWebSearch =
          Array.isArray(research.steps) &&
          research.steps.some(
            (step) =>
              Array.isArray(step.toolCalls) &&
              step.toolCalls.some((call) => call?.toolName === "web_search"),
          );
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
          // Caso "modelo respondeu texto plausível mas não chamou a tool" é o
          // mais perigoso (regressão silenciosa do tool-calling no SDK). Loga
          // estruturado para alarme antes do usuário reclamar.
          if (!usedWebSearch && researchText.length >= 30) {
            logger.warn(
              { runId: reservation.id, model: researchModelId, textLength: researchText.length },
              "cozya.research.web_search_skipped_with_content",
            );
          }
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
        const response = await withRetry(() =>
          getMastra()
            .getAgent("recipeParser")
            .generate(researchText, {
              runId: reservation.id,
              structuredOutput: {
                schema: recipeParserSchema,
                errorStrategy: "strict",
              },
            }),
        );
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
