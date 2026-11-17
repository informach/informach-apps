import "server-only";
import { z } from "zod";
import { RECIPE_PARSER_INSTRUCTIONS } from "@/ai/recipe-parser/instructions";
import { recipeParserSchema } from "@/ai/recipe-parser/schema";
import { RECIPE_REFINER_INSTRUCTIONS } from "@/ai/recipe-refiner/instructions";
import { COZYA_AI_LIMITS } from "./costs";

export function assertTextBudget(text: string, maxBytes: number) {
  if (!text.trim() || Buffer.byteLength(text, "utf8") > maxBytes)
    throw new Error("AI_CONTEXT_TOO_LARGE");
}
export function recipeGenerationOptions(runId: string, kind: "parse" | "refine" = "parse") {
  const instructions = kind === "refine" ? RECIPE_REFINER_INSTRUCTIONS : RECIPE_PARSER_INSTRUCTIONS;
  const fixedBytes =
    Buffer.byteLength(instructions + JSON.stringify(z.toJSONSchema(recipeParserSchema)), "utf8") +
    4096;
  if (fixedBytes > COZYA_AI_LIMITS.fixedPromptBytes) throw new Error("AI_CONTEXT_TOO_LARGE");
  return {
    runId,
    maxSteps: 1,
    abortSignal: AbortSignal.timeout(90000),
    modelSettings: { maxOutputTokens: COZYA_AI_LIMITS.outputTokens, maxRetries: 0, temperature: 0 },
    structuredOutput: { schema: recipeParserSchema, errorStrategy: "strict" as const },
  };
}
