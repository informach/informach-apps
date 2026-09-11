import { z } from "zod";
import { withAiRouteGuards } from "@/features/ai/_shared";
import { aiErrorResponse } from "@/features/ai/errors";
import { runAiOperation } from "@/features/ai/idempotency";
import { parseRecipeFromText } from "@/features/ai/parse-recipe-text-service";
import { recipeResponse } from "@/features/ai/recipe-output";
import { logger } from "@/lib/logger";

import { RequestTooLargeError, readLimitedJson } from "@/lib/request-size";

export const runtime = "nodejs";

const MAX_TEXT_CHARS = 8000;

const requestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_CHARS),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await withAiRouteGuards({ errorScope: "cozya.parse_text" });
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let text: string;
  try {
    const json = await readLimitedJson(request);
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ code: "INVALID_TEXT" }, { status: 400 });
    }
    text = parsed.data.text;
  } catch (err) {
    if (err instanceof RequestTooLargeError) return aiErrorResponse(err);
    logger.warn(
      { userId, error: err instanceof Error ? err.name : "UnknownError" },
      "cozya.parse_text.parse_failed",
    );
    return Response.json({ code: "INVALID_TEXT" }, { status: 400 });
  }

  return runAiOperation(request, userId, JSON.stringify({ text }), async () => {
    try {
      const result = await parseRecipeFromText({ userId, text });
      if (!result.isValidRecipe) {
        return Response.json({
          isValidRecipe: false,
          reason: result.reason ?? "O texto não parece descrever uma receita.",
        });
      }
      return Response.json(recipeResponse(result, "text"));
    } catch (err) {
      if (err instanceof RequestTooLargeError) return aiErrorResponse(err);
      logger.error(
        { userId, error: err instanceof Error ? err.name : "UnknownError" },
        "cozya.parse_text.failed",
      );
      return aiErrorResponse(err, "PARSE_FAILED");
    }
  });
}
