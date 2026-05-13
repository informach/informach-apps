import "server-only";

import { runBillableAiCall } from "@informach/ai-core";
import { transcribeAudio } from "@informach/ai-core/transcription";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { AGENDA_MODELS } from "@/ai/models";
import { billing } from "@/lib/billing";
import { env } from "@/lib/env";
import { openRouterAttributionHeaders } from "@/lib/openrouter";

export type TranscribeActivitiesAudioInput = {
  userId: string;
  audio: Blob;
};

export type TranscribeActivitiesAudioResult = {
  text: string;
};

const FEATURE = "agenda.activities.transcribe_audio" as const;

// Cap do textPreview persistido em ai.agent_runs.metadata. Atividade não é PII
// sensível mas pode mencionar nome de filho/professor — capamos para evitar
// payload grande no audit log e exposição desnecessária.
const TEXT_PREVIEW_MAX_CHARS = 100;

// Glossário pt-BR de atividade escolar passado como `prompt` ao decoder.
// Em `gpt-4o-transcribe` é texto livre (não keywords) — guia o decoder em
// palavras ambíguas. Roteado via `provider.options.openai.prompt` no helper.
const ACTIVITIES_TRANSCRIPTION_PROMPT =
  "Lista de tarefas, provas, trabalhos e lembretes escolares brasileiros em português. " +
  "Termos comuns: tarefa, lição, dever de casa, exercício, prova, avaliação, teste, " +
  "simulado, trabalho, projeto, redação, apresentação, seminário, entrega, lembrete, " +
  "recado, página, capítulo, livro, caderno, régua, esquadro, calculadora, em dupla, " +
  "em grupo, individual. Dias da semana: segunda, terça, quarta, quinta, sexta, sábado, " +
  "domingo. Datas relativas: hoje, amanhã, depois de amanhã, próxima semana, semana que " +
  "vem, fim de semana. Pode mencionar nome do filho, professor ou matéria escolar.";

/**
 * Transcreve um áudio onde o responsável ditou uma ou mais atividades
 * escolares. Cobra 1 crédito via reserve→commit/release. Pro gating + rate
 * limit ficam no route handler.
 *
 * Roteia pelo `/audio/transcriptions` do OpenRouter, modelo
 * `openai/gpt-4o-transcribe` (GPT-4o family — melhor que Whisper para
 * palavras isoladas/dias da semana em pt-BR). Glossário via
 * `provider.options.openai.prompt` + temperatura 0 pra reduzir alucinação.
 *
 * Persiste `textPreview` (100 chars) + `durationInSeconds` em
 * `ai.agent_runs.metadata` para diagnóstico sem precisar reproduzir o áudio.
 */
export async function transcribeActivitiesAudio(
  input: TranscribeActivitiesAudioInput,
): Promise<TranscribeActivitiesAudioResult> {
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
      const apiKey = env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error(
          "OPENROUTER_API_KEY is not configured. Route handler should have returned 503 AI_DISABLED.",
        );
      }
      return transcribeAudio({
        apiKey,
        audio: input.audio,
        model: AGENDA_MODELS[FEATURE],
        headers: openRouterAttributionHeaders(),
        language: "pt",
        prompt: ACTIVITIES_TRANSCRIPTION_PROMPT,
        temperature: 0,
      });
    },
  });
  return { text: out.result.text };
}
