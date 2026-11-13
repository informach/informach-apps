"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, err, ok } from "@/lib/action";
import { getKitchenAccess } from "./access";
import { localDay, weekStart } from "./dates";
import { recordProductEvent } from "./events";
import { planFirstWeekForActor } from "./first-week-repository";
import {
  addShoppingExtra,
  generateShoppingList,
  getRecipesByIds,
  getWeekMeals,
  removeMeal,
  removeShoppingExtra,
  repeatWeek,
  saveCookingFeedback,
  saveMeal,
  setShoppingItemState,
  updateCookingSession,
} from "./repository";
import { cookingFeedbackSchema, cookingInputSchema, mealSchema, weekSchema } from "./schemas";

/** Trial activation is explicit and shared, in Minha conta. */
async function ensurePlanning(userId: string, withRecipe: boolean) {
  const access = await getKitchenAccess(userId);
  return access.canPlan || !withRecipe
    ? { ok: true as const, actor: access.actor }
    : { ok: false as const, code: "SUBSCRIPTION_REQUIRED" as const };
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
    // Someone else's recipe is refused before checking this family's coverage.
    if (input.recipeId && !(await getRecipesByIds(userId, [input.recipeId])).length)
      return err({ code: "NOT_FOUND" } as const);
    const access = await ensurePlanning(userId, !!input.recipeId);
    if (!access.ok) return err({ code: access.code });
    if (!(await saveMeal(access.actor, input))) return err({ code: "NOT_FOUND" } as const);
    await recordPlanProgress(userId, [input.day]);
    refresh();
    return ok(true);
  });

/**
 * First access: put the chosen recipes (own or starter drafts) on dinners that fit one shopping
 * list, and answer the week to open next: step 2 is that week, step 3 its list.
 */
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
    const access = await getKitchenAccess(userId);
    const result = await planFirstWeekForActor(access.actor, input);
    if (!result.ok) return err({ code: result.code });
    refresh();
    return ok({ planned: result.planned, start: result.start, week: result.week });
  });

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
    const access = await getKitchenAccess(userId);
    if (!access.canPlan) return err({ code: "SUBSCRIPTION_REQUIRED" } as const);
    const count = await repeatWeek(access.actor, input.week);
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
    const access = await getKitchenAccess(userId);
    if (!access.canPlan) return err({ code: "SUBSCRIPTION_REQUIRED" } as const);
    const id = await generateShoppingList(access.actor, input.week);
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
