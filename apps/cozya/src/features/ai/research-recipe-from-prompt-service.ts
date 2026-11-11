import "server-only";
import { randomUUID } from "node:crypto";
import { runRecordedAiCall } from "@informach/ai-core";
import { generateText } from "ai";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { cozyaModelPolicy } from "@/ai/provider-policy";
import { getOpenRouter } from "@/lib/openrouter";
import { COZYA_AI_COSTS, COZYA_AI_LIMITS, modelUsageUsd, usdToCredits } from "./costs";
import { NoRecipeResultError } from "./errors";
import { assertTextBudget, recipeGenerationOptions } from "./generation-budget";
import { validateRecipeOutput } from "./recipe-output";
import { buildResearchPrompt } from "./research-recipe-prompt";
import { providerCostMetadata } from "./usage-metadata";
import { runCozyaAiWorkflow } from "./workflow";

export type ResearchRecipeFromPromptInput = { userId: string; prompt: string };
export type ResearchRecipeFromPromptResult = ReturnType<typeof validateRecipeOutput>;
const FEATURE = "cozya.recipe.generate_from_prompt" as const;

export async function researchRecipeFromPrompt(
  input: ResearchRecipeFromPromptInput,
): Promise<ResearchRecipeFromPromptResult> {
  assertTextBudget(input.prompt, 2000);
  return runCozyaAiWorkflow({
    userId: input.userId,
    feature: FEATURE,
    agent: "recipeResearcher",
    quote: COZYA_AI_COSTS.research,
    parseResult: validateRecipeOutput,
    call: async (runId) => {
      const output = await researchRecipeWithinReservation(input, runId);
      return { value: output.value, actualCredits: usdToCredits(output.tariffUsd) };
    },
  });
}

/** Internal stages share the caller's reservation, also when the input is audio. */
export async function researchRecipeWithinReservation(
  input: ResearchRecipeFromPromptInput,
  reservationId: string,
) {
  assertTextBudget(input.prompt, 2000);
  assertTextBudget(buildResearchPrompt(input.prompt), COZYA_AI_LIMITS.textBytes);
  const openrouter = getOpenRouter();
  const model = COZYA_MODELS[FEATURE];
  const { result: research } = await runRecordedAiCall({
    recorder,
    app: "cozya",
    agent: "recipeResearcher",
    runId: randomUUID(),
    retry: false,
    getErrorMetadata: (error) => ({ error: error instanceof Error ? error.name : "UnknownError" }),
    metadata: { feature: FEATURE, model, reservationId, userId: input.userId, stage: "research" },
    getUsage: (result) => result.usage,
    getSuccessMetadata: (result) => ({
      ...providerCostMetadata(result.providerMetadata, result.usage),
      sourceCount: result.sources.length,
      webSearchStrategy: "openrouter_server_tool",
    }),
    call: () =>
      generateText({
        model: openrouter(model, {
          ...cozyaModelPolicy(model),
          extraBody: { max_tool_calls: 1 },
        }),
        tools: {
          web_search: openrouter.tools.webSearch({
            engine: "exa",
            maxResults: 5,
            searchPrompt: `Receita completa que corresponda exatamente a: ${input.prompt}. Confira todos os ingredientes, cobertura e características pedidos antes de escolher a fonte.`,
          }),
        },
        maxOutputTokens: COZYA_AI_LIMITS.researchOutputTokens,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(90000),
        prompt: buildResearchPrompt(input.prompt),
      }),
  });
  const sourceUrl = research.text.match(/^FONTE_URL:\s*(https?:\/\/\S+)/im)?.[1];
  const source = research.sources.find(
    (entry) => entry.sourceType === "url" && entry.url === sourceUrl,
  );
  // No citations, no trustworthy source association. Never charge a search miss.
  if (source?.sourceType !== "url" || research.text.trim().startsWith("NAO_ENCONTRADA")) {
    throw new NoRecipeResultError(
      "Não encontrei uma receita com fonte verificável. Tente um pedido mais específico. Nenhum crédito foi consumido.",
    );
  }
  const parseText = JSON.stringify({
    pedidoOriginal: input.prompt,
    conteudoDaFonte: research.text,
  });
  assertTextBudget(parseText, COZYA_AI_LIMITS.researchResultBytes);
  const parseRunId = randomUUID();
  const { result: response } = await runRecordedAiCall({
    recorder,
    app: "cozya",
    agent: "recipeParser",
    runId: parseRunId,
    retry: false,
    getErrorMetadata: (error) => ({ error: error instanceof Error ? error.name : "UnknownError" }),
    metadata: {
      feature: FEATURE,
      model: COZYA_MODELS["cozya.recipe.extract_from_text"],
      reservationId,
      userId: input.userId,
      stage: "structured_parse",
    },
    getUsage: (result) => result.usage,
    getSuccessMetadata: (result) => providerCostMetadata(result.providerMetadata, result.usage),
    call: () =>
      getMastra().getAgent("recipeParser").generate(parseText, recipeGenerationOptions(parseRunId)),
  });
  return {
    value: {
      ...validateRecipeOutput(response.object),
      sourceUrl: source.url,
      sourceName: (source.title || new URL(source.url).hostname).slice(0, 200),
    },
    tariffUsd:
      modelUsageUsd(model, research.usage) +
      COZYA_AI_LIMITS.searchUsd +
      modelUsageUsd(COZYA_MODELS["cozya.recipe.extract_from_text"], response.usage),
  };
}
