import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { billing } from "@/features/billing/service";
import { FREE_RECIPE_LIMIT } from "./limits";
import {
  countFavoritesByUser,
  countRecipesByUser,
  findRecipesByUser,
  insertRecipe,
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
  const isPro = await billing.hasProSubscription({ type: "user", id: userId });
  if (!isPro) {
    const current = await countRecipesByUser(userId);
    if (current >= FREE_RECIPE_LIMIT) {
      return err({ code: "PLAN_LIMIT_REACHED", limit: FREE_RECIPE_LIMIT, current });
    }
  }

  const row = await insertRecipe({
    userId,
    name: input.name,
    ingredients: input.ingredients,
    preparation: input.preparation,
    finishing: input.finishing,
    isFavorite: input.isFavorite,
  });
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
