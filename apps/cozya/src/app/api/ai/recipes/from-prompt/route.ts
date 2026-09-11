import { z } from "zod";
import { withAiRouteGuards } from "@/features/ai/_shared";
import { aiErrorResponse } from "@/features/ai/errors";
import { runAiOperation } from "@/features/ai/idempotency";
import { recipeResponse } from "@/features/ai/recipe-output";
import { researchRecipeFromPrompt } from "@/features/ai/research-recipe-from-prompt-service";
import { logger } from "@/lib/logger";

import { RequestTooLargeError, readLimitedJson } from "@/lib/request-size";

export const runtime = "nodejs";

const MAX_PROMPT_CHARS = 200;

const requestSchema = z.object({
  prompt: z.string().trim().min(3).max(MAX_PROMPT_CHARS),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await withAiRouteGuards({ errorScope: "cozya.from_prompt" });
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let prompt: string;
  try {
    const json = await readLimitedJson(request);
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ code: "INVALID_PROMPT" }, { status: 400 });
    }
    prompt = parsed.data.prompt;
  } catch (err) {
    if (err instanceof RequestTooLargeError) return aiErrorResponse(err);
    logger.warn(
      { userId, error: err instanceof Error ? err.name : "UnknownError" },
      "cozya.from_prompt.parse_failed",
    );
    return Response.json({ code: "INVALID_PROMPT" }, { status: 400 });
  }

  return runAiOperation(request, userId, JSON.stringify({ prompt }), async () => {
    try {
      const result = await researchRecipeFromPrompt({ userId, prompt });
      if (!result.isValidRecipe) {
        return Response.json({
          isValidRecipe: false,
          reason: result.reason ?? "Não consegui estruturar uma receita a partir da busca.",
        });
      }
      return Response.json(recipeResponse(result));
    } catch (err) {
      if (err instanceof RequestTooLargeError) return aiErrorResponse(err);
      logger.error(
        { userId, error: err instanceof Error ? err.name : "UnknownError" },
        "cozya.from_prompt.failed",
      );
      return aiErrorResponse(err, "RESEARCH_FAILED");
    }
  });
}
