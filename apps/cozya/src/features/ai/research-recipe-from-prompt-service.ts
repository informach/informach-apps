import "server-only";

import { randomUUID } from "node:crypto";
import { runRecordedAiCall, withCredits } from "@informach/ai-core";
import { generateText } from "ai";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { withModelFallbacks } from "@/ai/fallbacks";
import { COZYA_MODELS } from "@/ai/models";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { cozyaThreadId } from "@/ai/working-memory";
import { billing } from "@/features/billing/service";
import { logger } from "@/lib/logger";
import { getOpenRouter } from "@/lib/openrouter";
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
      const researchRunId = randomUUID();
      const { result: research } = await runRecordedAiCall({
        recorder,
        app: "cozya",
        agent: "recipeResearcher",
        runId: researchRunId,
        metadata: {
          feature: FEATURE,
          model: researchModelId,
          reservationId: reservation.id,
          stage: "research",
        },
        getUsage: (result) => result.usage,
        getSuccessMetadata: (result) => {
          const researchText = result.text.trim();
          const usedWebSearch = didUseWebSearch(result);
          const searchMiss = isRecipeResearchMiss({ usedWebSearch, researchText });
          return {
            outcome: searchMiss ? "not_found" : "research_found",
            usedWebSearch,
          };
        },
        call: async () =>
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
      });

      const researchText = research.text.trim();
      // Fail closed: se o modelo respondeu sem chamar `web_search`, tratamos
      // a resposta como alucinação.
      const usedWebSearch = didUseWebSearch(research);
      const searchMiss = isRecipeResearchMiss({ usedWebSearch, researchText });
      if (searchMiss) {
        // Caso "modelo respondeu texto plausível mas não chamou a tool" é o
        // mais perigoso (regressão silenciosa do tool-calling no SDK). Loga
        // estruturado para alarme antes do usuário reclamar.
        if (!usedWebSearch && researchText.length >= 30) {
          logger.warn(
            {
              runId: researchRunId,
              reservationId: reservation.id,
              model: researchModelId,
              textLength: researchText.length,
            },
            "cozya.research.web_search_skipped_with_content",
          );
        }
        return recipeNotFoundResult();
      }

      // Step 2 — estrutura. Reusa o `recipeParser`, que já tem instruções
      // para "texto colado de um site".
      const parseRunId = randomUUID();
      const { result: response } = await runRecordedAiCall({
        recorder,
        app: "cozya",
        agent: "recipeParser",
        runId: parseRunId,
        metadata: {
          feature: FEATURE,
          model: COZYA_MODELS["cozya.recipe.extract_from_text"],
          reservationId: reservation.id,
          stage: "structured_parse",
        },
        getUsage: (result) => result.usage,
        getSuccessMetadata: () => ({ outcome: "parsed" }),
        call: async () =>
          getMastra()
            .getAgent("recipeParser")
            .generate(researchText, {
              runId: parseRunId,
              memory: {
                thread: cozyaThreadId(input.userId, "generate_from_prompt"),
                resource: input.userId,
              },
              structuredOutput: {
                schema: recipeParserSchema,
                errorStrategy: "strict",
              },
            }),
      });
      return response.object as RecipeParserOutput;
    },
  });
  return out.result;
}

function didUseWebSearch(result: { steps?: unknown }): boolean {
  return (
    Array.isArray(result.steps) &&
    result.steps.some(
      (step) =>
        typeof step === "object" &&
        step !== null &&
        Array.isArray((step as { toolCalls?: unknown }).toolCalls) &&
        (step as { toolCalls: Array<{ toolName?: unknown }> }).toolCalls.some(
          (call) => call?.toolName === "web_search",
        ),
    )
  );
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
