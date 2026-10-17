"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { recipeInputSchema } from "@/features/recipes/schemas";
import { createRecipe } from "@/features/recipes/service";
import { action, err, ok } from "@/lib/action";
import { requireUserServer } from "@/lib/auth";
import { getKitchenAccess, startKitchenTrial } from "./access";
import { addDays, localDay, weekStart } from "./dates";
import { recordProductEvent } from "./events";
import {
  addShoppingExtra,
  generateShoppingList,
  getRecipeChoices,
  getRecipesByIds,
  getWeekMeals,
  hasAnyMeal,
  removeMeal,
  removeShoppingExtra,
  repeatWeek,
  saveCookingFeedback,
  saveMeal,
  setShoppingItemState,
  updateCookingSession,
  withAccountLock,
} from "./repository";
import { cookingFeedbackSchema, cookingInputSchema, mealSchema, weekSchema } from "./schemas";
import { STARTER_RECIPES } from "./starter-recipes";

export const startTrialAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "trial-start", max: 5, window: "1h" })
  .run(async () => {
    const user = await requireUserServer();
    const result = await startKitchenTrial(user);
    if (!result.ok) return err({ code: result.code });
    refresh();
    return ok(true);
  });

/**
 * Planning is the first useful gesture, so the first meal with a recipe opens the 14-day trial
 * on its own when the account never had one. A meal without a recipe ("Sobras", "Comer fora")
 * never spends it. The trial rules stay in `startKitchenTrial`: verified e-mail, once.
 */
async function ensurePlanning(userId: string, withRecipe: boolean) {
  const access = await getKitchenAccess(userId);
  if (access.canPlan) return { ok: true } as const;
  if (access.isPro || access.profile?.trialStartedAt)
    return { ok: false, code: "SUBSCRIPTION_REQUIRED" } as const;
  if (!withRecipe) return { ok: true } as const;
  const result = await startKitchenTrial(await requireUserServer());
  return result.ok ? ({ ok: true } as const) : ({ ok: false, code: result.code } as const);
}

async function recordPlanProgress(userId: string, days: string[]) {
  for (const week of new Set(days.map((day) => weekStart(day))))
    if ((await getWeekMeals(userId, week)).length >= 3)
      await recordProductEvent(userId, "plan_completed", week);
}

export const saveMealAction = action
  .input(mealSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "meals-write", max: 120, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    // Someone else's recipe is refused before it can open this account's trial.
    if (input.recipeId && !(await getRecipesByIds(userId, [input.recipeId])).length)
      return err({ code: "NOT_FOUND" } as const);
    const access = await ensurePlanning(userId, !!input.recipeId);
    if (!access.ok) return err({ code: access.code });
    if (!(await saveMeal(userId, input))) return err({ code: "NOT_FOUND" } as const);
    await recordPlanProgress(userId, [input.day]);
    refresh();
    return ok(true);
  });

/** First access: put the chosen recipes (own or starter drafts) on the next free dinners. */
export const planFirstWeekAction = action
  .input(
    z
      .object({
        starters: z.array(z.number().int().min(0).max(20)).max(4),
        recipeIds: z.array(z.string().uuid()).max(4),
      })
      .refine(
        (input) => input.starters.length + input.recipeIds.length >= 1,
        "Escolha ao menos uma receita",
      )
      .refine((input) => input.starters.length + input.recipeIds.length <= 4),
  )
  .auth({ require: "user" })
  .rateLimit({ key: "meals-first-week", max: 10, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    return withAccountLock(userId, "first-week", () => planFirstWeek(userId, input));
  });

async function planFirstWeek(userId: string, input: { starters: number[]; recipeIds: string[] }) {
  // A second tap or a retry finds the week already planned and leaves it as it is.
  if (await hasAnyMeal(userId)) return ok({ planned: 0 });
  const access = await ensurePlanning(userId, true);
  if (!access.ok) return err({ code: access.code });
  const starters = [...new Set(input.starters)].flatMap((index) => {
    const recipe = STARTER_RECIPES[index];
    return recipe ? [recipe] : [];
  });
  const owned = await getRecipeChoices(userId);
  // Only recipes of this household; foreign ids are ignored, never planned.
  const recipes: { id: string }[] = owned.filter((recipe) => input.recipeIds.includes(recipe.id));
  for (const starter of starters) {
    // A retried request finds the copy it already saved instead of duplicating it.
    const existing = owned.find((recipe) => recipe.name === starter.name);
    if (existing) {
      recipes.push(existing);
      continue;
    }
    const created = await createRecipe(userId, recipeInputSchema.parse(starter));
    if (!created.ok) return err({ code: created.error.code } as const);
    recipes.push(created.value);
  }
  // The account has no meals yet, so the dinners go on today and the days right after it.
  const household = (await getKitchenAccess(userId)).profile?.householdSize ?? 2;
  const days = recipes.map((_, index) => addDays(localDay(), index));
  for (const [index, recipe] of recipes.entries())
    await saveMeal(userId, {
      day: days[index] ?? localDay(),
      slot: "dinner",
      recipeId: recipe.id,
      label: "",
      servings: household,
      lunchboxServings: 0,
    });
  await recordPlanProgress(userId, days);
  refresh();
  return ok({ planned: recipes.length });
}

export const removeMealAction = action
  .input(z.object({ id: z.string().uuid() }))
  .auth({ require: "user" })
  .rateLimit({ key: "meals-remove", max: 120, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    // Removal of existing personal data stays available after trial/subscription expiry.
    await removeMeal(userId, input.id);
    refresh();
    return ok(true);
  });

export const repeatWeekAction = action
  .input(z.object({ week: weekSchema }))
  .auth({ require: "user" })
  .rateLimit({ key: "meals-repeat", max: 15, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    if (!(await getKitchenAccess(userId)).canPlan)
      return err({ code: "SUBSCRIPTION_REQUIRED" } as const);
    const count = await repeatWeek(userId, input.week);
    if (count) await recordProductEvent(userId, "plan_repeated", input.week);
    refresh();
    return ok(count);
  });

export const generateShoppingAction = action
  .input(z.object({ week: weekSchema }))
  .auth({ require: "user" })
  .rateLimit({ key: "shopping-generate", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    if (!(await getKitchenAccess(userId)).canPlan)
      return err({ code: "SUBSCRIPTION_REQUIRED" } as const);
    const id = await generateShoppingList(userId, input.week);
    await recordProductEvent(userId, "shopping_created", input.week);
    refresh();
    return ok({ id });
  });

export const setShoppingStateAction = action
  .input(z.object({ id: z.string().uuid(), state: z.enum(["todo", "have", "bought"]) }))
  .auth({ require: "user" })
  .rateLimit({ key: "shopping-check", max: 600, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    const rows = await setShoppingItemState(userId, input.id, input.state);
    if (!rows.length) return err({ code: "NOT_FOUND" } as const);
    if (input.state !== "todo") await recordProductEvent(userId, "shopping_used", input.id);
    refresh();
    return ok(true);
  });

export const cookingAction = action
  .input(cookingInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "cooking-progress", max: 600, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    const session = await updateCookingSession(userId, input);
    if (!session) return err({ code: "NOT_FOUND" } as const);
    await recordProductEvent(userId, "cooking_started", session.id);
    if (session.cookedAt)
      await recordProductEvent(
        userId,
        "cooking_completed",
        `${session.id}:${session.cookedAt.toISOString()}`,
      );
    return ok(session);
  });

export const cookingFeedbackAction = action
  .input(cookingFeedbackSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "cooking-feedback", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    const session = await saveCookingFeedback(userId, input);
    if (!session) return err({ code: "NOT_FOUND" } as const);
    await recordProductEvent(userId, "cooking_feedback", `${session.id}:${localDay()}`);
    refresh();
    return ok(true);
  });

export const addShoppingExtraAction = action
  .input(
    z.object({
      listId: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      amount: z.string().trim().min(1).max(80),
    }),
  )
  .auth({ require: "user" })
  .rateLimit({ key: "shopping-extra", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    const added = await addShoppingExtra(userId, input);
    if (!added) return err({ code: "LIST_UNAVAILABLE" } as const);
    refresh();
    return ok(true);
  });

export const removeShoppingExtraAction = action
  .input(z.object({ id: z.string().uuid() }))
  .auth({ require: "user" })
  .rateLimit({ key: "shopping-extra-remove", max: 120, window: "1h" })
  .run(async ({ input, ctx }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    if (!(await removeShoppingExtra(ctx.actor.id, input.id)).length)
      return err({ code: "NOT_FOUND" } as const);
    refresh();
    return ok(true);
  });
