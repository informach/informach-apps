"use server";

import { action, err, ok } from "@/lib/action";
import { logAgendaAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  createSubjectInputSchema,
  createSubjectsBatchInputSchema,
  deleteSubjectInputSchema,
  updateSubjectInputSchema,
} from "./schemas";
import { createSubject, createSubjectsBatch, deleteSubject, updateSubject } from "./service";

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

/**
 * Insere N matérias na mesma turma numa única chamada. Consumido pelo
 * fluxo de IA (voz/imagem) após o usuário confirmar/editar a lista
 * detectada. Pro gating do recurso de IA fica no route handler que
 * gera a lista — esta action só requer ser membro da turma.
 *
 * Rate limit conservador (20/h) — usuário típico bate 1 vez quando
 * cadastra a turma; 20/h cobre erros e re-tentativas sem virar vetor de
 * script abusivo.
 */
export const createSubjectsBatchAction = action
  .input(createSubjectsBatchInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "subjects-batch-create", max: 20, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await createSubjectsBatch(userId, input);
    if (!result.ok) return err(result.error);

    const { items, counts, turmaId } = result.value;
    logger.info({ userId, turmaId, ...counts }, "agenda.subjects_batch_created");
    // Single audit event com counts em metadata em vez de N events. Reusa
    // o event-type existente para não exigir mudança no AuditEventType union.
    await logAgendaAuditEvent("agenda.subject_created", userId, {
      turmaId,
      batch: counts,
    });
    return ok({ items, counts, turmaId } as const);
  });
