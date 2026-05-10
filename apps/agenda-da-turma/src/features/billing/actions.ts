"use server";

import { CustomerNotFoundError } from "@informach/billing";
import { z } from "zod";
import { action, err, ok } from "@/lib/action";
import { env } from "@/lib/env";
import { billing } from "./service";

export const createBillingPortalSessionAction = action
  .input(z.object({}))
  .auth({ require: "user" })
  .rateLimit({ key: "billing-portal", max: 5, window: "5m" })
  .run(async ({ ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    try {
      const result = await billing.createPortalSession({
        subject: { type: "user", id: userId },
        returnUrl: `${env.NEXT_PUBLIC_APP_URL}/settings/billing`,
      });
      return ok({ url: result.url } as const);
    } catch (error) {
      if (error instanceof CustomerNotFoundError) {
        return err({ code: "NO_CUSTOMER" } as const);
      }
      throw error;
    }
  });
