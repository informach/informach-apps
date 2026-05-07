import { z } from "zod";
import { withAiRouteGuards } from "@/features/ai/_shared";
import {
  RecipeNotFoundError,
  researchRecipeFromPrompt,
} from "@/features/ai/research-recipe-from-prompt-service";
import { logger } from "@/lib/logger";

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
    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ code: "INVALID_PROMPT" }, { status: 400 });
    }
    prompt = parsed.data.prompt;
  } catch (err) {
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "cozya.from_prompt.parse_failed",
    );
    return Response.json({ code: "INVALID_PROMPT" }, { status: 400 });
  }

  try {
    const result = await researchRecipeFromPrompt({ userId, prompt });
    if (!result.isValidRecipe) {
      return Response.json({
        isValidRecipe: false,
        reason: result.reason ?? "Não consegui estruturar uma receita a partir da busca.",
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
    if (err instanceof RecipeNotFoundError) {
      return Response.json({ isValidRecipe: false, reason: err.reason });
    }
    logger.error(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "cozya.from_prompt.failed",
    );
    return Response.json({ code: "RESEARCH_FAILED" }, { status: 502 });
  }
}
