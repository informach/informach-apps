import "server-only";

import { and, count, type Database, db, desc, eq, sql } from "@informach/db";
import { type CozyaIngredient, cozyaCookingSessions, cozyaRecipes } from "@informach/db/schema";
import type { Recipe, RecipeListPage, RecipeSummary } from "./types";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbClient = Database | Tx;

export type NewRecipePayload = {
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
  creationMethod: "manual" | "voice" | "text" | "image" | "prompt";
};

export type InsertWithinLimitResult = { ok: true; recipe: Recipe } | { ok: false; current: number };

export type RecipeFilter = "favoritas" | "rapidas" | "rendem" | "tempo";

export type RecipeListOptions = {
  search?: string;
  page?: number;
  limit?: number;
  filter?: RecipeFilter;
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

export async function findRecipesByUser(userId: string, limit = 50): Promise<RecipeSummary[]> {
  const page = await findRecipesPageByUser(userId, { limit });
  return page.recipes;
}

export async function findRecipesPageByUser(
  userId: string,
  options: RecipeListOptions = {},
): Promise<RecipeListPage> {
  const limit = normalizeRecipeLimit(options.limit);
  const page = normalizeRecipePage(options.page);
  // Projection: skips `preparation` and `finishing`, the heaviest text columns. The list only
  // needs the card; the recipe page reads the full row via `findRecipeByIdForUser`.
  const rows = await db
    .select({
      id: cozyaRecipes.id,
      userId: cozyaRecipes.userId,
      name: cozyaRecipes.name,
      ingredients: cozyaRecipes.ingredients,
      servings: cozyaRecipes.servings,
      totalMinutes: cozyaRecipes.totalMinutes,
      isFavorite: cozyaRecipes.isFavorite,
      creationMethod: cozyaRecipes.creationMethod,
      // The collection recipes show their dish photo on the card.
      sourceName: cozyaRecipes.sourceName,
      createdAt: cozyaRecipes.createdAt,
      updatedAt: cozyaRecipes.updatedAt,
      contentUpdatedAt: cozyaRecipes.contentUpdatedAt,
      lastCookedAt: cozyaCookingSessions.lastCookedAt,
      verdict: cozyaCookingSessions.verdict,
    })
    .from(cozyaRecipes)
    .leftJoin(
      cozyaCookingSessions,
      and(
        eq(cozyaCookingSessions.recipeId, cozyaRecipes.id),
        eq(cozyaCookingSessions.userId, cozyaRecipes.userId),
      ),
    )
    .where(recipesWhereClause(userId, options.search, options.filter))
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
  | "name"
  | "ingredients"
  | "preparation"
  | "finishing"
  | "isFavorite"
  | "servings"
  | "totalMinutes"
  | "structuredIngredients"
  | "sourceUrl"
  | "sourceName"
>;

export async function updateRecipeForUser(
  userId: string,
  id: string,
  payload: RecipeUpdatePayload,
): Promise<Recipe | null> {
  const now = new Date();
  const cookingFields = [
    { column: cozyaRecipes.ingredients, value: payload.ingredients },
    { column: cozyaRecipes.preparation, value: payload.preparation },
    { column: cozyaRecipes.finishing, value: payload.finishing },
    { column: cozyaRecipes.servings, value: payload.servings },
    { column: cozyaRecipes.totalMinutes, value: payload.totalMinutes },
  ];
  const contentChanged = sql.join(
    cookingFields
      .filter(({ value }) => value !== undefined)
      .map(({ column, value }) => sql`${column} IS DISTINCT FROM ${value}`),
    sql` OR `,
  );
  const [row] = await db
    .update(cozyaRecipes)
    .set({
      ...payload,
      updatedAt: now,
      contentUpdatedAt: sql`CASE WHEN ${contentChanged} THEN ${now.toISOString()}::timestamptz ELSE ${cozyaRecipes.contentUpdatedAt} END`,
    })
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

function filterClause(filter: RecipeFilter | undefined) {
  switch (filter) {
    case "favoritas":
      return eq(cozyaRecipes.isFavorite, true);
    case "rapidas":
      return sql`${cozyaRecipes.totalMinutes} <= 45`;
    case "rendem":
      return sql`${cozyaRecipes.servings} >= 4`;
    case "tempo":
      // Never cooked, or not for a month; "não repetiria" stays out of the suggestions.
      return sql`(${cozyaCookingSessions.lastCookedAt} is null or ${cozyaCookingSessions.lastCookedAt} < now() - interval '30 days') and ${cozyaCookingSessions.verdict} is distinct from 'skip'`;
    default:
      return undefined;
  }
}

function recipesWhereClause(userId: string, search: string | undefined, filter?: RecipeFilter) {
  const tokens = tokenizeRecipeSearch(search);
  const byFilter = filterClause(filter);
  if (tokens.length === 0)
    return byFilter
      ? (and(eq(cozyaRecipes.userId, userId), byFilter) ?? eq(cozyaRecipes.userId, userId))
      : eq(cozyaRecipes.userId, userId);

  // Each word must appear in the name or in the ingredients: "frango" finds the strogonoff.
  const tokenClauses = tokens.map((token) => {
    const pattern = buildLikePattern(token);
    return sql`(cozya.unaccent_immutable(${cozyaRecipes.name}) ilike cozya.unaccent_immutable(${pattern}) escape ${"\\"} or cozya.unaccent_immutable(${cozyaRecipes.ingredients}) ilike cozya.unaccent_immutable(${pattern}) escape ${"\\"})`;
  });
  const clause = and(
    eq(cozyaRecipes.userId, userId),
    ...tokenClauses,
    ...(byFilter ? [byFilter] : []),
  );
  if (!clause) return eq(cozyaRecipes.userId, userId);
  return clause;
}

const MAX_RECIPE_SEARCH_TOKENS = 6;

/**
 * Splits the user's search input into individual words so the query matches
 * regardless of word order, casing, or trailing punctuation. ILIKE is already
 * case-insensitive, so we only normalize punctuation and whitespace here.
 *
 * Why tokenize: Whisper transcripts often add a trailing period or comma
 * (e.g. "Sopa de pipoca.") that, with a single ILIKE, fails to match the
 * stored title "Sopa de pipoca". Splitting into words and AND-ing each
 * makes the search robust against this and against word reordering.
 */
function tokenizeRecipeSearch(search: string | undefined): string[] {
  if (!search) return [];
  const trimmed = search.trim().slice(0, 120);
  if (!trimmed) return [];
  return trimmed
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((token) => token.length > 0)
    .slice(0, MAX_RECIPE_SEARCH_TOKENS);
}

function buildLikePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
