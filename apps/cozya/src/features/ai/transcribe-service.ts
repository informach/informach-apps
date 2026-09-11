import "server-only";
import { randomUUID } from "node:crypto";
import { runRecordedAiCall, withCredits } from "@informach/ai-core";
import { transcribeAudio } from "@informach/ai-core/transcription";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { billing } from "@/features/billing/service";
import { env } from "@/lib/env";
import { openRouterAttributionHeaders } from "@/lib/openrouter";
import { NoRecipeResultError } from "./errors";
import { currentAiOperationId } from "./operation-context";

export type TranscribeRecipeAudioInput = { userId: string; audio: Blob };
export type TranscribeRecipeAudioResult = { text: string };
const FEATURE = "cozya.recipe.transcribe_audio" as const;
const RECIPE_TRANSCRIPTION_PROMPT =
  "Receita brasileira em português. Ingredientes: frango, arroz, feijão, ovo, leite, queijo, manteiga, azeite, sal, açúcar, tomate, cebola, alho, farinha, fubá, mandioca. Preserve as quantidades e unidades faladas.";

/** Standalone transcription (saved-recipe voice search): explicitly costs one credit. */
export async function transcribeRecipeAudio(
  input: TranscribeRecipeAudioInput,
): Promise<TranscribeRecipeAudioResult> {
  const out = await withCredits({
    billing,
    runId: currentAiOperationId(),
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: FEATURE,
    model: COZYA_MODELS[FEATURE],
    estimateCost: () => ({ estimatedAmount: 1 }),
    computeActualCost: () => ({ actualAmount: 1 }),
    call: ({ reservation }) => transcribeAudioWithinReservation(input, reservation.id),
  });
  return out.result;
}

/** Internal stage: never reserves or charges independently of the enclosing task. */
export async function transcribeAudioWithinReservation(
  input: TranscribeRecipeAudioInput,
  reservationId: string,
): Promise<TranscribeRecipeAudioResult> {
  const { result } = await runRecordedAiCall({
    recorder,
    app: "cozya",
    agent: "transcribe-audio",
    runId: randomUUID(),
    retry: false,
    metadata: {
      userId: input.userId,
      reservationId,
      feature: FEATURE,
      model: COZYA_MODELS[FEATURE],
      stage: "transcribe",
    },
    getUsage: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
    getSuccessMetadata: (response) =>
      response.durationInSeconds === undefined
        ? undefined
        : { durationInSeconds: response.durationInSeconds },
    getErrorMetadata: (error) => ({ error: error instanceof Error ? error.name : "UnknownError" }),
    call: () =>
      transcribeAudio({
        apiKey: env.OPENROUTER_API_KEY,
        audio: input.audio,
        model: COZYA_MODELS[FEATURE],
        headers: openRouterAttributionHeaders(),
        language: "pt",
        prompt: RECIPE_TRANSCRIPTION_PROMPT,
        temperature: 0,
      }),
  });
  if (!result.text.trim())
    throw new NoRecipeResultError("Não consegui ouvir o áudio. Nenhum crédito foi consumido.");
  return { text: result.text.trim() };
}
