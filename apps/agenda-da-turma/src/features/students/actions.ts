"use server";

import { action, err, ok } from "@/lib/action";
import { logAgendaAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  createStudentProfileInputSchema,
  deleteStudentProfileInputSchema,
  updateStudentProfileInputSchema,
} from "./schemas";
import { createStudentProfile, deleteStudentProfile, updateStudentProfile } from "./service";

export const createStudentProfileAction = action
  .input(createStudentProfileInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "students-create", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await createStudentProfile(userId, input);
    if (!result.ok) return err(result.error);

    logger.info({ userId, profileId: result.value.id }, "agenda.student_profile_created");
    await logAgendaAuditEvent("agenda.student_profile_created", userId, {
      profileId: result.value.id,
    });
    return ok({ id: result.value.id } as const);
  });

export const updateStudentProfileAction = action
  .input(updateStudentProfileInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "students-update", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const { id, ...rest } = input;
    const result = await updateStudentProfile(userId, id, rest);
    if (!result.ok) return err(result.error);

    logger.info({ userId, profileId: result.value.id }, "agenda.student_profile_updated");
    await logAgendaAuditEvent("agenda.student_profile_updated", userId, {
      profileId: result.value.id,
    });
    return ok({ id: result.value.id } as const);
  });

export const deleteStudentProfileAction = action
  .input(deleteStudentProfileInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "students-delete", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await deleteStudentProfile(userId, input.id);
    if (!result.ok) return err(result.error);

    logger.info({ userId, profileId: input.id }, "agenda.student_profile_deleted");
    await logAgendaAuditEvent("agenda.student_profile_deleted", userId, { profileId: input.id });
    return ok({ id: input.id } as const);
  });
