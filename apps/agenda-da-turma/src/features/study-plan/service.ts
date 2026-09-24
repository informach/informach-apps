import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import { and, db, eq, inArray, sql } from "@informach/db";
import { agendaStudentProfiles, agendaTasks } from "@informach/db/schema";
import type { z } from "zod";
import { FREE_ACTIVITY_LIMIT } from "@/features/activities/limits";
import { countPendingActivities, lockPendingLimit } from "@/features/activities/pending-limit";
import { addDaysIso, parseLocalIso, todayLocalIso } from "@/features/dashboard/date";
import { accessibleProfileCondition } from "@/features/family/access";
import { recordProductEvent } from "@/features/metrics/events";
import { getNoticeAction } from "@/features/notices/repository";
import { actionFingerprint } from "@/features/notices/write-repository";
import { summarizeDayLoad } from "@/features/unified-activities/load";
import { billing } from "@/lib/billing";
import { planStudySessions } from "./plan";
import type { removeStudyPlanSchema, studyPlanSchema } from "./schemas";

/** Tipos que ganham plano de estudo: os que se prepara, não os que se entrega. */
export const STUDY_PLAN_TYPES = ["exam", "project"] as const;

/** Dias inteiros entre duas datas locais, sem fuso pelo meio. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = parseLocalIso(fromIso).valueOf();
  const to = parseLocalIso(toIso).valueOf();
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

export async function listStudySessions(userId: string, taskId: string) {
  return db
    .select({
      id: agendaTasks.id,
      title: agendaTasks.title,
      dueAt: agendaTasks.dueAt,
      status: agendaTasks.status,
      estimatedMinutes: agendaTasks.estimatedMinutes,
    })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(
      and(
        eq(agendaTasks.studyForTaskId, taskId),
        sql`${agendaTasks.status} <> 'canceled'`,
        accessibleProfileCondition(userId),
      ),
    )
    .orderBy(agendaTasks.dueAt);
}

export async function createStudyPlan(userId: string, input: z.infer<typeof studyPlanSchema>) {
  const exam = await getNoticeAction(userId, input.taskId);
  if (!exam) return err({ code: "NOT_FOUND" } as const);
  const task = exam.action;
  if (!task.dueAt || task.status === "canceled") return err({ code: "NOT_PLANNABLE" } as const);
  if (!STUDY_PLAN_TYPES.some((type) => type === task.type))
    return err({ code: "NOT_PLANNABLE" } as const);

  const todayIso = todayLocalIso();
  // Carga já conhecida da janela até a prova: as sessões fogem dos dias cheios.
  // O plano ANTERIOR fica de fora — ele vai ser desfeito daqui a pouco, e
  // contá-lo faria o replanejamento fugir justamente dos dias que ele libera.
  const window = await db
    .select({ dueAt: agendaTasks.dueAt, estimatedMinutes: agendaTasks.estimatedMinutes })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(
      and(
        eq(agendaTasks.profileId, task.profileId),
        eq(agendaTasks.status, "pending"),
        accessibleProfileCondition(userId),
        sql`(${agendaTasks.studyForTaskId} IS NULL OR ${agendaTasks.studyForTaskId} <> ${task.id})`,
        sql`${agendaTasks.dueAt} BETWEEN ${todayIso}::date AND ${task.dueAt}::date`,
      ),
    );
  const days = planStudySessions({
    examDueAt: task.dueAt,
    todayIso,
    sessions: input.sessions,
    loadByDay: summarizeDayLoad(
      window.map((row) => ({ dueAt: row.dueAt, estimatedMinutes: row.estimatedMinutes })),
      // A janela do resumo tem de cobrir a mesma janela do plano: com um teto
      // fixo, uma prova distante deixaria todos os dias além dele parecendo
      // livres, e a regra dos dias cheios se desligava em silêncio.
      { fromIso: todayIso, days: daysBetween(todayIso, task.dueAt) + 1 },
    ),
  });
  if (!days.length) return err({ code: "NO_TIME_LEFT" } as const);

  const ownerId = exam.ownerUserId;
  const isPro = await billing.hasProSubscription({ type: "user", id: ownerId });
  const examLabel = task.dueAt.split("-").reverse().join("/");
  return db.transaction(async (tx) => {
    await lockPendingLimit(tx, ownerId);
    // Toda decisão antes de qualquer escrita, como no resto do app: um `return`
    // de dentro de uma transação Drizzle COMMITA. Cancelar o plano anterior e
    // só então recusar por limite apagaria o plano da família e não devolveria
    // nada — a tela diria "conclua algumas" sobre sessões que já não existem.
    const replaced = await tx
      .select({ id: agendaTasks.id })
      .from(agendaTasks)
      .where(and(eq(agendaTasks.studyForTaskId, task.id), eq(agendaTasks.status, "pending")));
    const pending = await countPendingActivities(tx, ownerId);
    // O plano anterior sai da conta: ele será cancelado nesta mesma transação.
    const after = pending - replaced.length + days.length;
    if (!isPro && after > FREE_ACTIVITY_LIMIT)
      return err({
        code: "ACTIVITY_LIMIT_REACHED",
        current: pending,
        limit: FREE_ACTIVITY_LIMIT,
      } as const);
    // Replanejar não empilha: as sessões pendentes do plano anterior saem.
    if (replaced.length)
      await tx
        .update(agendaTasks)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(and(eq(agendaTasks.studyForTaskId, task.id), eq(agendaTasks.status, "pending")));
    const created = await tx
      .insert(agendaTasks)
      .values(
        days.map((dueAt, index) => {
          const title = `Estudar para ${task.title} (${index + 1}/${days.length})`;
          return {
            profileId: task.profileId,
            createdByUserId: userId,
            studyForTaskId: task.id,
            type: "study" as const,
            subjectId: task.subjectId,
            profileSubjectId: task.profileSubjectId,
            title,
            description: `Preparação para ${task.title}, em ${examLabel}.`,
            dueAt,
            // Planejamento da família, nunca prazo da escola: a prova continua
            // sendo a única data que a escola marcou.
            dateOrigin: "family" as const,
            estimatedMinutes: input.minutesEach,
            fingerprint: actionFingerprint({ title, dueAt, type: "study" }),
          };
        }),
      )
      .returning({ id: agendaTasks.id });
    await recordProductEvent(userId, { event: "study_plan_created", count: created.length });
    return ok({ sessions: created.length });
  });
}

export async function removeStudyPlan(
  userId: string,
  input: z.infer<typeof removeStudyPlanSchema>,
) {
  const sessions = await listStudySessions(userId, input.taskId);
  const pendingIds = sessions.filter((s) => s.status === "pending").map((s) => s.id);
  if (!pendingIds.length) return ok({ canceled: 0 });
  await db
    .update(agendaTasks)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(and(inArray(agendaTasks.id, pendingIds), eq(agendaTasks.status, "pending")));
  return ok({ canceled: pendingIds.length });
}

/** Dias cobertos por um plano, para a tela dizer até quando ele vai. */
export function studyPlanRange(days: string[]) {
  const first = days[0];
  const last = days[days.length - 1];
  return first && last ? { first, last, nextDay: addDaysIso(last, 1) } : null;
}
