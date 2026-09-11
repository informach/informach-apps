import "server-only";
import { randomUUID } from "node:crypto";
import { runRecordedAiCall, withCredits } from "@informach/ai-core";
import { COZYA_PRICING_SEED } from "@informach/billing/seeds";
import { generateText } from "ai";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { withModelFallbacks } from "@/ai/fallbacks";
import { COZYA_MODELS } from "@/ai/models";
import { recipeParserSchema } from "@/ai/recipe-parser/schema";
import { billing } from "@/features/billing/service";
import { getOpenRouter } from "@/lib/openrouter";
import { NoRecipeResultError } from "./errors";
import { currentAiOperationId } from "./operation-context";
import { validateRecipeOutput } from "./recipe-output";
import { buildResearchPrompt } from "./research-recipe-prompt";
import { providerCostMetadata } from "./usage-metadata";

export type ResearchRecipeFromPromptInput = { userId: string; prompt: string };
export type ResearchRecipeFromPromptResult = ReturnType<typeof validateRecipeOutput>;
const FEATURE = "cozya.recipe.generate_from_prompt" as const;

export async function researchRecipeFromPrompt(
  input: ResearchRecipeFromPromptInput,
): Promise<ResearchRecipeFromPromptResult> {
  const model = COZYA_MODELS[FEATURE];
  const pricing = COZYA_PRICING_SEED.find((row) => row.feature === FEATURE && row.model === model);
  if (!pricing?.flatCost) throw new Error("Missing recipe research flat pricing");
  const out = await withCredits({
    billing,
    runId: currentAiOperationId(),
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: FEATURE,
    model,
    estimateCost: () => ({ estimatedAmount: pricing.flatCost ?? 1 }),
    computeActualCost: () => ({ actualAmount: pricing.flatCost ?? 1 }),
    call: ({ reservation }) => researchRecipeWithinReservation(input, reservation.id),
  });
  return out.result;
}

/** Internal stages share the caller's reservation, also when the input is audio. */
export async function researchRecipeWithinReservation(
  input: ResearchRecipeFromPromptInput,
  reservationId: string,
): Promise<ResearchRecipeFromPromptResult> {
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
          ...withModelFallbacks(model),
          extraBody: { ...withModelFallbacks(model).extraBody, max_tool_calls: 1 },
        }),
        tools: {
          web_search: openrouter.tools.webSearch({
            engine: "exa",
            maxResults: 5,
            searchPrompt: `Receita completa que corresponda exatamente a: ${input.prompt}. Confira todos os ingredientes, cobertura e características pedidos antes de escolher a fonte.`,
          }),
        },
        maxOutputTokens: 2200,
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
  if (!source || source.sourceType !== "url" || research.text.trim().startsWith("NAO_ENCONTRADA")) {
    throw new NoRecipeResultError(
      "Não encontrei uma receita com fonte verificável. Tente um pedido mais específico. Nenhum crédito foi consumido.",
    );
  }
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
      getMastra()
        .getAgent("recipeParser")
        .generate(
          JSON.stringify({ pedidoOriginal: input.prompt, conteudoDaFonte: research.text }),
          {
            runId: parseRunId,
            abortSignal: AbortSignal.timeout(90000),
            modelSettings: { maxOutputTokens: 3500, temperature: 0 },
            structuredOutput: { schema: recipeParserSchema, errorStrategy: "strict" },
          },
        ),
  });
  return {
    ...validateRecipeOutput(response.object),
    sourceUrl: source.url,
    sourceName: (source.title || new URL(source.url).hostname).slice(0, 200),
  };
}
