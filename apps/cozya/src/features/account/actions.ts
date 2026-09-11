"use server";
import { refresh } from "next/cache";
import { z } from "zod";
import { action, err, ok } from "@/lib/action";
import { saveCulinaryProfile } from "./repository";
import { eraseCozyaDataForCurrentUser } from "./service";

export const saveProfileAction = action
  .input(
    z.object({
      householdSize: z.number().int().min(1).max(20),
      preferences: z.string().trim().max(1000),
    }),
  )
  .auth({ require: "user" })
  .rateLimit({ key: "profile-update", max: 20, window: "1h" })
  .run(async ({ input, ctx }) => {
    if (!ctx.actor?.id) return err({ code: "UNAUTHORIZED" } as const);
    await saveCulinaryProfile(ctx.actor.id, input);
    refresh();
    return ok(true);
  });

export const clearDataAction = action
  .input(z.object({ confirmation: z.literal("APAGAR") }))
  .auth({ require: "user" })
  .rateLimit({ key: "account-clear", max: 3, window: "1h" })
  .run(async () => {
    const result = await eraseCozyaDataForCurrentUser();
    if (!result.ok) return err({ code: result.code });
    refresh();
    return ok(true);
  });
