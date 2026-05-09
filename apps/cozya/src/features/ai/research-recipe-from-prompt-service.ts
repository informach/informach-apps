import "server-only";

import { randomUUID } from "node:crypto";
import { runRecordedAiCall, withCredits } from "@informach/ai-core";
import { COZYA_PRICING_SEED } from "@informach/billing/seeds";
import { generateText } from "ai";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { withModelFallbacks } from "@/ai/fallbacks";
import { COZYA_MODELS } from "@/ai/models";
import { type RecipeParserOutput, recipeParserSchema } from "@/ai/recipe-parser/schema";
import { cozyaThreadId } from "@/ai/working-memory";
import { billing } from "@/features/billing/service";
import { getOpenRouter } from "@/lib/openrouter";
import { buildResearchPrompt } from "./research-recipe-prompt";

export type ResearchRecipeFromPromptInput = {
  userId: string;
  prompt: string;
};

export type ResearchRecipeFromPromptResult = RecipeParserOutput;

const FEATURE = "cozya.recipe.generate_from_prompt" as const;
const WEB_SEARCH_PLUGIN = { id: "web" as const, max_results: 5 };

/**
 * Pulls the per-call cost from the same `COZYA_PRICING_SEED` that primes
 * `billing.credit_pricing` (single source of truth — see
 * `apps/cozya/CLAUDE.md` §6 and `packages/billing/CLAUDE.md` §5.5).
 *
 * Multi-stage flows like this one (research + structured parse) reuse the
 * single `withCredits` reservation so the user is charged once per top-level
 * call. `runBillableAiCall` in single-stage services defaults to 1 credit, but
 * `withCredits` requires explicit cost callbacks — pinning to the seed keeps
 * both paths in lockstep without a DB round-trip on every call.
 */
function resolveFlatCost(feature: string, model: string): number {
  const row = COZYA_PRICING_SEED.find((r) => r.feature === feature && r.model === model);
  if (!row) {
    throw new Error(
      `@informach/cozya: missing COZYA_PRICING_SEED entry for ${feature} (${model}). ` +
        `Add a row in packages/billing/src/seeds/credit-pricing.ts before deploying.`,
    );
  }
  return row.flatCost ?? 1;
}

const RECIPE_NOT_FOUND_REASON =
  "Não encontrei uma receita popular pra esse pedido. Tente algo mais específico.";

export async function researchRecipeFromPrompt(
  input: ResearchRecipeFromPromptInput,
): Promise<ResearchRecipeFromPromptResult> {
  const openrouter = getOpenRouter();
  const researchModelId = COZYA_MODELS[FEATURE];
  const flatCost = resolveFlatCost(FEATURE, researchModelId);

  const out = await withCredits({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: FEATURE,
    model: researchModelId,
    estimateCost: () => ({ estimatedAmount: flatCost }),
    computeActualCost: () => ({ actualAmount: flatCost }),
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
          const usedWebSearch = true;
          const searchMiss = isRecipeResearchMiss({ usedWebSearch, researchText });
          return {
            outcome: searchMiss ? "not_found" : "research_found",
            usedWebSearch,
            webSearchStrategy: "openrouter_plugin",
          };
        },
        call: async () =>
          generateText({
            // Fallback embutido via `extraBody.models` — quando o primário cai,
            // OpenRouter tenta o próximo modelo da lista (cobra só o que respondeu).
            model: openrouter(researchModelId, {
              ...withModelFallbacks(researchModelId),
              // The current OpenRouter server tool lets the model decide whether
              // to search. This flow requires one grounded web lookup, so use the
              // still-supported plugin path that runs search once per request.
              plugins: [WEB_SEARCH_PLUGIN],
            }),
            prompt: buildResearchPrompt(input.prompt),
          }),
      });

      const researchText = research.text.trim();
      // The OpenRouter web plugin runs one search per request; once the call
      // succeeds, a short/NAO_ENCONTRADA answer is the only miss condition.
      const usedWebSearch = true;
      const searchMiss = isRecipeResearchMiss({ usedWebSearch, researchText });
      if (searchMiss) {
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
        call: async () => {
          const mastra = await getMastra();
          return mastra.getAgent("recipeParser").generate(researchText, {
            runId: parseRunId,
            memory: {
              thread: cozyaThreadId(input.userId, "generate_from_prompt"),
              resource: input.userId,
            },
            structuredOutput: {
              schema: recipeParserSchema,
              errorStrategy: "strict",
            },
          });
        },
      });
      return response.object as RecipeParserOutput;
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
