import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import type { z } from "zod";
import { addDaysIso, parseLocalIso, todayLocalIso } from "@/features/dashboard/date";
import { recordProductEvent } from "@/features/metrics/events";
import { getNoticeAction } from "@/features/notices/repository";
import { actionFingerprint } from "@/features/notices/write-repository";
import { summarizeDayLoad } from "@/features/unified-activities/load";
import { billing } from "@/lib/billing";
import { planStudySessions } from "./plan";
import {
  cancelStudySessions,
  findLoadUntilExam,
  findStudySessions,
  type NewStudySession,
  replaceStudyPlan,
} from "./repository";
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
  return findStudySessions(userId, taskId);
}

export async function createStudyPlan(userId: string, input: z.infer<typeof studyPlanSchema>) {
  const exam = await getNoticeAction(userId, input.taskId);
  if (!exam) return err({ code: "NOT_FOUND" } as const);
  const task = exam.action;
  if (!task.dueAt || task.status === "canceled") return err({ code: "NOT_PLANNABLE" } as const);
  if (!STUDY_PLAN_TYPES.some((type) => type === task.type))
    return err({ code: "NOT_PLANNABLE" } as const);

  const todayIso = todayLocalIso();
  const window = await findLoadUntilExam(userId, {
    profileId: task.profileId,
    taskId: task.id,
    fromIso: todayIso,
    toIso: task.dueAt,
  });
  const days = planStudySessions({
    examDueAt: task.dueAt,
    todayIso,
    sessions: input.sessions,
    loadByDay: summarizeDayLoad(window, {
      fromIso: todayIso,
      // A janela do resumo cobre a mesma janela do plano: com um teto fixo, uma
      // prova distante deixaria todos os dias além dele parecendo livres, e a
      // regra dos dias cheios se desligava em silêncio.
      days: daysBetween(todayIso, task.dueAt) + 1,
    }),
  });
  if (!days.length) return err({ code: "NO_TIME_LEFT" } as const);

  const isPro = await billing.hasProSubscription({ type: "user", id: exam.ownerUserId });
  const examLabel = task.dueAt.split("-").reverse().join("/");
  const sessions: NewStudySession[] = days.map((dueAt, index) => {
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
      // Planejamento da família, nunca prazo da escola: a prova continua sendo
      // a única data que a escola marcou.
      dateOrigin: "family" as const,
      estimatedMinutes: input.minutesEach,
      fingerprint: actionFingerprint({ title, dueAt, type: "study" }),
    };
  });
  const result = await replaceStudyPlan(exam.ownerUserId, task.id, sessions, isPro);
  if (!("created" in result))
    return err({
      code: "ACTIVITY_LIMIT_REACHED",
      current: result.current,
      limit: result.limit,
    } as const);
  await recordProductEvent(userId, { event: "study_plan_created", count: result.created });
  return ok({ sessions: result.created });
}

export async function removeStudyPlan(
  userId: string,
  input: z.infer<typeof removeStudyPlanSchema>,
) {
  const sessions = await findStudySessions(userId, input.taskId);
  const canceled = await cancelStudySessions(
    sessions.filter((session) => session.status === "pending").map((session) => session.id),
  );
  return ok({ canceled });
}

/** Dias cobertos por um plano, para a tela dizer até quando ele vai. */
export function studyPlanRange(days: string[]) {
  const first = days[0];
  const last = days[days.length - 1];
  return first && last ? { first, last, nextDay: addDaysIso(last, 1) } : null;
}
