import type { RecipeCreationMethod } from "./schemas";

export type Recipe = {
  id: string;
  userId: string;
  name: string;
  ingredients: string;
  preparation: string;
  finishing: string | null;
  isFavorite: boolean;
  creationMethod: RecipeCreationMethod;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Lightweight projection used by the dashboard list. Drops `preparation` and
 * `finishing` (the largest text fields) — the card only renders name, count
 * and the favorite flag. Detail/edit dialogs lazy-load the full row.
 */
export type RecipeSummary = Omit<Recipe, "preparation" | "finishing">;

export type RecipeListPage = {
  recipes: RecipeSummary[];
  page: number;
  limit: number;
  hasNextPage: boolean;
};
