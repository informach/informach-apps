import "server-only";

import { createHash } from "node:crypto";
import { getMastra } from "@/ai";
import { agentRunRecorder as recorder } from "@/ai/agent-run-recorder";
import { AGENDA_MODELS } from "@/ai/models";
import type { SubjectsParserOutput } from "@/ai/subjects-parser/schema";
import type { AgendaAuthority } from "@/features/family/authority";
import {
  type AiCostAcceptance,
  actualSubjectTextCredits,
  assertCostAcceptance,
  SUBJECT_TEXT_COST,
} from "./costs";
import { subjectGenerationOptions } from "./subject-budget";
import { validatedSubjectResult } from "./subject-result";
import { agendaAiOperations } from "./wallet-repository";

export type ParseSubjectsFromVoiceInput = {
  actor: AgendaAuthority;
  profileId: string;
  acceptedCost: AiCostAcceptance;
  transcript: string;
};

export type ParseSubjectsFromVoiceResult = SubjectsParserOutput;

const FEATURE = "agenda.subjects.parse_voice" as const;

/** Authorized, bounded extraction against the family wallet. */
export async function parseSubjectsFromVoice(
  input: ParseSubjectsFromVoiceInput,
): Promise<ParseSubjectsFromVoiceResult> {
  assertCostAcceptance(input.acceptedCost, SUBJECT_TEXT_COST);
  if (
    !input.transcript.trim() ||
    input.transcript.length > 5000 ||
    Buffer.byteLength(input.transcript, "utf8") > 20000
  )
    throw new Error("INVALID_TRANSCRIPT");
  const operations = await agendaAiOperations(input.actor, input.profileId);
  return operations.run({
    feature: FEATURE,
    model: AGENDA_MODELS[FEATURE],
    agent: "subjectsParser",
    recorder,
    tariff: SUBJECT_TEXT_COST.version,
    maxCredits: SUBJECT_TEXT_COST.maxCredits,
    inputHash: createHash("sha256").update(input.transcript).digest("hex"),
    parseResult: validatedSubjectResult,
    call: async (runId) => {
      const mastra = getMastra();
      const response = await mastra
        .getAgent("subjectsParser")
        .generate(input.transcript, subjectGenerationOptions(runId));
      return {
        value: validatedSubjectResult(response.object),
        actualCredits: actualSubjectTextCredits(response.usage),
        usage: response.usage,
      };
    },
  });
}
