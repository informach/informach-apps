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

// Limite do textPreview persistido em ai.agent_runs.metadata. Receita não é
// PII sensível mas cap'amos para evitar payload grande no audit log e
// minimizar superfície caso o usuário grave algo fora de contexto por
// engano (ex.: conversa de fundo).
const TEXT_PREVIEW_MAX_CHARS = 100;

// Glossário pt-BR culinário passado como `prompt`. Em `gpt-4o-transcribe` é
// texto livre (não keywords como no Whisper) — guia o decoder em palavras
// isoladas e ambíguas ("torta", "alho", "pão", "ovo") onde modelos STT
// genéricos tendem a alucinar sem contexto. Roteado pelo helper via
// `provider.options.openai.prompt` (canal oficial do OpenRouter para
// parâmetros provider-específicos).
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
 * Routes through OpenRouter's OpenAI-compatible `/audio/transcriptions`
 * endpoint (model id `openai/gpt-4o-transcribe` — GPT-4o family, not
 * Whisper; substantially better for short clips and single-word utterances
 * in pt-BR). Same gateway as the chat/vision flows; single billable
 * account. A pt-BR culinary glossary is passed as `prompt` (routed via
 * `provider.options.openai.prompt`) to anchor the decoder on common
 * ingredient/dish names. Temperature is forced to 0 to reduce variability.
 *
 * Returns the transcribed text plus a 100-char `textPreview` persisted in
 * `ai.agent_runs.metadata` for downstream diagnosis (regressions in
 * accuracy show up there without needing to re-trigger the failing case).
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
    // OpenRouter STT doesn't expose token usage here — billing fixes 1 credit/call.
    getUsage: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
    getSuccessMetadata: (result) => {
      const textPreview = result.text.trim().slice(0, TEXT_PREVIEW_MAX_CHARS);
      const metadata: Record<string, unknown> = {};
      if (result.durationInSeconds !== undefined) {
        metadata.durationInSeconds = result.durationInSeconds;
      }
      if (textPreview) metadata.textPreview = textPreview;
      return Object.keys(metadata).length > 0 ? metadata : undefined;
    },
    call: async () => {
      return transcribeAudio({
        apiKey: env.OPENROUTER_API_KEY,
        audio: input.audio,
        headers: openRouterAttributionHeaders(),
        language: "pt",
        prompt: RECIPE_TRANSCRIPTION_PROMPT,
        temperature: 0,
      });
    },
  });
  return { text: out.result.text };
}
