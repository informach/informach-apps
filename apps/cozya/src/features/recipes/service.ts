import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { billing } from "@/features/billing/service";
import { FREE_RECIPE_LIMIT } from "./limits";
import {
  countFavoritesByUser,
  countRecipesByUser,
  findRecipesByUser,
  insertRecipe,
  insertRecipeWithinFreeLimit,
  type Recipe,
} from "./repository";
import type { RecipeInput } from "./schemas";

export type { Recipe } from "./repository";

export type CreateRecipeError = {
  code: "PLAN_LIMIT_REACHED";
  limit: number;
  current: number;
};

export async function createRecipe(
  userId: string,
  input: RecipeInput,
): Promise<Result<Recipe, CreateRecipeError>> {
  const payload = {
    userId,
    name: input.name,
    ingredients: input.ingredients,
    preparation: input.preparation,
    finishing: input.finishing,
    isFavorite: input.isFavorite,
  };

  const isPro = await billing.hasProSubscription({ type: "user", id: userId });
  if (!isPro) {
    const limitedInsert = await insertRecipeWithinFreeLimit(payload, FREE_RECIPE_LIMIT);
    if (!limitedInsert.ok) {
      return err({
        code: "PLAN_LIMIT_REACHED",
        limit: FREE_RECIPE_LIMIT,
        current: limitedInsert.current,
      });
    }
    return ok(limitedInsert.recipe);
  }

  const row = await insertRecipe(payload);
  return ok(row);
}

export async function listRecipesForUser(userId: string, limit = 50): Promise<Recipe[]> {
  return findRecipesByUser(userId, limit);
}

export async function countUserRecipes(userId: string): Promise<number> {
  return countRecipesByUser(userId);
}

export async function countUserFavorites(userId: string): Promise<number> {
  return countFavoritesByUser(userId);
}
