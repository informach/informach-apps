import "server-only";
import { and, asc, db, eq, sql } from "@informach/db";
import { cozyaMeals, cozyaProductEvents, cozyaProfiles, cozyaRecipes } from "@informach/db/schema";
import { requireFamilyCondition } from "@informach/family";
import { cozyaAccessInTransaction } from "@/features/billing/access-repository";
import type { CozyaAuthority } from "@/features/family/authority";
import { recipePayload } from "@/features/recipes/payload";
import { insertRecipeForAccessInTransaction } from "@/features/recipes/repository";
import { recipeInputSchema } from "@/features/recipes/schemas";
import { addDays, localDay, weekStart } from "./dates";
import { firstWeekDays } from "./first-week-days";
import { saveMealInTransaction } from "./repository";
import { STARTER_RECIPES } from "./starter-recipes";

/** Copies and meals are one transaction, including the family's current coverage. */
export function planFirstWeekForActor(
  actor: CozyaAuthority,
  input: { starters: number[]; recipeIds: string[] },
) {
  return db.transaction(async (tx) => {
    const access = await cozyaAccessInTransaction(tx, actor);
    const userId = actor.userId;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cozya:first-week:${userId}`}))`);
    const today = localDay();
    const [existing] = await tx
      .select({ day: cozyaMeals.day })
      .from(cozyaMeals)
      .where(eq(cozyaMeals.userId, userId))
      .limit(1);
    if (existing) {
      const [upcoming] = await tx
        .select({ day: cozyaMeals.day })
        .from(cozyaMeals)
        .where(
          and(
            eq(cozyaMeals.userId, userId),
            sql`${cozyaMeals.day} >= ${today} AND ${cozyaMeals.day} < ${addDays(today, 14)}`,
          ),
        )
        .orderBy(asc(cozyaMeals.day))
        .limit(1);
      const start = upcoming?.day ?? today;
      return { ok: true as const, planned: 0, start, week: weekStart(start) };
    }
    if (!access.enabled) return { ok: false as const, code: "SUBSCRIPTION_REQUIRED" as const };
    const owned = await tx
      .select({ id: cozyaRecipes.id, name: cozyaRecipes.name })
      .from(cozyaRecipes)
      .where(eq(cozyaRecipes.userId, userId));
    const ids = [...new Set(input.recipeIds)];
    if (ids.some((id) => !owned.some((recipe) => recipe.id === id)))
      return { ok: false as const, code: "NOT_FOUND" as const };
    const starters = [...new Set(input.starters)].map((index) => STARTER_RECIPES[index]);
    if (starters.some((starter) => !starter))
      return { ok: false as const, code: "NOT_FOUND" as const };
    const recipes = owned.filter((recipe) => ids.includes(recipe.id));
    for (const starter of starters) {
      requireFamilyCondition(starter, "INVALID_INPUT");
      const existingRecipe = owned.find((recipe) => recipe.name === starter.name);
      if (existingRecipe) {
        if (!recipes.some((recipe) => recipe.id === existingRecipe.id))
          recipes.push(existingRecipe);
        continue;
      }
      const saved = await insertRecipeForAccessInTransaction(
        tx,
        actor,
        recipePayload(userId, recipeInputSchema.parse(starter)),
      );
      requireFamilyCondition(saved.ok, "CONFLICT", "A cobertura mudou durante o planejamento.");
      recipes.push(saved.recipe);
      await tx
        .insert(cozyaProductEvents)
        .values({
          userId,
          name: "recipe_saved",
          dedupKey: `${userId}:recipe_saved:${saved.recipe.id}`,
        })
        .onConflictDoNothing();
    }
    requireFamilyCondition(recipes.length >= 1 && recipes.length <= 4, "INVALID_INPUT");
    const [profile] = await tx
      .select({ householdSize: cozyaProfiles.householdSize })
      .from(cozyaProfiles)
      .where(eq(cozyaProfiles.userId, userId));
    const days = firstWeekDays(today, recipes.length);
    for (const [index, recipe] of recipes.entries()) {
      const day = days[index];
      requireFamilyCondition(day, "INVALID_INPUT");
      requireFamilyCondition(
        await saveMealInTransaction(tx, actor, {
          day,
          slot: "dinner",
          recipeId: recipe.id,
          label: "",
          servings: profile?.householdSize ?? 2,
          lunchboxServings: 0,
        }),
        "CONFLICT",
      );
    }
    if (recipes.length >= 3) {
      for (const week of new Set(days.map((day) => weekStart(day)))) {
        await tx
          .insert(cozyaProductEvents)
          .values({ userId, name: "plan_completed", dedupKey: `${userId}:plan_completed:${week}` })
          .onConflictDoNothing();
      }
    }
    const start = days[0] ?? today;
    return { ok: true as const, planned: recipes.length, start, week: weekStart(start) };
  });
}
