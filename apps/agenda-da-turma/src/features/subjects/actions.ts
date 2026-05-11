"use server";

import { action, err, ok } from "@/lib/action";
import { logAgendaAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  createSubjectInputSchema,
  deleteSubjectInputSchema,
  updateSubjectInputSchema,
} from "./schemas";
import { createSubject, deleteSubject, updateSubject } from "./service";

export const createSubjectAction = action
  .input(createSubjectInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "subjects-create", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await createSubject(userId, input);
    if (!result.ok) return err(result.error);

    logger.info(
      { userId, subjectId: result.value.id, turmaId: input.turmaId },
      "agenda.subject_created",
    );
    await logAgendaAuditEvent("agenda.subject_created", userId, {
      subjectId: result.value.id,
      turmaId: input.turmaId,
    });
    return ok({ id: result.value.id } as const);
  });

export const updateSubjectAction = action
  .input(updateSubjectInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "subjects-update", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await updateSubject(userId, input);
    if (!result.ok) return err(result.error);

    logger.info({ userId, subjectId: result.value.id }, "agenda.subject_updated");
    await logAgendaAuditEvent("agenda.subject_updated", userId, { subjectId: result.value.id });
    return ok({ id: result.value.id } as const);
  });

export const deleteSubjectAction = action
  .input(deleteSubjectInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "subjects-delete", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await deleteSubject(userId, input);
    if (!result.ok) return err(result.error);

    logger.info({ userId, subjectId: input.id }, "agenda.subject_deleted");
    await logAgendaAuditEvent("agenda.subject_deleted", userId, { subjectId: input.id });
    return ok({ id: input.id } as const);
  });
