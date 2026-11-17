import "server-only";
import { createHash } from "node:crypto";
import { speechAudioSeconds } from "@informach/ai-core/speech-audio";
import { transcribeAudio } from "@informach/ai-core/transcription";
import { z } from "zod";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { AGENDA_MODELS } from "@/ai/models";
import type { AgendaAuthority } from "@/features/family/authority";
import { env } from "@/lib/env";
import { openRouterAttributionHeaders } from "@/lib/openrouter";
import { type AiCostAcceptance, assertCostAcceptance, SPEECH_COST, speechCredits } from "./costs";
import { agendaAiOperations } from "./wallet-repository";
export type TranscribeAgendaInput = {
  actor: AgendaAuthority;
  profileId: string;
  audio: Blob;
  acceptedCost: AiCostAcceptance;
};
export async function transcribeAgendaAudio(
  input: TranscribeAgendaInput,
  kind: "subjects" | "activities",
) {
  assertCostAcceptance(input.acceptedCost, SPEECH_COST);
  const audio = new Uint8Array(await input.audio.arrayBuffer());
  const seconds = speechAudioSeconds(audio);
  const operations = await agendaAiOperations(input.actor, input.profileId);
  const feature =
    kind === "subjects" ? "agenda.subjects.transcribe_audio" : "agenda.activities.transcribe_audio";
  return operations.run({
    feature,
    model: AGENDA_MODELS[feature],
    recorder,
    agent: "transcribe-audio",
    tariff: SPEECH_COST.version,
    maxCredits: SPEECH_COST.maxCredits,
    inputHash: createHash("sha256").update(audio).digest("hex"),
    parseResult: (value) => z.object({ text: z.string().trim().min(1).max(16000) }).parse(value),
    call: async () => {
      if (!env.OPENROUTER_API_KEY) throw new Error("AI_DISABLED");
      const result = await transcribeAudio({
        apiKey: env.OPENROUTER_API_KEY,
        audio,
        format: "wav",
        model: AGENDA_MODELS[feature],
        headers: openRouterAttributionHeaders(),
        language: "pt",
        prompt:
          kind === "subjects"
            ? "Matérias escolares brasileiras e nomes de professores."
            : "Tarefas, provas, trabalhos, recados e lembretes escolares em português brasileiro.",
        temperature: 0,
        signal: AbortSignal.timeout(45000),
      });
      if (!result.text.trim() || result.text.length > 16000) throw new Error("TRANSCRIBE_FAILED");
      return {
        value: { text: result.text },
        actualCredits: speechCredits(seconds),
        usage: result.usage,
        metadata: {
          durationSeconds: seconds,
          providerCostUsd: result.costUsd ?? null,
          providerCostReported: result.costUsd !== undefined,
          provisionExceeded:
            result.costUsd === undefined
              ? null
              : result.costUsd * 6 * 1.3 > speechCredits(seconds) * 0.05,
        },
      };
    },
  });
}
