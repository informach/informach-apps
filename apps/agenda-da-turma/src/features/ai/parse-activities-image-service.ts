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
import { findStudentProfilesByUser } from "@/features/students/repository";
import { billing } from "@/lib/billing";

export type ParseActivitiesFromImageInput = {
  userId: string;
  /** Data URL no formato `data:image/{jpeg|png|webp};base64,...`. */
  imageDataUrl: string;
};

export type ParseActivitiesFromImageResult = EnrichedParseResult;

const FEATURE = "agenda.activities.parse_image" as const;

type ActivitiesAgentResponse = {
  object: unknown;
  usage?: unknown;
};

const IMAGE_INSTRUCTION =
  "Extraia as atividades escolares descritas nesta imagem (foto de caderno, " +
  "agenda do aluno, recado da escola, print de mensagem). Para cada atividade, " +
  "preencha os campos do schema. Se a imagem trouxer datas, resolva relativas ao " +
  "'hoje' informado no cabeçalho do conteúdo.";

/**
 * Estrutura uma imagem (foto/print/caderno) numa ou mais atividades.
 * Mesma estratégia do fluxo de voz: injeta lista de estudantes no
 * user-message multimodal, agente vision (`activitiesParserVision` com
 * `openai/gpt-4o` + `imageDetail: "low"`) devolve a lista estruturada,
 * server resolve `studentNameHint` → `resolvedTurmaId`.
 *
 * Cobra 1 crédito. Pro gating e rate limit ficam no route handler.
 */
export async function parseActivitiesFromImage(
  input: ParseActivitiesFromImageInput,
): Promise<ParseActivitiesFromImageResult> {
  const profiles = await findStudentProfilesByUser(input.userId);

  // Reaproveita o mesmo formato de cabeçalho do voice — a IA já está
  // treinada nas instruções pra esperar esse layout.
  const headerText = buildUserMessage({
    transcript: IMAGE_INSTRUCTION,
    studentNames: profiles.map((p) => p.name),
  });

  const out = await runBillableAgentCall<ActivitiesAgentResponse>({
    billing,
    owner: { type: "user", id: input.userId },
    app: "agenda-da-turma",
    feature: FEATURE,
    model: AGENDA_MODELS[FEATURE],
    recorder,
    agent: "activitiesParserVision",
    getUsage: (response) => response.usage,
    call: async ({ runId }) => {
      const mastra = getMastra();
      const response = await mastra.getAgent("activitiesParserVision").generate(
        [
          {
            role: "user",
            content: [
              { type: "text", text: headerText },
              {
                type: "image",
                image: input.imageDataUrl,
                providerOptions: { openai: { imageDetail: "low" } },
              },
            ],
          },
        ],
        {
          runId,
          structuredOutput: {
            schema: activitiesParserSchema,
            errorStrategy: "strict",
          },
        },
      );
      return response;
    },
  });

  const parsed = out.result.object as ActivitiesParserOutput;
  return enrichWithResolvedTurma(parsed, profiles);
}
