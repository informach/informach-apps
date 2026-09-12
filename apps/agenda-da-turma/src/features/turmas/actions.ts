"use server";

import { action, err, ok } from "@/lib/action";
import { logAgendaAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  createTurmaInputSchema,
  deleteTurmaInputSchema,
  joinByCodeInputSchema,
  leaveTurmaInputSchema,
  setActiveTurmaInputSchema,
  updateTurmaInputSchema,
} from "./schemas";
import {
  createOrJoinTurma,
  deleteTurma,
  joinTurmaByCode,
  leaveTurma,
  setActiveTurma,
  updateTurma,
} from "./service";

export const createOrJoinTurmaAction = action
  .input(createTurmaInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "turmas-create", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await createOrJoinTurma(userId, input);
    if (!result.ok) return err(result.error);

    logger.info(
      {
        userId,
        turmaId: result.value.turma.id,
        created: result.value.created,
        profileId: input.profileId,
      },
      "agenda.turma_created_or_joined",
    );
    await logAgendaAuditEvent("agenda.turma_created_or_joined", userId, {
      turmaId: result.value.turma.id,
      created: result.value.created,
      profileId: input.profileId,
    });
    return ok({
      turmaId: result.value.turma.id,
      code: result.value.turma.code,
      created: result.value.created,
    } as const);
  });

export const joinTurmaByCodeAction = action
  .input(joinByCodeInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "turmas-join-code", max: 12, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await joinTurmaByCode(userId, input);
    if (!result.ok) return err(result.error);

    logger.info(
      { userId, turmaId: result.value.turma.id, profileId: input.profileId },
      "agenda.turma_joined_by_code",
    );
    await logAgendaAuditEvent("agenda.turma_joined_by_code", userId, {
      turmaId: result.value.turma.id,
      profileId: input.profileId,
    });
    return ok({ turmaId: result.value.turma.id } as const);
  });

export const setActiveTurmaAction = action
  .input(setActiveTurmaInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "turmas-set-active", max: 60, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await setActiveTurma(userId, input);
    if (!result.ok) return err(result.error);

    logger.info(
      { userId, turmaId: input.turmaId, profileId: input.profileId },
      "agenda.turma_set_active",
    );
    await logAgendaAuditEvent("agenda.turma_set_active", userId, {
      turmaId: input.turmaId,
      profileId: input.profileId,
    });
    return ok({ ok: true } as const);
  });

export const leaveTurmaAction = action
  .input(leaveTurmaInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "turmas-leave", max: 30, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await leaveTurma(userId, input);
    if (!result.ok) return err(result.error);

    logger.info(
      { userId, turmaId: input.turmaId, profileId: input.profileId },
      "agenda.turma_left",
    );
    await logAgendaAuditEvent("agenda.turma_left", userId, {
      turmaId: input.turmaId,
      profileId: input.profileId,
    });
    return ok({ ok: true } as const);
  });

export const deleteTurmaAction = action
  .input(deleteTurmaInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "turmas-delete", max: 10, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await deleteTurma(userId, input);
    if (!result.ok) return err(result.error);

    logger.info({ userId, turmaId: input.turmaId }, "agenda.turma_deleted");
    await logAgendaAuditEvent("agenda.turma_deleted", userId, { turmaId: input.turmaId });
    return ok({ ok: true } as const);
  });

export const updateTurmaAction = action
  .input(updateTurmaInputSchema)
  .auth({ require: "user" })
  .rateLimit({ key: "turmas-update", max: 20, window: "1h" })
  .run(async ({ input, ctx }) => {
    const userId = ctx.actor?.id;
    if (!userId) return err({ code: "UNAUTHORIZED" } as const);

    const result = await updateTurma(userId, input);
    if (!result.ok) return err(result.error);

    logger.info(
      {
        userId,
        turmaId: result.value.turma.id,
        grade: result.value.turma.grade,
        year: result.value.turma.year,
        classLetter: result.value.turma.classLetter,
      },
      "agenda.turma_updated",
    );
    await logAgendaAuditEvent("agenda.turma_updated", userId, {
      turmaId: result.value.turma.id,
      grade: result.value.turma.grade,
      year: result.value.turma.year,
      classLetter: result.value.turma.classLetter,
    });
    return ok({ turmaId: result.value.turma.id } as const);
  });
