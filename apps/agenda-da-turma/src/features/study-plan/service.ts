import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import type { z } from "zod";
import { addDaysIso, parseLocalIso, todayLocalIso } from "@/features/dashboard/date";
import { recordProductEvent } from "@/features/metrics/events";
import { getNoticeAction } from "@/features/notices/repository";
import { actionFingerprint } from "@/features/notices/write-repository";
import { ESTIMATE_PRESETS } from "@/features/unified-activities/estimate";
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

/**
 * Os dias do plano e a carga que os decidiu. A proposta do detalhe e a
 * gravação passam por aqui, então "Colocar na rotina" grava os mesmos dias que
 * a tela mostrou (a não ser que a semana tenha mudado no meio).
 */
async function planDays(
  userId: string,
  task: { id: string; profileId: string; dueAt: string },
  sessions: number,
  todayIso: string,
) {
  const window = await findLoadUntilExam(userId, {
    profileId: task.profileId,
    taskId: task.id,
    fromIso: todayIso,
    toIso: task.dueAt,
  });
  const days = planStudySessions({
    examDueAt: task.dueAt,
    todayIso,
    sessions,
    loadByDay: summarizeDayLoad(window, {
      fromIso: todayIso,
      // A janela do resumo cobre a mesma janela do plano: com um teto fixo, uma
      // prova distante deixaria todos os dias além dele parecendo livres, e a
      // regra dos dias cheios se desligava em silêncio.
      days: daysBetween(todayIso, task.dueAt) + 1,
    }),
  });
  return { days, window };
}

/** Quantas sessões a proposta oferece antes de a família mexer em "Outro jeito". */
export const PROPOSED_SESSIONS = 3;
/** Sem estimativa na prova, cada sessão fica com meia hora. */
export const PROPOSED_MINUTES = 30;

export type StudyPlanProposal = {
  days: string[];
  minutesEach: number;
  /**
   * Um dia antes da véspera que o plano pulou por já ter entrega, para a frase
   * dizer por quê. `exams` separa "outra prova" de "outra entrega".
   */
  avoided: { iso: string; deliveries: number; exams: number } | null;
};

/**
 * A proposta do detalhe: "Três sessões de 30 minutos nos dias mais livres até
 * a véspera". É a mesma conta da gravação, só que sem gravar; a família aceita
 * com "Colocar na rotina" ou escolhe outro número em "Outro jeito".
 */
export async function proposeStudyPlan(
  userId: string,
  task: { id: string; profileId: string; dueAt: string; estimatedMinutes: number | null },
): Promise<StudyPlanProposal | null> {
  const todayIso = todayLocalIso();
  const { days, window } = await planDays(userId, task, PROPOSED_SESSIONS, todayIso);
  if (!days.length) return null;
  const chosen = new Set(days);
  let avoided: StudyPlanProposal["avoided"] = null;
  for (let day = todayIso; day < task.dueAt && !avoided; day = addDaysIso(day, 1)) {
    if (chosen.has(day)) continue;
    const things = window.filter((item) => item.dueAt === day && item.type !== "study");
    if (things.length)
      avoided = {
        iso: day,
        deliveries: things.length,
        exams: things.filter((item) => item.type === "exam").length,
      };
  }
  // A sessão herda a duração da prova quando ela é um dos degraus que o plano
  // aceita; fora deles (uma estimativa de 1h30, por exemplo), meia hora.
  const minutesEach = ESTIMATE_PRESETS.find((preset) => preset === task.estimatedMinutes);
  return { days, minutesEach: minutesEach ?? PROPOSED_MINUTES, avoided };
}

export async function createStudyPlan(userId: string, input: z.infer<typeof studyPlanSchema>) {
  const exam = await getNoticeAction(userId, input.taskId);
  if (!exam) return err({ code: "NOT_FOUND" } as const);
  const task = exam.action;
  if (!task.dueAt || task.status === "canceled") return err({ code: "NOT_PLANNABLE" } as const);
  if (!STUDY_PLAN_TYPES.some((type) => type === task.type))
    return err({ code: "NOT_PLANNABLE" } as const);

  const todayIso = todayLocalIso();
  const { days } = await planDays(
    userId,
    { id: task.id, profileId: task.profileId, dueAt: task.dueAt },
    input.sessions,
    todayIso,
  );
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
