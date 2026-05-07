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
  creationMethod: "manual" | "voice";
};

export type InsertWithinLimitResult = { ok: true; recipe: Recipe } | { ok: false; current: number };

export type RecipeListOptions = {
  search?: string;
  page?: number;
  limit?: number;
};

export type RecipeListPage = {
  recipes: Recipe[];
  page: number;
  limit: number;
  hasNextPage: boolean;
};

const DEFAULT_RECIPE_PAGE_SIZE = 50;
const MAX_RECIPE_PAGE_SIZE = 100;

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
  const page = await findRecipesPageByUser(userId, { limit });
  return page.recipes;
}

export async function findRecipesPageByUser(
  userId: string,
  options: RecipeListOptions = {},
): Promise<RecipeListPage> {
  const limit = normalizeRecipeLimit(options.limit);
  const page = normalizeRecipePage(options.page);
  const rows = await db
    .select()
    .from(cozyaRecipes)
    .where(recipesWhereClause(userId, options.search))
    .orderBy(desc(cozyaRecipes.isFavorite), desc(cozyaRecipes.createdAt))
    .limit(limit + 1)
    .offset((page - 1) * limit);

  return {
    recipes: rows.slice(0, limit),
    page,
    limit,
    hasNextPage: rows.length > limit,
  };
}

export async function findRecipeByIdForUser(userId: string, id: string): Promise<Recipe | null> {
  const [row] = await db
    .select()
    .from(cozyaRecipes)
    .where(and(eq(cozyaRecipes.userId, userId), eq(cozyaRecipes.id, id)))
    .limit(1);
  return row ?? null;
}

export type RecipeUpdatePayload = Pick<
  NewRecipePayload,
  "name" | "ingredients" | "preparation" | "finishing" | "isFavorite"
>;

export async function updateRecipeForUser(
  userId: string,
  id: string,
  payload: RecipeUpdatePayload,
): Promise<Recipe | null> {
  const [row] = await db
    .update(cozyaRecipes)
    .set({ ...payload, updatedAt: new Date() })
    .where(and(eq(cozyaRecipes.userId, userId), eq(cozyaRecipes.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteRecipeForUser(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(cozyaRecipes)
    .where(and(eq(cozyaRecipes.userId, userId), eq(cozyaRecipes.id, id)))
    .returning({ id: cozyaRecipes.id });
  return rows.length > 0;
}

export async function setRecipeFavoriteForUser(
  userId: string,
  id: string,
  isFavorite: boolean,
): Promise<Recipe | null> {
  const [row] = await db
    .update(cozyaRecipes)
    .set({ isFavorite, updatedAt: new Date() })
    .where(and(eq(cozyaRecipes.userId, userId), eq(cozyaRecipes.id, id)))
    .returning();
  return row ?? null;
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

function normalizeRecipeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_RECIPE_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(limit ?? DEFAULT_RECIPE_PAGE_SIZE), 1), MAX_RECIPE_PAGE_SIZE);
}

function normalizeRecipePage(page: number | undefined): number {
  if (!Number.isFinite(page)) return 1;
  return Math.max(Math.floor(page ?? 1), 1);
}

function recipesWhereClause(userId: string, search: string | undefined) {
  const term = normalizeRecipeSearch(search);
  if (!term) return eq(cozyaRecipes.userId, userId);

  const nameSearch = sql`${cozyaRecipes.name} ilike ${buildLikePattern(term)} escape ${"\\"}`;
  const clause = and(eq(cozyaRecipes.userId, userId), nameSearch);
  if (!clause) return eq(cozyaRecipes.userId, userId);
  return clause;
}

function normalizeRecipeSearch(search: string | undefined): string {
  return search?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "";
}

function buildLikePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
