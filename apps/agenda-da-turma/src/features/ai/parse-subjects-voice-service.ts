import "server-only";

import { runBillableAgentCall } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { AGENDA_MODELS } from "@/ai/models";
import { type SubjectsParserOutput, subjectsParserSchema } from "@/ai/subjects-parser/schema";
import { billing } from "@/lib/billing";

export type ParseSubjectsFromVoiceInput = {
  userId: string;
  transcript: string;
};

export type ParseSubjectsFromVoiceResult = SubjectsParserOutput;

const FEATURE = "agenda.subjects.parse_voice" as const;

type SubjectsAgentResponse = {
  object: unknown;
  usage?: unknown;
};

/**
 * Estrutura uma transcrição em texto livre (vinda de
 * `transcribeSubjectsAudio`) numa lista validada de matérias. Cobra 1
 * crédito. Pro gating e rate limit ficam no route handler.
 *
 * Sem `memory` (extração one-shot — não conversa).
 */
export async function parseSubjectsFromVoice(
  input: ParseSubjectsFromVoiceInput,
): Promise<ParseSubjectsFromVoiceResult> {
  const out = await runBillableAgentCall<SubjectsAgentResponse>({
    billing,
    owner: { type: "user", id: input.userId },
    app: "agenda-da-turma",
    feature: FEATURE,
    model: AGENDA_MODELS[FEATURE],
    recorder,
    agent: "subjectsParser",
    getUsage: (response) => response.usage,
    call: async ({ runId }) => {
      const mastra = getMastra();
      const response = await mastra.getAgent("subjectsParser").generate(input.transcript, {
        runId,
        structuredOutput: {
          schema: subjectsParserSchema,
          errorStrategy: "strict",
        },
      });
      return response;
    },
  });
  return out.result.object as SubjectsParserOutput;
}
