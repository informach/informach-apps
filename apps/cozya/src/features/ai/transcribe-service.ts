import "server-only";
import { randomUUID } from "node:crypto";
import { runRecordedAiCall } from "@informach/ai-core";
import { speechAudioSeconds } from "@informach/ai-core/speech-audio";
import { transcribeAudio } from "@informach/ai-core/transcription";
import { z } from "zod";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { env } from "@/lib/env";
import { openRouterAttributionHeaders } from "@/lib/openrouter";
import { COZYA_AI_COSTS, speechCredits } from "./costs";
import { NoRecipeResultError } from "./errors";
import { runCozyaAiWorkflow } from "./workflow";

export type TranscribeRecipeAudioInput = { userId: string; audio: Blob };
export type TranscribeRecipeAudioResult = { text: string };
const FEATURE = "cozya.recipe.transcribe_audio" as const;
const RECIPE_TRANSCRIPTION_PROMPT =
  "Receita brasileira em português. Ingredientes: frango, arroz, feijão, ovo, leite, queijo, manteiga, azeite, sal, açúcar, tomate, cebola, alho, farinha, fubá, mandioca. Preserve as quantidades e unidades faladas.";

const speechResultSchema = z.object({ text: z.string().trim().min(1).max(16000) });

/** The duration tariff is explicit and includes at most two minutes. */
export async function transcribeRecipeAudio(
  input: TranscribeRecipeAudioInput,
): Promise<TranscribeRecipeAudioResult> {
  speechAudioSeconds(new Uint8Array(await input.audio.arrayBuffer()));
  return runCozyaAiWorkflow({
    userId: input.userId,
    feature: FEATURE,
    agent: "transcribe-audio",
    quote: COZYA_AI_COSTS.speech,
    parseResult: (value) => speechResultSchema.parse(value),
    call: async (runId) => {
      const result = await transcribeAudioWithinReservation(input, runId);
      return { value: { text: result.text }, actualCredits: result.credits };
    },
  });
}

/** Internal stage: never reserves or charges independently of the enclosing task. */
export async function transcribeAudioWithinReservation(
  input: TranscribeRecipeAudioInput,
  reservationId: string,
) {
  const seconds = speechAudioSeconds(new Uint8Array(await input.audio.arrayBuffer()));
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
    getUsage: (response) => response.usage,
    getSuccessMetadata: (response) => ({
      durationInSeconds: seconds,
      ...(response.costUsd === undefined ? {} : { providerCostUsd: response.costUsd }),
    }),
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
  return { ...speechResultSchema.parse({ text: result.text }), credits: speechCredits(seconds) };
}
