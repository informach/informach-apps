import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { billing } from "@/features/billing/service";
import { recordProductEvent } from "@/features/kitchen/events";
import { parseIngredients } from "@/features/kitchen/ingredients";
import { FREE_RECIPE_LIMIT } from "./limits";
import {
  countFavoritesByUser,
  countRecipesByUser,
  deleteRecipeForUser,
  findRecipeByIdForUser,
  findRecipesPageByUser,
  insertRecipe,
  insertRecipeWithinFreeLimit,
  type RecipeListOptions,
  setRecipeFavoriteForUser,
  updateRecipeForUser,
} from "./repository";
import type { RecipeInput } from "./schemas";
import type { Recipe, RecipeListPage } from "./types";

export type { Recipe, RecipeListPage, RecipeSummary } from "./types";

export type CreateRecipeError = {
  code: "PLAN_LIMIT_REACHED";
  limit: number;
  current: number;
};

export type RecipeNotFoundError = { code: "NOT_FOUND" };

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
    creationMethod: input.creationMethod,
    servings: input.servings ?? null,
    totalMinutes: input.totalMinutes ?? null,
    structuredIngredients: parseIngredients(input.ingredients),
    sourceUrl: input.sourceUrl ?? null,
    sourceName: input.sourceName ?? null,
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
    await recordProductEvent(userId, "recipe_saved", limitedInsert.recipe.id);
    return ok(limitedInsert.recipe);
  }

  const row = await insertRecipe(payload);
  await recordProductEvent(userId, "recipe_saved", row.id);
  return ok(row);
}

export async function listRecipesForUser(
  userId: string,
  options: RecipeListOptions = {},
): Promise<RecipeListPage> {
  return findRecipesPageByUser(userId, options);
}

export async function getRecipeForUser(
  userId: string,
  id: string,
): Promise<Result<Recipe, RecipeNotFoundError>> {
  const row = await findRecipeByIdForUser(userId, id);
  if (!row) return err({ code: "NOT_FOUND" });
  return ok(row);
}

export async function updateRecipe(
  userId: string,
  id: string,
  input: Omit<RecipeInput, "creationMethod">,
): Promise<Result<Recipe, RecipeNotFoundError>> {
  const row = await updateRecipeForUser(userId, id, {
    name: input.name,
    ingredients: input.ingredients,
    preparation: input.preparation,
    finishing: input.finishing,
    isFavorite: input.isFavorite,
    servings: input.servings ?? null,
    totalMinutes: input.totalMinutes ?? null,
    structuredIngredients: parseIngredients(input.ingredients),
    sourceUrl: input.sourceUrl ?? null,
    sourceName: input.sourceName ?? null,
  });
  if (!row) return err({ code: "NOT_FOUND" });
  return ok(row);
}

export async function deleteRecipe(
  userId: string,
  id: string,
): Promise<Result<true, RecipeNotFoundError>> {
  const removed = await deleteRecipeForUser(userId, id);
  if (!removed) return err({ code: "NOT_FOUND" });
  return ok(true);
}

export async function toggleRecipeFavorite(
  userId: string,
  id: string,
  isFavorite: boolean,
): Promise<Result<Recipe, RecipeNotFoundError>> {
  const row = await setRecipeFavoriteForUser(userId, id, isFavorite);
  if (!row) return err({ code: "NOT_FOUND" });
  return ok(row);
}

export async function countUserRecipes(userId: string): Promise<number> {
  return countRecipesByUser(userId);
}

export async function countUserFavorites(userId: string): Promise<number> {
  return countFavoritesByUser(userId);
}
