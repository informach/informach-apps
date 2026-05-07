import { z } from "zod";
import { withAiRouteGuards } from "@/features/ai/_shared";
import { parseRecipeFromVoice } from "@/features/ai/parse-recipe-service";
import { logger } from "@/lib/logger";

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
    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ code: "INVALID_TRANSCRIPT" }, { status: 400 });
    }
    transcript = parsed.data.transcript;
  } catch (err) {
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "cozya.parse_voice.parse_failed",
    );
    return Response.json({ code: "INVALID_TRANSCRIPT" }, { status: 400 });
  }

  try {
    const result = await parseRecipeFromVoice({ userId, transcript });
    if (!result.isValidRecipe) {
      return Response.json({
        isValidRecipe: false,
        reason: result.reason ?? "O áudio não parece descrever uma receita.",
      });
    }
    return Response.json({
      isValidRecipe: true,
      recipe: {
        name: result.name ?? "",
        ingredients: result.ingredients ?? "",
        preparation: result.preparation ?? "",
        finishing: result.finishing ?? "",
      },
    });
  } catch (err) {
    logger.error(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "cozya.parse_voice.failed",
    );
    return Response.json({ code: "PARSE_FAILED" }, { status: 502 });
  }
}
