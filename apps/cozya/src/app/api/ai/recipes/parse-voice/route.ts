import { z } from "zod";
import { withAiRouteGuards } from "@/features/ai/_shared";
import { aiErrorResponse } from "@/features/ai/errors";
import { runAiOperation } from "@/features/ai/idempotency";
import { parseRecipeFromVoice } from "@/features/ai/parse-recipe-service";
import { recipeResponse } from "@/features/ai/recipe-output";
import { logger } from "@/lib/logger";

import { RequestTooLargeError, readLimitedJson } from "@/lib/request-size";

export const runtime = "nodejs";

const MAX_TRANSCRIPT_CHARS = 3000;

const requestSchema = z.object({
  transcript: z.string().trim().min(1).max(MAX_TRANSCRIPT_CHARS),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await withAiRouteGuards({ errorScope: "cozya.parse_voice" });
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let transcript: string;
  try {
    const json = await readLimitedJson(request);
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ code: "INVALID_TRANSCRIPT" }, { status: 400 });
    }
    transcript = parsed.data.transcript;
  } catch (err) {
    if (err instanceof RequestTooLargeError) return aiErrorResponse(err);
    logger.warn(
      { userId, error: err instanceof Error ? err.name : "UnknownError" },
      "cozya.parse_voice.parse_failed",
    );
    return Response.json({ code: "INVALID_TRANSCRIPT" }, { status: 400 });
  }

  return runAiOperation(request, userId, JSON.stringify({ transcript }), async () => {
    try {
      const result = await parseRecipeFromVoice({ userId, transcript });
      if (!result.isValidRecipe) {
        return Response.json({
          isValidRecipe: false,
          reason: result.reason ?? "O áudio não parece descrever uma receita.",
        });
      }
      return Response.json(recipeResponse(result, "voice"));
    } catch (err) {
      if (err instanceof RequestTooLargeError) return aiErrorResponse(err);
      logger.error(
        { userId, error: err instanceof Error ? err.name : "UnknownError" },
        "cozya.parse_voice.failed",
      );
      return aiErrorResponse(err, "PARSE_FAILED");
    }
  });
}
