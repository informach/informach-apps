import { z } from "zod";
import { recipeParserSchema } from "@/ai/recipe-parser/schema";
import type { RecipeCreationMethod } from "@/features/recipes/schemas";
import { NoRecipeResultError } from "./errors";

export function validateRecipeOutput(object: unknown) {
  const result = recipeParserSchema.parse(object);
  if (
    !result.isValidRecipe ||
    !result.name?.trim() ||
    !result.ingredients?.trim() ||
    !result.preparation?.trim()
  ) {
    throw new NoRecipeResultError(
      result.reason ||
        "Não identifiquei ingredientes e preparo suficientes. Nenhum crédito foi consumido.",
    );
  }
  if (
    result.sourceUrl &&
    !z
      .string()
      .url()
      .regex(/^https?:\/\//i)
      .safeParse(result.sourceUrl).success
  )
    result.sourceUrl = null;
  return result;
}

export function recipeResponse(
  result: ReturnType<typeof validateRecipeOutput>,
  creationMethod: Exclude<RecipeCreationMethod, "manual"> = "prompt",
) {
  return {
    isValidRecipe: true as const,
    recipe: {
      creationMethod,
      name: result.name ?? "",
      ingredients: result.ingredients ?? "",
      preparation: result.preparation ?? "",
      finishing: result.finishing ?? "",
      servings: result.servings ?? null,
      totalMinutes: result.totalMinutes ?? null,
      sourceUrl: result.sourceUrl ?? null,
      sourceName: result.sourceName ?? null,
    },
  };
}
