"use server";

import { action, err, ok } from "@/lib/action";
import { logAgendaAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  createActivitiesBatchInputSchema,
  createActivityInputSchema,
  deleteActivityInputSchema,
  respondSharedActivityInputSchema,
  setActivityStatusInputSchema,
  updateActivityInputSchema,
} from "./schemas";
import {
  createActivitiesBatch,
  createActivity,
  deleteActivity,
  respondSharedActivity,
  setActivityStatus,
  updateActivity,
} from "./service";

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
    return ok({ id: input.id } as const);
  });

export const setActivityStatusAction = action
  .input(setActivityStatusInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "activities-status", max: 300, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await setActivityStatus(userId, input);
    if (!result.ok) return err(result.error);

    logger.info(
      { userId, activityId: input.activityId, status: input.status },
      "agenda.activity_status_set",
    );
    await logAgendaAuditEvent("agenda.activity_status_set", userId, {
      activityId: input.activityId,
      statusId: result.value.statusId,
      studentProfileId: input.studentProfileId,
      status: input.status,
    });
    return ok({ statusId: result.value.statusId } as const);
  });

/**
 * Insere N atividades de uma vez — consumido pelo batch confirm dialog
 * após o fluxo de IA (voz/imagem). Pro-only enforced no service
 * (defesa em profundidade — UI já desabilita pra Free, route handler de IA
 * já recusa, e o service refaz a checagem). Audit emite single event com
 * `count` em metadata em vez de N events.
 */
export const createActivitiesBatchAction = action
  .input(createActivitiesBatchInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "activities-batch-create", max: 20, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await createActivitiesBatch(userId, input);
    if (!result.ok) return err(result.error);

    const { activities } = result.value;
    logger.info(
      { userId, count: activities.length, visibility: input.visibility },
      "agenda.activities_batch_created",
    );
    await logAgendaAuditEvent("agenda.activity_created", userId, {
      batch: { count: activities.length, visibility: input.visibility },
    });
    return ok({
      activityIds: activities.map((a) => a.id),
      count: activities.length,
    } as const);
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
    return ok({ activityId: result.value.activityId } as const);
  });
