"use server";
import { z } from "zod";
import { action, ok } from "@/lib/action";
import { localDay } from "./dates";
import { recordProductEvent } from "./events";
export const recordOfferSeenAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "offer-seen", max: 30, window: "1h" })
  .run(async ({ ctx }) => {
    if (ctx.actor?.id) await recordProductEvent(ctx.actor.id, "offer_seen", localDay());
    return ok(true);
  });

/** Sent from the browser so link prefetching never counts as a visit. One per day. */
export const recordTodayViewedAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "today-viewed", max: 60, window: "1h" })
  .run(async ({ ctx }) => {
    if (ctx.actor?.id) await recordProductEvent(ctx.actor.id, "today_viewed", localDay());
    return ok(true);
  });

export const recordListSharedAction = action
  .input(z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
  .auth({ require: "user" })
  .rateLimit({ key: "list-shared", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    if (ctx.actor?.id)
      await recordProductEvent(ctx.actor.id, "list_shared", `${input.week}:${localDay()}`);
    return ok(true);
  });
