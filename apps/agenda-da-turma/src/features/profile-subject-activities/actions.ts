"use server";

import { refresh } from "next/cache";
import { action, err, ok } from "@/lib/action";
import { logAgendaAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  createProfileSubjectActivityInputSchema,
  deleteProfileSubjectActivityInputSchema,
  setProfileSubjectActivityStatusInputSchema,
  updateProfileSubjectActivityInputSchema,
} from "./schemas";
import {
  createProfileSubjectActivity,
  deleteProfileSubjectActivity,
  setProfileSubjectActivityStatusForUser,
  updateProfileSubjectActivity,
} from "./service";

export const createProfileSubjectActivityAction = action
  .input(createProfileSubjectActivityInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "profile-subject-activities-create", max: 100, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await createProfileSubjectActivity(userId, input);
    if (!result.ok) return err(result.error);

    logger.info(
      {
        userId,
        activityId: result.value.id,
        profileSubjectId: input.profileSubjectId,
      },
      "agenda.profile_subject_activity_created",
    );
    await logAgendaAuditEvent("agenda.profile_subject_activity_created", userId, {
      profileSubjectActivityId: result.value.id,
      profileSubjectId: input.profileSubjectId,
    });
    refresh();
    return ok({ id: result.value.id } as const);
  });

export const updateProfileSubjectActivityAction = action
  .input(updateProfileSubjectActivityInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "profile-subject-activities-update", max: 100, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await updateProfileSubjectActivity(userId, input);
    if (!result.ok) return err(result.error);

    logger.info({ userId, activityId: result.value.id }, "agenda.profile_subject_activity_updated");
    await logAgendaAuditEvent("agenda.profile_subject_activity_updated", userId, {
      profileSubjectActivityId: result.value.id,
    });
    refresh();
    return ok({ id: result.value.id } as const);
  });

export const deleteProfileSubjectActivityAction = action
  .input(deleteProfileSubjectActivityInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "profile-subject-activities-delete", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await deleteProfileSubjectActivity(userId, input);
    if (!result.ok) return err(result.error);

    logger.info({ userId, activityId: input.id }, "agenda.profile_subject_activity_deleted");
    await logAgendaAuditEvent("agenda.profile_subject_activity_deleted", userId, {
      profileSubjectActivityId: input.id,
    });
    refresh();
    return ok({ id: input.id } as const);
  });

export const setProfileSubjectActivityStatusAction = action
  .input(setProfileSubjectActivityStatusInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "profile-subject-activities-status", max: 200, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await setProfileSubjectActivityStatusForUser(userId, input);
    if (!result.ok) return err(result.error);

    logger.info(
      { userId, activityId: input.id, status: input.status },
      "agenda.profile_subject_activity_status_set",
    );
    await logAgendaAuditEvent("agenda.profile_subject_activity_status_set", userId, {
      profileSubjectActivityId: input.id,
      status: input.status,
    });
    refresh();
    return ok({ id: input.id, status: input.status } as const);
  });
