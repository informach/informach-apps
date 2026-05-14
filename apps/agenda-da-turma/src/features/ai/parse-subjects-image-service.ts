import "server-only";

import { runBillableAgentCall } from "@informach/ai-core";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { AGENDA_MODELS } from "@/ai/models";
import { type SubjectsParserOutput, subjectsParserSchema } from "@/ai/subjects-parser/schema";
import { billing } from "@/lib/billing";

export type ParseSubjectsFromImageInput = {
  userId: string;
  /** Data URL no formato `data:image/{jpeg|png|webp};base64,...`. */
  imageDataUrl: string;
};

export type ParseSubjectsFromImageResult = SubjectsParserOutput;

const FEATURE = "agenda.subjects.parse_image" as const;

type SubjectsAgentResponse = {
  object: unknown;
  usage?: unknown;
};

/**
 * Estrutura uma imagem (print de horário, foto de quadro, foto de caderno)
 * numa lista validada de matérias. Usa agente vision `subjectsParserVision`
 * (`openai/gpt-4o`) com `imageDetail: "low"` — barato (~$0.005-0.016/call)
 * e suficiente pra OCR de texto impresso ou manuscrito. Tentamos "high" pra
 * resolver dias rotacionados em grades de horário, mas a detecção de
 * matérias REGREDIU (atenção do modelo se dispersou no grid analysis).
 * Conclusão: manter "low" como baseline; classDays é extraído quando óbvio
 * e o user ajusta manualmente no batch dialog quando necessário.
 *
 * Cobra 1 crédito via reserve→commit/release. Pro gating e rate limit ficam
 * no route handler.
 */
export async function parseSubjectsFromImage(
  input: ParseSubjectsFromImageInput,
): Promise<ParseSubjectsFromImageResult> {
  const out = await runBillableAgentCall<SubjectsAgentResponse>({
    billing,
    owner: { type: "user", id: input.userId },
    app: "agenda-da-turma",
    feature: FEATURE,
    model: AGENDA_MODELS[FEATURE],
    recorder,
    agent: "subjectsParserVision",
    getUsage: (response) => response.usage,
    call: async ({ runId }) => {
      const mastra = getMastra();
      const response = await mastra.getAgent("subjectsParserVision").generate(
        [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extraia a lista de matérias desta imagem. Quando a imagem indicar o nome do professor associado à matéria, registre também.",
              },
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
            schema: subjectsParserSchema,
            errorStrategy: "strict",
          },
        },
      );
      return response;
    },
  });
  return out.result.object as SubjectsParserOutput;
}
