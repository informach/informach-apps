import "server-only";
import { and, asc, count, db, eq, inArray, sql } from "@informach/db";
import {
  cozyaCookingSessions,
  cozyaMeals,
  cozyaRecipes,
  cozyaShoppingItems,
  cozyaShoppingLists,
} from "@informach/db/schema";
import type { z } from "zod";
import { addDays, weekStart } from "./dates";
import { consolidateShopping, parseIngredients } from "./ingredients";
import type { cookingInputSchema, mealSchema } from "./schemas";

export async function getWeekMeals(userId: string, week: string) {
  return db
    .select()
    .from(cozyaMeals)
    .where(
      and(
        eq(cozyaMeals.userId, userId),
        sql`${cozyaMeals.day} >= ${week} AND ${cozyaMeals.day} < ${addDays(week, 7)}`,
      ),
    )
    .orderBy(asc(cozyaMeals.day), asc(cozyaMeals.slot));
}

export async function getRecipeChoices(userId: string) {
  return db
    .select({ id: cozyaRecipes.id, name: cozyaRecipes.name, servings: cozyaRecipes.servings })
    .from(cozyaRecipes)
    .where(eq(cozyaRecipes.userId, userId))
    .orderBy(asc(cozyaRecipes.name));
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
        })),
      )
      .onConflictDoNothing()
      .returning({ id: cozyaMeals.id });
    return inserted.length;
  });
}

export async function getShoppingList(userId: string, week: string) {
  const [list] = await db
    .select()
    .from(cozyaShoppingLists)
    .where(and(eq(cozyaShoppingLists.userId, userId), eq(cozyaShoppingLists.week, week)));
  if (!list) return null;
  const items = await db
    .select()
    .from(cozyaShoppingItems)
    .where(eq(cozyaShoppingItems.listId, list.id))
    .orderBy(asc(cozyaShoppingItems.category), asc(cozyaShoppingItems.name));
  return { ...list, items };
}

export async function generateShoppingList(userId: string, week: string) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:week:${userId}:${week}`}))`,
    );
    const meals = await tx
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
      ? await tx
          .select()
          .from(cozyaRecipes)
          .where(and(eq(cozyaRecipes.userId, userId), inArray(cozyaRecipes.id, recipeIds)))
      : [];
    const lines = consolidateShopping(
      meals.flatMap((meal) => {
        const recipe = recipes.find((r) => r.id === meal.recipeId);
        return recipe
          ? [
              {
                recipeId: recipe.id,
                name: recipe.name,
                baseServings: recipe.servings,
                servings: meal.servings,
                ingredients: recipe.structuredIngredients ?? parseIngredients(recipe.ingredients),
              },
            ]
          : [];
      }),
    );
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
          const old = previous.find(
            (item) =>
              item.key === line.key && item.amount === line.amount && item.note === line.note,
          );
          return { ...line, listId: list.id, state: old?.state ?? "todo" };
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
    const reset = !sameVersion || input.operation.type === "reset";
    const servings =
      input.servings ?? (sameVersion ? previous?.servings : null) ?? recipe.servings ?? 2;
    const portionsChanged = previous?.servings !== servings;
    const values = {
      userId,
      recipeId: recipe.id,
      recipeVersion: recipe.contentUpdatedAt,
      servings,
      checkedIngredients: reset || portionsChanged ? [] : (previous?.checkedIngredients ?? []),
      completedSteps: reset ? [] : (previous?.completedSteps ?? []),
      timerEndsAt: reset ? null : (previous?.timerEndsAt ?? null),
      cookedAt: reset ? null : (previous?.cookedAt ?? null),
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
    if (op.type === "complete") values.cookedAt ??= new Date();
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
