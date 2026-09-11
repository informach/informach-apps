"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { action, err, ok } from "@/lib/action";
import { requireUserServer } from "@/lib/auth";
import { getKitchenAccess, startKitchenTrial } from "./access";
import { weekStart } from "./dates";
import { recordProductEvent } from "./events";
import {
  addShoppingExtra,
  generateShoppingList,
  getWeekMeals,
  removeMeal,
  removeShoppingExtra,
  repeatWeek,
  saveMeal,
  setShoppingItemState,
  updateCookingSession,
} from "./repository";
import { cookingInputSchema, mealSchema, weekSchema } from "./schemas";

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

export const saveMealAction = action
  .input(mealSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "meals-write", max: 120, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    if (!(await getKitchenAccess(userId)).canPlan)
      return err({ code: "SUBSCRIPTION_REQUIRED" } as const);
    if (!(await saveMeal(userId, input))) return err({ code: "NOT_FOUND" } as const);
    const week = weekStart(input.day);
    if ((await getWeekMeals(userId, week)).length >= 3)
      await recordProductEvent(userId, "plan_completed", week);
    refresh();
    return ok(true);
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
