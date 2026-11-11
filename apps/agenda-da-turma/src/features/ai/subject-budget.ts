import "server-only";
import { z } from "zod";
import { SUBJECTS_PARSER_INSTRUCTIONS } from "@/ai/subjects-parser/instructions";
import { subjectsParserSchema } from "@/ai/subjects-parser/schema";
import { AGENDA_AI_LIMITS } from "./costs";
export function subjectGenerationOptions(runId: string) {
  const fixedBytes =
    Buffer.byteLength(
      SUBJECTS_PARSER_INSTRUCTIONS + JSON.stringify(z.toJSONSchema(subjectsParserSchema)),
      "utf8",
    ) + 4096;
  if (fixedBytes > AGENDA_AI_LIMITS.fixedPromptBytes) throw new Error("AI_CONTEXT_TOO_LARGE");
  return {
    runId,
    maxSteps: 1,
    abortSignal: AbortSignal.timeout(45000),
    modelSettings: { maxOutputTokens: AGENDA_AI_LIMITS.outputTokens, maxRetries: 0 },
    structuredOutput: { schema: subjectsParserSchema, errorStrategy: "strict" as const },
  };
}
