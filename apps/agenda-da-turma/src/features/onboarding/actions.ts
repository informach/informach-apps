"use server";

import { z } from "zod";
import { action, err, ok } from "@/lib/action";
import { proCheckoutSchema } from "./schemas";
import { startProCheckout } from "./service";

export const startProCheckoutAction = action
  .input(proCheckoutSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "onboarding-pro-checkout", max: 5, window: "5m" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await startProCheckout({ userId, cycle: input.cycle });
    if (!result.ok) return err(result.error);
    return ok(result.value);
  });

export const selectFreePlanAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "onboarding-select-free", max: 10, window: "5m" })
  .run(async () => {
    return ok({ redirectTo: "/dashboard" } as const);
  });
