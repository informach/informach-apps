import "server-only";
import { randomUUID } from "node:crypto";
import { runRecordedAiCall, withCredits } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { recipeParserSchema } from "@/ai/recipe-parser/schema";
import { billing } from "@/features/billing/service";
import { NoRecipeResultError } from "./errors";
import { currentAiOperationId } from "./operation-context";
import { validateRecipeOutput } from "./recipe-output";
import { researchRecipeWithinReservation } from "./research-recipe-from-prompt-service";
import { transcribeAudioWithinReservation } from "./transcribe-service";
import { providerCostMetadata } from "./usage-metadata";

export async function recipeFromAudio(input: {
  userId: string;
  audio: Blob;
  mode: "recipe" | "research";
}) {
  const feature =
    input.mode === "research" ? "cozya.recipe.generate_from_prompt" : "cozya.recipe.parse_voice";
  const out = await withCredits({
    billing,
    runId: currentAiOperationId(),
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature,
    model: COZYA_MODELS[feature],
    estimateCost: () => ({ estimatedAmount: 1 }),
    computeActualCost: () => ({ actualAmount: 1 }),
    call: async ({ reservation }) => {
      const { text } = await transcribeAudioWithinReservation(input, reservation.id);
      if (text.length > (input.mode === "research" ? 500 : 8000))
        throw new NoRecipeResultError(
          "O áudio ficou longo demais para esta tarefa. Grave uma versão mais curta. Nenhum crédito foi consumido.",
        );
      if (input.mode === "research")
        return researchRecipeWithinReservation(
          { userId: input.userId, prompt: text },
          reservation.id,
        );
      const runId = randomUUID();
      const { result } = await runRecordedAiCall({
        recorder,
        app: "cozya",
        agent: "recipeParser",
        runId,
        retry: false,
        metadata: {
          userId: input.userId,
          reservationId: reservation.id,
          feature,
          model: COZYA_MODELS[feature],
          stage: "structured_parse",
        },
        getUsage: (response) => response.usage,
        getSuccessMetadata: (response) =>
          providerCostMetadata(response.providerMetadata, response.usage),
        getErrorMetadata: (error) => ({
          error: error instanceof Error ? error.name : "UnknownError",
        }),
        call: () =>
          getMastra()
            .getAgent("recipeParser")
            .generate(text, {
              runId,
              abortSignal: AbortSignal.timeout(90000),
              modelSettings: { maxOutputTokens: 3500, temperature: 0 },
              structuredOutput: { schema: recipeParserSchema, errorStrategy: "strict" },
            }),
      });
      return validateRecipeOutput(result.object);
    },
  });
  return out.result;
}
