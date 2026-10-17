import type { CozyaIngredient } from "@informach/db/schema";
import type { RecipeCreationMethod } from "./schemas";

export type Recipe = {
  id: string;
  userId: string;
  name: string;
  ingredients: string;
  preparation: string;
  finishing: string | null;
  servings?: number | null;
  totalMinutes?: number | null;
  structuredIngredients?: CozyaIngredient[] | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
  isFavorite: boolean;
  creationMethod: RecipeCreationMethod;
  createdAt: Date;
  updatedAt: Date;
  contentUpdatedAt: Date;
};

/**
 * Lightweight projection used by the recipe cards. Drops `preparation` and `finishing`, the
 * largest text fields, and adds when it was last cooked and how it went.
 */
export type RecipeSummary = Omit<Recipe, "preparation" | "finishing"> & {
  lastCookedAt?: Date | null;
  verdict?: "again" | "tweak" | "skip" | null;
};

export type RecipeListPage = {
  recipes: RecipeSummary[];
  page: number;
  limit: number;
  hasNextPage: boolean;
};
