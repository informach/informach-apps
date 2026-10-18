"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordProductEvent } from "@/features/metrics/events";
import { action, err, ok } from "@/lib/action";
import { dismissFirstSteps } from "./first-steps-repository";
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

export const dismissFirstStepsAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "onboarding-dismiss-first-steps", max: 20, window: "1h" })
  .run(async ({ ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    await dismissFirstSteps(userId);
    await recordProductEvent(userId, { event: "first_steps_dismissed" });
    revalidatePath("/dashboard", "page");
    return ok({ dismissed: true } as const);
  });
