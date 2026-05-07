import { z } from "zod";
import { withAiRouteGuards } from "@/features/ai/_shared";
import { parseRecipeFromText } from "@/features/ai/parse-recipe-text-service";
import { logger } from "@/lib/logger";

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
    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ code: "INVALID_TEXT" }, { status: 400 });
    }
    text = parsed.data.text;
  } catch (err) {
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "cozya.parse_text.parse_failed",
    );
    return Response.json({ code: "INVALID_TEXT" }, { status: 400 });
  }

  try {
    const result = await parseRecipeFromText({ userId, text });
    if (!result.isValidRecipe) {
      return Response.json({
        isValidRecipe: false,
        reason: result.reason ?? "O texto não parece descrever uma receita.",
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
      "cozya.parse_text.failed",
    );
    return Response.json({ code: "PARSE_FAILED" }, { status: 502 });
  }
}
