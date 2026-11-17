import "server-only";
import { randomUUID } from "node:crypto";
import { runRecordedAiCall } from "@informach/ai-core";
import { speechAudioSeconds } from "@informach/ai-core/speech-audio";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { COZYA_AI_COSTS, COZYA_AI_LIMITS, modelUsageUsd, usdToCredits } from "./costs";
import { NoRecipeResultError } from "./errors";
import { assertTextBudget, recipeGenerationOptions } from "./generation-budget";
import { validateRecipeOutput } from "./recipe-output";
import { researchRecipeWithinReservation } from "./research-recipe-from-prompt-service";
import { transcribeAudioWithinReservation } from "./transcribe-service";
import { providerCostMetadata } from "./usage-metadata";
import { runCozyaAiWorkflow } from "./workflow";

export async function recipeFromAudio(input: {
  userId: string;
  audio: Blob;
  mode: "recipe" | "research";
}) {
  speechAudioSeconds(new Uint8Array(await input.audio.arrayBuffer()));
  const feature =
    input.mode === "research" ? "cozya.recipe.generate_from_prompt" : "cozya.recipe.parse_voice";
  return runCozyaAiWorkflow({
    userId: input.userId,
    feature,
    agent: "audio-recipe",
    quote: input.mode === "research" ? COZYA_AI_COSTS.audioResearch : COZYA_AI_COSTS.audioRecipe,
    parseResult: validateRecipeOutput,
    call: async (reservationId) => {
      const { text, credits } = await transcribeAudioWithinReservation(input, reservationId);
      if (text.length > (input.mode === "research" ? 500 : 8000))
        throw new NoRecipeResultError(
          "O áudio ficou longo demais. Grave uma versão mais curta. Nenhum crédito foi consumido.",
        );
      if (input.mode === "research") {
        const output = await researchRecipeWithinReservation(
          { userId: input.userId, prompt: text },
          reservationId,
        );
        return { value: output.value, actualCredits: credits + usdToCredits(output.tariffUsd) };
      }
      assertTextBudget(text, COZYA_AI_LIMITS.textBytes);
      const runId = randomUUID();
      const { result } = await runRecordedAiCall({
        recorder,
        app: "cozya",
        agent: "recipeParser",
        runId,
        retry: false,
        metadata: {
          userId: input.userId,
          reservationId,
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
          getMastra().getAgent("recipeParser").generate(text, recipeGenerationOptions(runId)),
      });
      return {
        value: validateRecipeOutput(result.object),
        actualCredits: credits + usdToCredits(modelUsageUsd(COZYA_MODELS[feature], result.usage)),
      };
    },
  });
}
