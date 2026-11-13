import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { cozyaAuthority } from "@/features/family/context";
import { recordProductEvent } from "@/features/kitchen/events";
import { parseIngredients } from "@/features/kitchen/ingredients";
import { FREE_RECIPE_LIMIT } from "./limits";
import { recipePayload } from "./payload";
import {
  countFavoritesByUser,
  countRecipesByUser,
  deleteRecipeForUser,
  findRecipeByIdForUser,
  findRecipesPageByUser,
  insertRecipeForAccess,
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
  const payload = recipePayload(userId, input);

  const result = await insertRecipeForAccess(await cozyaAuthority(userId), payload);
  if (!result.ok)
    return err({ code: "PLAN_LIMIT_REACHED", limit: FREE_RECIPE_LIMIT, current: result.current });
  await recordProductEvent(userId, "recipe_saved", result.recipe.id);
  return ok(result.recipe);
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
