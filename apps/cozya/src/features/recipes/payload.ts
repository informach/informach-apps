import { parseIngredients } from "@/features/kitchen/ingredients";
import type { RecipeInput } from "./schemas";
export function recipePayload(userId: string, input: RecipeInput) {
  return {
    userId,
    name: input.name,
    ingredients: input.ingredients,
    preparation: input.preparation,
    finishing: input.finishing,
    isFavorite: input.isFavorite,
    creationMethod: input.creationMethod,
    servings: input.servings ?? null,
    totalMinutes: input.totalMinutes ?? null,
    structuredIngredients: parseIngredients(input.ingredients),
    sourceUrl: input.sourceUrl ?? null,
    sourceName: input.sourceName ?? null,
  };
}
