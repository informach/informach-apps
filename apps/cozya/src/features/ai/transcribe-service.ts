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

// Glossário pt-BR culinário passado como `prompt` ao Whisper. Cabe nos
// ~244 tokens limite — guia o decoder em palavras isoladas e ambíguas
// ("alho", "pão", "ovo") onde whisper-large-v3 tende a alucinar sem contexto.
const RECIPE_TRANSCRIPTION_PROMPT =
  "Receita brasileira em português. Ingredientes e pratos comuns: " +
  "frango, arroz, feijão, ovo, leite, queijo, manteiga, azeite, sal, " +
  "açúcar, tomate, cebola, alho, batata, cenoura, abobrinha, beterraba, " +
  "alface, couve, espinafre, peixe, atum, carne moída, alcatra, costela, " +
  "linguiça, bacon, lasanha, macarrão, espaguete, nhoque, pão, pão de queijo, " +
  "bolo, torta, brigadeiro, beijinho, pudim, mousse, coxinha, pastel, " +
  "feijoada, moqueca, virado, baião, farofa, salada, sopa, caldo, " +
  "fubá, mandioca, batata-doce, abacate, banana, manga, maçã.";

/**
 * Transcribes a recorded recipe-search utterance for the given user, billing
 * one Cozya credit via the standard reserve→commit/release flow. Pro gating
 * and rate limiting belong to the route handler — this service trusts the
 * caller has already enforced those.
 *
 * Routes Whisper through OpenRouter's OpenAI-compatible
 * `/audio/transcriptions` endpoint (model id `openai/whisper-large-v3`).
 * Same gateway as the chat/vision flows; single billable account. A
 * pt-BR culinary glossary is passed as `prompt` to anchor the decoder on
 * common ingredient/dish names — critical for single-word utterances.
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
        prompt: RECIPE_TRANSCRIPTION_PROMPT,
      });
    },
  });
  return { text: out.result.text };
}
