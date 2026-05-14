"use server";

import { action, err, ok } from "@/lib/action";
import { logAgendaAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  createProfileSubjectInputSchema,
  deleteProfileSubjectInputSchema,
  setProfileSubjectStatusInputSchema,
  updateProfileSubjectInputSchema,
} from "./schemas";
import {
  createProfileSubject,
  deleteProfileSubject,
  setProfileSubjectStatusForUser,
  updateProfileSubject,
} from "./service";

export const createProfileSubjectAction = action
  .input(createProfileSubjectInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "profile-subjects-create", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await createProfileSubject(userId, input);
    if (!result.ok) return err(result.error);

    const subject = result.value;
    logger.info(
      { userId, subjectId: subject.id, profileId: input.profileId },
      "agenda.profile_subject_created",
    );
    await logAgendaAuditEvent("agenda.profile_subject_created", userId, {
      profileSubjectId: subject.id,
      profileId: input.profileId,
    });
    return ok({ id: subject.id } as const);
  });

export const updateProfileSubjectAction = action
  .input(updateProfileSubjectInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "profile-subjects-update", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await updateProfileSubject(userId, input);
    if (!result.ok) return err(result.error);

    logger.info({ userId, subjectId: result.value.id }, "agenda.profile_subject_updated");
    await logAgendaAuditEvent("agenda.profile_subject_updated", userId, {
      profileSubjectId: result.value.id,
    });
    return ok({ id: result.value.id } as const);
  });

export const deleteProfileSubjectAction = action
  .input(deleteProfileSubjectInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "profile-subjects-delete", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await deleteProfileSubject(userId, input);
    if (!result.ok) return err(result.error);

    logger.info({ userId, subjectId: input.id }, "agenda.profile_subject_deleted");
    await logAgendaAuditEvent("agenda.profile_subject_deleted", userId, {
      profileSubjectId: input.id,
    });
    return ok({ id: input.id } as const);
  });

export const setProfileSubjectStatusAction = action
  .input(setProfileSubjectStatusInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "profile-subjects-status", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await setProfileSubjectStatusForUser(userId, input);
    if (!result.ok) return err(result.error);

    if (result.value.previousStatus !== result.value.subject.status) {
      logger.info(
        {
          userId,
          subjectId: result.value.subject.id,
          from: result.value.previousStatus,
          to: result.value.subject.status,
        },
        "agenda.profile_subject_status_changed",
      );
      await logAgendaAuditEvent("agenda.profile_subject_status_changed", userId, {
        profileSubjectId: result.value.subject.id,
        from: result.value.previousStatus,
        to: result.value.subject.status,
        pausedAtIso: result.value.subject.pausedAt,
      });
    }
    return ok({
      id: result.value.subject.id,
      status: result.value.subject.status,
      pausedAt: result.value.subject.pausedAt,
    } as const);
  });
