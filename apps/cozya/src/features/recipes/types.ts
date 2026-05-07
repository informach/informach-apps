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

export type RecipeListPage = {
  recipes: Recipe[];
  page: number;
  limit: number;
  hasNextPage: boolean;
};
