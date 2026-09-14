"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, err } from "@/lib/action";
import { notificationPreferencesSchema, pushSubscriptionSchema } from "./schemas";
import { saveNotificationPreferences, subscribePush, unsubscribePush } from "./service";
export const saveNotificationPreferencesAction = action
  .input(notificationPreferencesSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "notification-preferences", max: 30, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await saveNotificationPreferences(ctx.actor.id, input);
    if (result.ok) revalidatePath("/familia", "layout");
    return result;
  });
export const subscribePushAction = action
  .input(pushSubscriptionSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "push-subscribe", max: 10, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    return subscribePush(ctx.actor.id, input);
  });
export const unsubscribePushAction = action
  .input(z.object({ endpoint: z.string().max(2000) }))
  .auth({ require: "user" })
  .rateLimit({ key: "push-unsubscribe", max: 30, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    return unsubscribePush(ctx.actor.id, input.endpoint);
  });
