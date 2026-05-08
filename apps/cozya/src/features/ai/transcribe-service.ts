import "server-only";

import { runBillableAiCall } from "@informach/ai-core";
import { transcribeAudio } from "@informach/ai-core/transcription";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { COZYA_MODELS } from "@/ai/models";
import { billing } from "@/features/billing/service";
import { env } from "@/lib/env";
import { openRouterAttributionHeaders } from "@/lib/openrouter";

export type TranscribeRecipeAudioInput = {
  userId: string;
  audio: Blob;
};

export type TranscribeRecipeAudioResult = {
  text: string;
};

const FEATURE = "cozya.recipe.transcribe_audio" as const;

/**
 * Transcribes a recorded recipe-search utterance for the given user, billing
 * one Cozya credit via the standard reserve→commit/release flow. Pro gating
 * and rate limiting belong to the route handler — this service trusts the
 * caller has already enforced those.
 *
 * Routes Whisper through OpenRouter's OpenAI-compatible
 * `/audio/transcriptions` endpoint (model id `openai/whisper-1`). Same
 * gateway as the chat/vision flows; single billable account.
 */
export async function transcribeRecipeAudio(
  input: TranscribeRecipeAudioInput,
): Promise<TranscribeRecipeAudioResult> {
  const out = await runBillableAiCall({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: FEATURE,
    model: COZYA_MODELS[FEATURE],
    recorder,
    agent: "transcribe-audio",
    // Whisper/OpenRouter STT doesn't expose token usage — billing fixes 1 credit/call.
    getUsage: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
    getSuccessMetadata: (result) =>
      result.durationInSeconds === undefined
        ? undefined
        : { durationInSeconds: result.durationInSeconds },
    call: async () => {
      return transcribeAudio({
        apiKey: env.OPENROUTER_API_KEY,
        audio: input.audio,
        headers: openRouterAttributionHeaders(),
        language: "pt",
      });
    },
  });
  return { text: out.result.text };
}
