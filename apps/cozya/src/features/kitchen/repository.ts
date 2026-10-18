import "server-only";
import { and, asc, count, type Database, db, desc, eq, inArray, sql } from "@informach/db";
import {
  cozyaCookingSessions,
  cozyaMeals,
  cozyaRecipes,
  cozyaShoppingItems,
  cozyaShoppingLists,
} from "@informach/db/schema";
import type { z } from "zod";
import { addDays, localDay, weekStart } from "./dates";
import {
  canonicalShoppingKey,
  consolidateShopping,
  parseIngredients,
  type ShoppingLine,
} from "./ingredients";
import type { cookingFeedbackSchema, cookingInputSchema, mealSchema } from "./schemas";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DbClient = Database | Tx;

export async function getWeekMeals(userId: string, week: string) {
  return getMealsBetween(userId, week, addDays(week, 7));
}

/** Meals from `from` (inclusive) to `to` (exclusive), in day and slot order. */
export async function getMealsBetween(userId: string, from: string, to: string) {
  return db
    .select()
    .from(cozyaMeals)
    .where(
      and(
        eq(cozyaMeals.userId, userId),
        sql`${cozyaMeals.day} >= ${from} AND ${cozyaMeals.day} < ${to}`,
      ),
    )
    .orderBy(asc(cozyaMeals.day), asc(cozyaMeals.slot));
}

/** One setup at a time per account: a double tap or a retried request runs after the first. */
export async function withAccountLock<T>(userId: string, scope: string, run: () => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:${scope}:${userId}`}))`);
    return run();
  });
}

export async function hasAnyMeal(userId: string) {
  const [row] = await db
    .select({ id: cozyaMeals.id })
    .from(cozyaMeals)
    .where(eq(cozyaMeals.userId, userId))
    .limit(1);
  return Boolean(row);
}

/** Recipes to choose from: favorites first, with the last time each one was cooked. */
export async function getRecipeChoices(userId: string) {
  return db
    .select({
      id: cozyaRecipes.id,
      name: cozyaRecipes.name,
      servings: cozyaRecipes.servings,
      totalMinutes: cozyaRecipes.totalMinutes,
      isFavorite: cozyaRecipes.isFavorite,
      sourceName: cozyaRecipes.sourceName,
      ingredients: cozyaRecipes.ingredients,
      lastCookedAt: cozyaCookingSessions.lastCookedAt,
      verdict: cozyaCookingSessions.verdict,
    })
    .from(cozyaRecipes)
    .leftJoin(
      cozyaCookingSessions,
      and(
        eq(cozyaCookingSessions.recipeId, cozyaRecipes.id),
        eq(cozyaCookingSessions.userId, userId),
      ),
    )
    .where(eq(cozyaRecipes.userId, userId))
    .orderBy(desc(cozyaRecipes.isFavorite), asc(cozyaRecipes.name));
}

export async function getRecipesByIds(userId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select()
    .from(cozyaRecipes)
    .where(and(eq(cozyaRecipes.userId, userId), inArray(cozyaRecipes.id, ids)));
}

export async function saveMeal(userId: string, input: z.infer<typeof mealSchema>) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:week:${userId}:${weekStart(input.day)}`}))`,
    );
    let label = input.label;
    if (input.recipeId) {
      const [recipe] = await tx
        .select({ name: cozyaRecipes.name })
        .from(cozyaRecipes)
        .where(and(eq(cozyaRecipes.userId, userId), eq(cozyaRecipes.id, input.recipeId)));
      if (!recipe) return false;
      label = recipe.name;
    }
    const values = { ...input, userId, label, updatedAt: new Date() };
    await tx
      .insert(cozyaMeals)
      .values(values)
      .onConflictDoUpdate({
        target: [cozyaMeals.userId, cozyaMeals.day, cozyaMeals.slot],
        set: values,
      });
    return true;
  });
}

export async function removeMeal(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [meal] = await tx
      .select({ day: cozyaMeals.day })
      .from(cozyaMeals)
      .where(and(eq(cozyaMeals.userId, userId), eq(cozyaMeals.id, id)));
    if (!meal) return;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:week:${userId}:${weekStart(meal.day)}`}))`,
    );
    await tx.delete(cozyaMeals).where(and(eq(cozyaMeals.userId, userId), eq(cozyaMeals.id, id)));
  });
}

export async function repeatWeek(userId: string, week: string) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:week:${userId}:${week}`}))`,
    );
    const previous = await tx
      .select()
      .from(cozyaMeals)
      .where(
        and(
          eq(cozyaMeals.userId, userId),
          sql`${cozyaMeals.day} >= ${addDays(week, -7)} AND ${cozyaMeals.day} < ${week}`,
        ),
      );
    if (!previous.length) return 0;
    const inserted = await tx
      .insert(cozyaMeals)
      .values(
        previous.map((meal) => ({
          userId,
          day: addDays(meal.day, 7),
          slot: meal.slot,
          recipeId: meal.recipeId,
          label: meal.label,
          servings: meal.servings,
          lunchboxServings: meal.lunchboxServings,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: cozyaMeals.id });
    return inserted.length;
  });
}

/** What the week's meals ask for today, with the current ingredient rules. */
async function plannedShoppingLines(
  client: DbClient,
  userId: string,
  week: string,
): Promise<ShoppingLine[]> {
  const meals = await client
    .select()
    .from(cozyaMeals)
    .where(
      and(
        eq(cozyaMeals.userId, userId),
        sql`${cozyaMeals.day} >= ${week} AND ${cozyaMeals.day} < ${addDays(week, 7)}`,
      ),
    );
  const recipeIds = meals.flatMap((meal) => (meal.recipeId ? [meal.recipeId] : []));
  const recipes = recipeIds.length
    ? await client
        .select()
        .from(cozyaRecipes)
        .where(and(eq(cozyaRecipes.userId, userId), inArray(cozyaRecipes.id, recipeIds)))
    : [];
  return consolidateShopping(
    meals.flatMap((meal) => {
      const recipe = recipes.find((r) => r.id === meal.recipeId);
      return recipe
        ? [
            {
              recipeId: recipe.id,
              name: recipe.name,
              baseServings: recipe.servings,
              servings: meal.servings,
              // Parse the person's text with today's rules; the stored snapshot predates them.
              ingredients: parseIngredients(recipe.ingredients),
            },
          ]
        : [];
    }),
  );
}

function lineSignature(line: { key: string; amount: string; note: string }) {
  return `${line.key}\u0000${line.amount}\u0000${line.note}`;
}

/** What the list of this week holds, or would hold, from the meals planned: a count before "Montar". */
export function previewShoppingLines(userId: string, week: string) {
  return plannedShoppingLines(db, userId, week);
}

export async function getShoppingList(userId: string, week: string) {
  const [list] = await db
    .select()
    .from(cozyaShoppingLists)
    .where(and(eq(cozyaShoppingLists.userId, userId), eq(cozyaShoppingLists.week, week)));
  if (!list) return null;
  const [saved, planned] = await Promise.all([
    db
      .select()
      .from(cozyaShoppingItems)
      .where(eq(cozyaShoppingItems.listId, list.id))
      .orderBy(asc(cozyaShoppingItems.category), asc(cozyaShoppingItems.name)),
    plannedShoppingLines(db, userId, week),
  ]);
  // Read under today's key rules: a line saved as "cebolas:un" is the "cebola:un" of the week.
  const items = saved.map((item) => ({ ...item, key: canonicalShoppingKey(item.key) }));
  const stored = items.filter((item) => !item.key.startsWith("manual:")).map(lineSignature);
  const expected = planned.map(lineSignature);
  // The week changed after the list was made: a meal, a portion or a recipe.
  const stale =
    stored.length !== expected.length || expected.some((signature) => !stored.includes(signature));
  return { ...list, items, stale };
}

export async function generateShoppingList(userId: string, week: string) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:week:${userId}:${week}`}))`,
    );
    const lines = await plannedShoppingLines(tx, userId, week);
    const [list] = await tx
      .insert(cozyaShoppingLists)
      .values({ userId, week })
      .onConflictDoUpdate({
        target: [cozyaShoppingLists.userId, cozyaShoppingLists.week],
        set: { generatedAt: new Date() },
      })
      .returning();
    if (!list) throw new Error("Shopping list insert returned no row");
    const previous = await tx
      .select()
      .from(cozyaShoppingItems)
      .where(eq(cozyaShoppingItems.listId, list.id))
      .for("update");
    // Manual extras survive regeneration. A changed quantity becomes pending again.
    await tx
      .delete(cozyaShoppingItems)
      .where(
        and(
          eq(cozyaShoppingItems.listId, list.id),
          sql`${cozyaShoppingItems.key} NOT LIKE 'manual:%'`,
        ),
      );
    if (lines.length)
      await tx.insert(cozyaShoppingItems).values(
        lines.map((line) => {
          // A line saved under an older key rule ("cebolas:un") is the same line ("cebola:un").
          const old = previous.find(
            (item) =>
              canonicalShoppingKey(item.key) === line.key &&
              item.amount === line.amount &&
              item.note === line.note,
          );
          // Pantry basics start as "in the house"; the person taps only what is missing, and
          // what they said is missing stays missing when another recipe changes the amount.
          const missing =
            line.category === "despensa" &&
            previous.some(
              (item) => canonicalShoppingKey(item.key) === line.key && item.state === "todo",
            );
          const fresh = line.category === "despensa" && !missing ? "have" : "todo";
          return { ...line, listId: list.id, state: old?.state ?? fresh };
        }),
      );
    return list.id;
  });
}

export async function setShoppingItemState(
  userId: string,
  id: string,
  state: "todo" | "have" | "bought",
) {
  return db
    .update(cozyaShoppingItems)
    .set({ state })
    .where(
      and(
        eq(cozyaShoppingItems.id, id),
        sql`${cozyaShoppingItems.listId} IN (SELECT ${cozyaShoppingLists.id} FROM ${cozyaShoppingLists} WHERE ${cozyaShoppingLists.userId} = ${userId})`,
      ),
    )
    .returning({ id: cozyaShoppingItems.id });
}

export async function getCookingSession(userId: string, recipeId: string) {
  const [session] = await db
    .select()
    .from(cozyaCookingSessions)
    .where(
      and(eq(cozyaCookingSessions.userId, userId), eq(cozyaCookingSessions.recipeId, recipeId)),
    );
  return session ?? null;
}

export async function getCookingSessions(userId: string, recipeIds: string[]) {
  if (!recipeIds.length) return [];
  return db
    .select()
    .from(cozyaCookingSessions)
    .where(
      and(
        eq(cozyaCookingSessions.userId, userId),
        inArray(cozyaCookingSessions.recipeId, recipeIds),
      ),
    );
}

export async function removeShoppingExtra(userId: string, id: string) {
  return db
    .delete(cozyaShoppingItems)
    .where(
      and(
        eq(cozyaShoppingItems.id, id),
        sql`${cozyaShoppingItems.key} LIKE 'manual:%'`,
        sql`${cozyaShoppingItems.listId} IN (SELECT ${cozyaShoppingLists.id} FROM ${cozyaShoppingLists} WHERE ${cozyaShoppingLists.userId} = ${userId})`,
      ),
    )
    .returning({ id: cozyaShoppingItems.id });
}

export async function updateCookingSession(
  userId: string,
  input: z.infer<typeof cookingInputSchema>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:cook:${userId}:${input.recipeId}`}))`,
    );
    const [recipe] = await tx
      .select()
      .from(cozyaRecipes)
      .where(and(eq(cozyaRecipes.id, input.recipeId), eq(cozyaRecipes.userId, userId)));
    if (!recipe) return null;
    const [previous] = await tx
      .select()
      .from(cozyaCookingSessions)
      .where(
        and(eq(cozyaCookingSessions.userId, userId), eq(cozyaCookingSessions.recipeId, recipe.id)),
      );
    const sameVersion = previous?.recipeVersion.getTime() === recipe.contentUpdatedAt.getTime();
    // A preparation finished on another day is history: today's first mark starts a new one.
    const finishedBefore = previous?.cookedAt ? localDay(previous.cookedAt) !== localDay() : false;
    const reset = !sameVersion || finishedBefore || input.operation.type === "reset";
    const servings =
      input.servings ?? (sameVersion ? previous?.servings : null) ?? recipe.servings ?? 2;
    const portionsChanged = previous?.servings !== servings;
    // Verdict and note are left out on purpose: they belong to the recipe, not to one preparation.
    const values = {
      userId,
      recipeId: recipe.id,
      recipeVersion: recipe.contentUpdatedAt,
      servings,
      checkedIngredients: reset || portionsChanged ? [] : (previous?.checkedIngredients ?? []),
      completedSteps: reset ? [] : (previous?.completedSteps ?? []),
      timerEndsAt: reset ? null : (previous?.timerEndsAt ?? null),
      cookedAt: reset ? null : (previous?.cookedAt ?? null),
      // History outlives the preparation: a new day's first mark must not erase it.
      lastCookedAt: previous?.lastCookedAt ?? null,
      updatedAt: new Date(),
    };
    const op = input.operation;
    if (op.type === "ingredient" || op.type === "step") {
      const count = (op.type === "ingredient" ? recipe.ingredients : recipe.preparation)
        .split(/\r?\n/)
        .filter((line) => line.trim()).length;
      if (op.index >= count) return null;
      const field = op.type === "ingredient" ? "checkedIngredients" : "completedSteps";
      values[field] = op.checked
        ? [...new Set([...values[field], op.index])]
        : values[field].filter((i) => i !== op.index);
    }
    if (op.type === "timer")
      values.timerEndsAt = op.minutes ? new Date(Date.now() + op.minutes * 60000) : null;
    if (op.type === "complete") {
      values.cookedAt ??= new Date();
      values.lastCookedAt = values.cookedAt;
    }
    const [session] = await tx
      .insert(cozyaCookingSessions)
      .values(values)
      .onConflictDoUpdate({
        target: [cozyaCookingSessions.userId, cozyaCookingSessions.recipeId],
        set: values,
      })
      .returning();
    return session ?? null;
  });
}

/** "Como foi?": one verdict and one note per recipe; the new note replaces the old one. */
export async function saveCookingFeedback(
  userId: string,
  input: z.infer<typeof cookingFeedbackSchema>,
) {
  const [session] = await db
    .update(cozyaCookingSessions)
    .set({
      verdict: input.verdict,
      note: input.note || null,
      notedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(cozyaCookingSessions.userId, userId),
        eq(cozyaCookingSessions.recipeId, input.recipeId),
      ),
    )
    .returning();
  return session ?? null;
}

/**
 * What the household did during the trial, for the "Sua semana continua aqui" page. Only the
 * trial counts: meals of its days, and lists, recipes and preparations from its start to its end.
 */
export async function getTrialSummary(userId: string, trial: { from: Date; to: Date }) {
  const firstDay = localDay(trial.from);
  const lastDay = localDay(trial.to);
  // Raw SQL parameters go as text; postgres-js does not serialize Date here.
  const from = trial.from.toISOString();
  const to = trial.to.toISOString();
  const [row] = await db.execute<{
    meals: number;
    lists: number;
    recipes: number;
    cooked: number;
  }>(sql`SELECT
      (SELECT count(*)::int FROM ${cozyaMeals} WHERE ${cozyaMeals.userId} = ${userId} AND ${cozyaMeals.recipeId} IS NOT NULL AND ${cozyaMeals.day} >= ${firstDay} AND ${cozyaMeals.day} <= ${lastDay}) AS meals,
      (SELECT count(DISTINCT ${cozyaShoppingLists.id})::int FROM ${cozyaShoppingLists} JOIN ${cozyaShoppingItems} ON ${cozyaShoppingItems.listId} = ${cozyaShoppingLists.id}
        WHERE ${cozyaShoppingLists.userId} = ${userId} AND ${cozyaShoppingLists.generatedAt} >= ${from}::timestamptz AND ${cozyaShoppingLists.generatedAt} < ${to}::timestamptz
          AND (${cozyaShoppingItems.state} = 'bought' OR (${cozyaShoppingItems.state} = 'have' AND ${cozyaShoppingItems.category} <> 'despensa'))) AS lists,
      (SELECT count(*)::int FROM ${cozyaRecipes} WHERE ${cozyaRecipes.userId} = ${userId} AND ${cozyaRecipes.createdAt} >= ${from}::timestamptz AND ${cozyaRecipes.createdAt} < ${to}::timestamptz) AS recipes,
      (SELECT count(*)::int FROM cozya.product_events WHERE user_id = ${userId} AND name = 'cooking_completed' AND occurred_at >= ${from}::timestamptz AND occurred_at < ${to}::timestamptz) AS cooked`);
  return {
    meals: Number(row?.meals ?? 0),
    lists: Number(row?.lists ?? 0),
    recipes: Number(row?.recipes ?? 0),
    cooked: Number(row?.cooked ?? 0),
  };
}

export async function addShoppingExtra(
  userId: string,
  input: { listId: string; name: string; amount: string },
) {
  return db.transaction(async (tx) => {
    const [list] = await tx
      .select()
      .from(cozyaShoppingLists)
      .where(and(eq(cozyaShoppingLists.id, input.listId), eq(cozyaShoppingLists.userId, userId)))
      .for("update");
    if (!list) return false;
    const [total] = await tx
      .select({ count: count() })
      .from(cozyaShoppingItems)
      .where(eq(cozyaShoppingItems.listId, list.id));
    if ((total?.count ?? 0) >= 500) return false;
    await tx.insert(cozyaShoppingItems).values({
      ...input,
      key: `manual:${crypto.randomUUID()}`,
      category: "outros",
      note: "Adicionado por você",
    });
    return true;
  });
}
