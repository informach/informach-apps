import "server-only";

import { and, count, db, desc, eq } from "@informach/db";
import { cozyaRecipes } from "@informach/db/schema";

export type Recipe = typeof cozyaRecipes.$inferSelect;

export type NewRecipePayload = {
  userId: string;
  name: string;
  ingredients: string;
  preparation: string;
  finishing: string | null;
  isFavorite: boolean;
};

export async function insertRecipe(payload: NewRecipePayload): Promise<Recipe> {
  const inserted = await db.insert(cozyaRecipes).values(payload).returning();
  const row = inserted[0];
  if (!row) {
    throw new Error("cozya.recipes: insert returning empty");
  }
  return row;
}

export async function findRecipesByUser(userId: string, limit = 50): Promise<Recipe[]> {
  return db
    .select()
    .from(cozyaRecipes)
    .where(eq(cozyaRecipes.userId, userId))
    .orderBy(desc(cozyaRecipes.createdAt))
    .limit(limit);
}

export async function countRecipesByUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(cozyaRecipes)
    .where(eq(cozyaRecipes.userId, userId));
  return Number(row?.count ?? 0);
}

export async function countFavoritesByUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(cozyaRecipes)
    .where(and(eq(cozyaRecipes.userId, userId), eq(cozyaRecipes.isFavorite, true)));
  return Number(row?.count ?? 0);
}
