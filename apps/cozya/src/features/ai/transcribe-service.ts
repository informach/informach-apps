import "server-only";

import { withCredits } from "@informach/ai-core";
import { transcribeAudio } from "@informach/ai-core/transcription";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { billing } from "@/features/billing/service";
import { env } from "@/lib/env";

export type TranscribeRecipeAudioInput = {
  userId: string;
  audio: Blob;
};

export type TranscribeRecipeAudioResult = {
  text: string;
  durationInSeconds?: number;
};

/**
 * Transcribes a recorded recipe-search utterance for the given user, billing
 * one Cozya credit via the standard reserve→commit/release flow. Pro gating
 * and rate limiting belong to the route handler — this service trusts the
 * caller has already enforced those.
 */
export async function transcribeRecipeAudio(
  input: TranscribeRecipeAudioInput,
): Promise<TranscribeRecipeAudioResult> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const out = await withCredits({
    billing,
    owner: { type: "user", id: input.userId },
    app: "cozya",
    feature: "cozya.recipe.transcribe_audio",
    model: "whisper-1",
    estimateCost: () => ({ estimatedAmount: 1 }),
    computeActualCost: () => ({ actualAmount: 1 }),
    call: async ({ reservation }) => {
      await recorder.start({
        runId: reservation.id,
        app: "cozya",
        agent: "transcribe-audio",
      });
      try {
        const result = await transcribeAudio({
          openaiApiKey: env.OPENAI_API_KEY ?? "",
          audio: input.audio,
          language: "pt",
        });
        await recorder.finish({
          runId: reservation.id,
          status: "succeeded",
          // Whisper API doesn't expose token usage — billing fixes 1 credit/call.
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          ...(result.durationInSeconds
            ? { metadata: { durationInSeconds: result.durationInSeconds } }
            : {}),
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
  return {
    text: out.result.text,
    ...(out.result.durationInSeconds ? { durationInSeconds: out.result.durationInSeconds } : {}),
  };
}
