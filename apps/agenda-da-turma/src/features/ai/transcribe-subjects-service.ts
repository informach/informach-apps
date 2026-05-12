import "server-only";

import { runBillableAiCall } from "@informach/ai-core";
import { transcribeAudio } from "@informach/ai-core/transcription";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { AGENDA_MODELS } from "@/ai/models";
import { billing } from "@/lib/billing";
import { env } from "@/lib/env";
import { openRouterAttributionHeaders } from "@/lib/openrouter";

export type TranscribeSubjectsAudioInput = {
  userId: string;
  audio: Blob;
};

export type TranscribeSubjectsAudioResult = {
  text: string;
};

const FEATURE = "agenda.subjects.transcribe_audio" as const;

// Cap do textPreview persistido em ai.agent_runs.metadata. Lista de matérias
// não é PII sensível, mas cortamos pra evitar payload grande no audit log
// quando o áudio é longo.
const TEXT_PREVIEW_MAX_CHARS = 100;

// Glossário pt-BR escolar passado como `prompt` ao decoder. Em
// `gpt-4o-transcribe` é texto livre (não keywords como no Whisper) — guia o
// decoder em palavras isoladas ambíguas. Roteado pelo helper via
// `provider.options.openai.prompt` (canal oficial do OpenRouter para
// parâmetros provider-específicos).
const SUBJECTS_TRANSCRIPTION_PROMPT =
  "Lista de matérias escolares brasileiras em português. Matérias comuns: " +
  "matemática, português, língua portuguesa, redação, literatura, inglês, " +
  "espanhol, ciências, biologia, física, química, história, geografia, " +
  "filosofia, sociologia, artes, educação física, ensino religioso, " +
  "geometria, álgebra, robótica, programação. Pode mencionar professor ou " +
  "professora associado à matéria.";

/**
 * Transcreve um áudio falado pelo usuário (que dita a lista de matérias da
 * turma) em texto. Cobra 1 crédito via reserve→commit/release. Pro gating e
 * rate limit são responsabilidade do route handler — o service confia que o
 * caller já enforced.
 *
 * Roteia pelo endpoint `/audio/transcriptions` OpenAI-compatible do
 * OpenRouter, modelo `openai/gpt-4o-transcribe` (GPT-4o family, não
 * Whisper — substancialmente melhor para palavras isoladas em pt-BR).
 * Glossário pt-BR escolar via `provider.options.openai.prompt` + temperatura
 * 0 para reduzir alucinação.
 *
 * Retorna o texto transcrito. Persiste `textPreview` (100 chars) +
 * `durationInSeconds` em `ai.agent_runs.metadata` para diagnóstico de
 * regressões de qualidade sem precisar reproduzir o áudio.
 */
export async function transcribeSubjectsAudio(
  input: TranscribeSubjectsAudioInput,
): Promise<TranscribeSubjectsAudioResult> {
  const out = await runBillableAiCall({
    billing,
    owner: { type: "user", id: input.userId },
    app: "agenda-da-turma",
    feature: FEATURE,
    model: AGENDA_MODELS[FEATURE],
    recorder,
    agent: "transcribe-audio",
    // STT no OpenRouter não devolve token usage; billing é flatCost: 1.
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
      // `withAiRouteGuards` no route handler já gateia OPENROUTER_API_KEY
      // ausente (503 AI_DISABLED), então chegando aqui a chave existe.
      const apiKey = env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error(
          "OPENROUTER_API_KEY is not configured. Route handler should have returned 503 AI_DISABLED.",
        );
      }
      return transcribeAudio({
        apiKey,
        audio: input.audio,
        // Sempre passar `model` explícito — alinha com `AGENDA_MODELS` e
        // impede regressão silenciosa se o default do package mudar.
        model: AGENDA_MODELS[FEATURE],
        headers: openRouterAttributionHeaders(),
        language: "pt",
        prompt: SUBJECTS_TRANSCRIPTION_PROMPT,
        temperature: 0,
      });
    },
  });
  return { text: out.result.text };
}
