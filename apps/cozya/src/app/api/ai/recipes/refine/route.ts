import { z } from "zod";
import { withAiRouteGuards } from "@/features/ai/_shared";
import { refineRecipe } from "@/features/ai/refine-recipe-service";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const MAX_REFINEMENT_CHARS = 500;
const MAX_RECIPE_FIELD_CHARS = 5000;

// Aceita o shape que sai do `recipeParser` (`isValidRecipe: true` + campos).
// Mantém campos legados como nullish para tolerar payloads que omitam
// `reason`/`finishing`; antes de chamar o service normalizamos para null.
const recipeShape = z.object({
  isValidRecipe: z.literal(true),
  reason: z.string().nullish(),
  name: z.string().min(1).max(120),
  ingredients: z.string().min(1).max(MAX_RECIPE_FIELD_CHARS),
  preparation: z.string().min(1).max(MAX_RECIPE_FIELD_CHARS),
  finishing: z.string().min(1).max(MAX_RECIPE_FIELD_CHARS).nullish(),
});

const requestSchema = z.object({
  recipe: recipeShape,
  refinementRequest: z.string().trim().min(2).max(MAX_REFINEMENT_CHARS),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await withAiRouteGuards({ errorScope: "cozya.refine" });
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let body: z.infer<typeof requestSchema>;
  try {
    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
    }
    body = parsed.data;
  } catch (err) {
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "cozya.refine.parse_failed",
    );
    return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const currentRecipe = {
      ...body.recipe,
      reason: body.recipe.reason ?? null,
      finishing: body.recipe.finishing ?? null,
    };
    const result = await refineRecipe({
      userId,
      currentRecipe,
      refinementRequest: body.refinementRequest,
    });
    if (!result.isValidRecipe) {
      return Response.json({
        isValidRecipe: false,
        reason: result.reason ?? "Não consegui aplicar esse refinamento.",
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
      "cozya.refine.failed",
    );
    return Response.json({ code: "REFINE_FAILED" }, { status: 502 });
  }
}
