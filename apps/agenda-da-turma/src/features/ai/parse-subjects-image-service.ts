import "server-only";

import { createHash } from "node:crypto";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { AGENDA_MODELS } from "@/ai/models";
import type { SubjectsParserOutput } from "@/ai/subjects-parser/schema";
import type { AgendaAuthority } from "@/features/family/authority";
import { prepareNoticeAttachment } from "@/features/notices/attachment";
import {
  type AiCostAcceptance,
  actualNoticeCredits,
  assertCostAcceptance,
  SUBJECT_IMAGE_COST,
} from "./costs";
import { subjectGenerationOptions } from "./subject-budget";
import { validatedSubjectResult } from "./subject-result";
import { agendaAiOperations } from "./wallet-repository";

export type ParseSubjectsFromImageInput = {
  actor: AgendaAuthority;
  profileId: string;
  acceptedCost: AiCostAcceptance;
  imageDataUrl: string;
};
export type ParseSubjectsFromImageResult = SubjectsParserOutput;
const FEATURE = "agenda.subjects.parse_image" as const;
/** Authorized, bounded extraction against the family wallet. */
export async function parseSubjectsFromImage(
  input: ParseSubjectsFromImageInput,
): Promise<ParseSubjectsFromImageResult> {
  assertCostAcceptance(input.acceptedCost, SUBJECT_IMAGE_COST);
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(input.imageDataUrl))
    throw new Error("INVALID_IMAGE");
  const attachment = await prepareNoticeAttachment({ name: "image", dataUrl: input.imageDataUrl });
  if (!attachment) throw new Error("INVALID_IMAGE");
  const operations = await agendaAiOperations(input.actor, input.profileId);
  return operations.run({
    feature: FEATURE,
    model: AGENDA_MODELS[FEATURE],
    agent: "subjectsParserVision",
    recorder,
    tariff: SUBJECT_IMAGE_COST.version,
    maxCredits: SUBJECT_IMAGE_COST.maxCredits,
    inputHash: createHash("sha256").update(input.imageDataUrl).digest("hex"),
    parseResult: validatedSubjectResult,
    call: async (runId) => {
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
                image: attachment.dataUrl,
                providerOptions: { openai: { imageDetail: "low" } },
              },
            ],
          },
        ],
        subjectGenerationOptions(runId),
      );
      return {
        value: validatedSubjectResult(response.object),
        actualCredits: actualNoticeCredits(response.usage),
        usage: response.usage,
      };
    },
  });
}
