"use server";

import { refreshActivityViews } from "@/features/unified-activities/revalidate";
import { action, err, ok } from "@/lib/action";
import { logAgendaAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { respondSharedActivityInputSchema } from "./schemas";
import { respondSharedActivity } from "./service";

export const respondSharedActivityAction = action
  .input(respondSharedActivityInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "activities-respond-shared", max: 100, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await respondSharedActivity(userId, input);
    if (!result.ok) return err(result.error);

    logger.info(
      { userId, activityId: result.value.activityId, accepted: result.value.accepted },
      "agenda.activity_shared_response",
    );
    await logAgendaAuditEvent("agenda.activity_shared_response", userId, {
      activityId: result.value.activityId,
      accepted: result.value.accepted,
    });
    refreshActivityViews();
    return ok({ activityId: result.value.activityId } as const);
  });
