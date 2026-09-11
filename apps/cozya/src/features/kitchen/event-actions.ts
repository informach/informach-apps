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
