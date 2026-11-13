"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agendaAuthority } from "@/features/family/context";
import { action, err } from "@/lib/action";
import { createCalendarFeed, revokeCalendarFeeds } from "./service";
export const createCalendarFeedAction = action
  .input(z.object({ familyGroupId: z.uuid() }))
  .auth({ require: "user" })
  .rateLimit({ key: "feed-create", max: 5, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const actor = await agendaAuthority(ctx.actor.id);
    if (actor.familyGroupId !== input.familyGroupId)
      return err({ code: "CONTEXT_CHANGED" } as const);
    const result = await createCalendarFeed(actor);
    if (result.ok) revalidatePath("/familia", "layout");
    return result;
  });
export const revokeCalendarFeedAction = action
  .input(z.object({ familyGroupId: z.uuid() }))
  .auth({ require: "user" })
  .rateLimit({ key: "feed-revoke", max: 10, window: "1h" })
  .run(async ({ ctx, input }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    const actor = await agendaAuthority(ctx.actor.id);
    if (actor.familyGroupId !== input.familyGroupId)
      return err({ code: "CONTEXT_CHANGED" } as const);
    const result = await revokeCalendarFeeds(actor);
    revalidatePath("/familia", "layout");
    return result;
  });
