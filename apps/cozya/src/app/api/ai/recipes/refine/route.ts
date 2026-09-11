import { z } from "zod";
import { withAiRouteGuards } from "@/features/ai/_shared";
import { aiErrorResponse } from "@/features/ai/errors";
import { runAiOperation } from "@/features/ai/idempotency";
import { recipeResponse } from "@/features/ai/recipe-output";
import { refineRecipe } from "@/features/ai/refine-recipe-service";
import { logger } from "@/lib/logger";

import { RequestTooLargeError, readLimitedJson } from "@/lib/request-size";

export const runtime = "nodejs";

const MAX_REFINEMENT_CHARS = 500;
const MAX_RECIPE_FIELD_CHARS = 5000;

// Aceita o shape que sai do `recipeParser` (`isValidRecipe: true` + campos).
// Mantém campos legados como nullish para tolerar payloads que omitam
// `reason`/`finishing`; antes de chamar o service normalizamos para null.
const recipeShape = z.object({
  servings: z.number().int().min(1).max(100).nullish(),
  totalMinutes: z.number().int().min(1).max(10080).nullish(),
  sourceUrl: z
    .string()
    .url()
    .max(2048)
    .regex(/^https?:\/\//i)
    .nullish(),
  sourceName: z.string().max(200).nullish(),
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
    const json = await readLimitedJson(request);
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
    }
    body = parsed.data;
  } catch (err) {
    if (err instanceof RequestTooLargeError) return aiErrorResponse(err);
    logger.warn(
      { userId, error: err instanceof Error ? err.name : "UnknownError" },
      "cozya.refine.parse_failed",
    );
    return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
  }

  return runAiOperation(request, userId, JSON.stringify(body), async () => {
    try {
      const currentRecipe = {
        ...body.recipe,
        servings: body.recipe.servings ?? null,
        totalMinutes: body.recipe.totalMinutes ?? null,
        sourceUrl: body.recipe.sourceUrl ?? null,
        sourceName: body.recipe.sourceName ?? null,
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
      return Response.json(recipeResponse(result));
    } catch (err) {
      if (err instanceof RequestTooLargeError) return aiErrorResponse(err);
      logger.error(
        { userId, error: err instanceof Error ? err.name : "UnknownError" },
        "cozya.refine.failed",
      );
      return aiErrorResponse(err, "REFINE_FAILED");
    }
  });
}
