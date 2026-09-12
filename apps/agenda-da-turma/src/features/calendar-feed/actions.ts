"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, err } from "@/lib/action";
import { createCalendarFeed, revokeCalendarFeeds } from "./service";
export const createCalendarFeedAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "feed-create", max: 5, window: "1h" })
  .run(async ({ ctx }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await createCalendarFeed(ctx.actor.id);
    if (result.ok) revalidatePath("/familia");
    return result;
  });
export const revokeCalendarFeedAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "feed-revoke", max: 10, window: "1h" })
  .run(async ({ ctx }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const result = await revokeCalendarFeeds(ctx.actor.id);
    revalidatePath("/familia");
    return result;
  });
