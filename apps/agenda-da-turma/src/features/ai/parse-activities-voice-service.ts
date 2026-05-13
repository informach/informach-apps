import "server-only";

import { runBillableAgentCall } from "@informach/ai-core";
import { getMastra } from "@/ai";
import {
  buildUserMessage,
  type EnrichedParseResult,
  enrichWithResolvedTurma,
} from "@/ai/activities-parser/enrich";
import { type ActivitiesParserOutput, activitiesParserSchema } from "@/ai/activities-parser/schema";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { AGENDA_MODELS } from "@/ai/models";
import { listTurmasWithSubjectsForUserForm } from "@/features/activities/repository";
import { findStudentProfilesByUser } from "@/features/students/repository";
import { billing } from "@/lib/billing";

export type ParseActivitiesFromVoiceInput = {
  userId: string;
  transcript: string;
};

export type ParseActivitiesFromVoiceResult = EnrichedParseResult;

const FEATURE = "agenda.activities.parse_voice" as const;

type ActivitiesAgentResponse = {
  object: unknown;
  usage?: unknown;
};

/**
 * Estrutura uma transcrição em texto livre numa ou mais atividades.
 * Carrega perfis E turmas+matérias do usuário e:
 *   1. Injeta a lista de nomes E o bloco de matérias por turma no
 *      user-message (a IA usa pra preencher `studentNameHint` e
 *      `subjectHint` apenas com valores válidos).
 *   2. Pós-IA, resolve cascade `studentNameHint → activeTurmaId | subjectHint
 *      cross-turma único` por atividade.
 *   3. Calcula `guessedTurmaId` (turma "vencedora" do batch) para alimentar
 *      o passo intermediário de confirmação no client.
 *
 * Cobra 1 crédito. Pro gating e rate limit ficam no route handler.
 */
export async function parseActivitiesFromVoice(
  input: ParseActivitiesFromVoiceInput,
): Promise<ParseActivitiesFromVoiceResult> {
  const [profiles, turmasWithSubjects] = await Promise.all([
    findStudentProfilesByUser(input.userId),
    listTurmasWithSubjectsForUserForm(input.userId),
  ]);

  const userMessage = buildUserMessage({
    transcript: input.transcript,
    studentNames: profiles.map((p) => p.name),
    turmasWithSubjects,
    profiles,
  });

  const out = await runBillableAgentCall<ActivitiesAgentResponse>({
    billing,
    owner: { type: "user", id: input.userId },
    app: "agenda-da-turma",
    feature: FEATURE,
    model: AGENDA_MODELS[FEATURE],
    recorder,
    agent: "activitiesParser",
    getUsage: (response) => response.usage,
    call: async ({ runId }) => {
      const mastra = getMastra();
      const response = await mastra.getAgent("activitiesParser").generate(userMessage, {
        runId,
        structuredOutput: {
          schema: activitiesParserSchema,
          errorStrategy: "strict",
        },
      });
      return response;
    },
  });

  const parsed = out.result.object as ActivitiesParserOutput;
  return enrichWithResolvedTurma(parsed, profiles, turmasWithSubjects);
}
