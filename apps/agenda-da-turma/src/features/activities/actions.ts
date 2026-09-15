"use server";

import { refreshActivityViews } from "@/features/unified-activities/revalidate";
import { action, err, ok } from "@/lib/action";
import { logAgendaAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  createActivityInputSchema,
  deleteActivityInputSchema,
  respondSharedActivityInputSchema,
  updateActivityInputSchema,
} from "./schemas";
import { createActivity, deleteActivity, respondSharedActivity, updateActivity } from "./service";

export const createActivityAction = action
  .input(createActivityInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "activities-create", max: 100, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await createActivity(userId, input);
    if (!result.ok) return err(result.error);

    logger.info(
      {
        userId,
        activityId: result.value.id,
        turmaId: input.turmaId,
        type: input.type,
        visibility: result.value.visibility,
      },
      "agenda.activity_created",
    );
    await logAgendaAuditEvent("agenda.activity_created", userId, {
      activityId: result.value.id,
      turmaId: input.turmaId,
      subjectId: input.subjectId,
      type: input.type,
      visibility: result.value.visibility,
    });
    refreshActivityViews();
    return ok({ id: result.value.id } as const);
  });

export const updateActivityAction = action
  .input(updateActivityInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "activities-update", max: 100, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await updateActivity(userId, input);
    if (!result.ok) return err(result.error);

    logger.info({ userId, activityId: result.value.id }, "agenda.activity_updated");
    await logAgendaAuditEvent("agenda.activity_updated", userId, { activityId: result.value.id });
    refreshActivityViews();
    return ok({ id: result.value.id } as const);
  });

export const deleteActivityAction = action
  .input(deleteActivityInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "activities-delete", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await deleteActivity(userId, input);
    if (!result.ok) return err(result.error);

    logger.info({ userId, activityId: input.id }, "agenda.activity_deleted");
    await logAgendaAuditEvent("agenda.activity_deleted", userId, { activityId: input.id });
    refreshActivityViews();
    return ok({ id: input.id } as const);
  });

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
