"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agendaAuthority } from "@/features/family/context";
import { recordProductEvent } from "@/features/metrics/events";
import { action, err, ok } from "@/lib/action";
import { dismissFirstSteps } from "./first-steps-repository";

export const dismissFirstStepsAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "onboarding-dismiss-first-steps", max: 20, window: "1h" })
  .run(async ({ ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);
    await dismissFirstSteps(await agendaAuthority(userId));
    await recordProductEvent(userId, { event: "first_steps_dismissed" });
    revalidatePath("/dashboard", "page");
    return ok({ dismissed: true } as const);
  });
