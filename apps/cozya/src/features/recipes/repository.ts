import "server-only";

import { and, count, type Database, db, desc, eq, sql } from "@informach/db";
import { cozyaRecipes } from "@informach/db/schema";

export type Recipe = typeof cozyaRecipes.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbClient = Database | Tx;

export type NewRecipePayload = {
  userId: string;
  name: string;
  ingredients: string;
  preparation: string;
  finishing: string | null;
  isFavorite: boolean;
};

export type InsertWithinLimitResult = { ok: true; recipe: Recipe } | { ok: false; current: number };

export async function insertRecipe(payload: NewRecipePayload): Promise<Recipe> {
  return insertRecipeWithClient(db, payload);
}

export async function insertRecipeWithinFreeLimit(
  payload: NewRecipePayload,
  limit: number,
): Promise<InsertWithinLimitResult> {
  return db.transaction(
    async (tx) => {
      await lockRecipeLimitForUser(tx, payload.userId);

      const current = await countRecipesByUserWithClient(tx, payload.userId);
      if (current >= limit) {
        return { ok: false as const, current };
      }

      const recipe = await insertRecipeWithClient(tx, payload);
      return { ok: true as const, recipe };
    },
    { isolationLevel: "read committed" },
  );
}

async function insertRecipeWithClient(
  client: DbClient,
  payload: NewRecipePayload,
): Promise<Recipe> {
  const inserted = await client.insert(cozyaRecipes).values(payload).returning();
  const row = inserted[0];
  if (!row) {
    throw new Error("cozya.recipes: insert returning empty");
  }
  return row;
}

async function lockRecipeLimitForUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:recipes:${userId}`}))`);
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
  return countRecipesByUserWithClient(db, userId);
}

async function countRecipesByUserWithClient(client: DbClient, userId: string): Promise<number> {
  const [row] = await client
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
