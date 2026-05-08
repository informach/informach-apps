import "server-only";

import { withCredits, withRetry } from "@informach/ai-core";
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
  const out = await withCredits({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: FEATURE,
    model: COZYA_MODELS[FEATURE],
    estimateCost: () => ({ estimatedAmount: 1 }),
    computeActualCost: () => ({ actualAmount: 1 }),
    call: async ({ reservation }) => {
      await recorder.start({
        runId: reservation.id,
        app: "cozya",
        agent: "transcribe-audio",
      });
      try {
        const result = await withRetry(() =>
          transcribeAudio({
            apiKey: env.OPENROUTER_API_KEY,
            audio: input.audio,
            headers: openRouterAttributionHeaders(),
            language: "pt",
          }),
        );
        await recorder.finish({
          runId: reservation.id,
          status: "succeeded",
          // Whisper/OpenRouter STT doesn't expose token usage — billing fixes 1 credit/call.
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          ...(result.durationInSeconds === undefined
            ? {}
            : { metadata: { durationInSeconds: result.durationInSeconds } }),
        });
        return result;
      } catch (err) {
        await recorder.finish({
          runId: reservation.id,
          status: "failed",
          metadata: { error: err instanceof Error ? err.message : String(err) },
        });
        throw err;
      }
    },
  });
  return { text: out.result.text };
}
