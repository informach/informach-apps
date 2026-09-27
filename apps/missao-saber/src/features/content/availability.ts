import { coursesForGrade } from "./catalog";
import type { Course, Lesson } from "./types";

export type ContentState = {
  status: string;
};

export type AvailabilityReason =
  | "AVAILABLE"
  | "COURSE"
  | "GRADE"
  | "PLAN"
  | "PROFILE_LIMIT"
  | "WITHDRAWN";

export type Availability = {
  available: boolean;
  reason: AvailabilityReason;
};

export function isSuspended(state: ContentState | undefined) {
  return state?.status === "suspended";
}

/** Missão, revisão ou avaliação que pertence à trilha (pelo id da lição da sessão). */
export function lessonIdInCourse(course: Course, lessonId: string) {
  return (
    lessonId === `diagnostic:${course.id}` ||
    lessonId === `exam:${course.id}` ||
    course.path.includes(lessonId)
  );
}

export function lessonAvailability(input: {
  lesson: Lesson;
  course: Course;
  grade: number;
  paid: boolean;
  profileAllowed: boolean;
  state?: ContentState;
}): Availability {
  const { lesson, course } = input;
  // Ano escolar sem trilha publicada não bloqueia: a trilha atual continua até
  // a faixa nova existir; só um ano com trilhas próprias exige uma delas.
  if (!course.grades.includes(input.grade) && coursesForGrade(input.grade).length > 0)
    return { available: false, reason: "GRADE" };
  const belongsToCourse =
    lesson.skillId === "mixed"
      ? lesson.id === `diagnostic:${course.id}` || lesson.id === `exam:${course.id}`
      : lesson.kind === "mission" && course.path.includes(lesson.id);
  if (!belongsToCourse) return { available: false, reason: "COURSE" };
  if (isSuspended(input.state)) return { available: false, reason: "WITHDRAWN" };
  if (!lesson.free && !input.paid) return { available: false, reason: "PLAN" };
  if (!lesson.free && !input.profileAllowed) return { available: false, reason: "PROFILE_LIMIT" };
  return { available: true, reason: "AVAILABLE" };
}

export function assertableAvailabilityMessage(reason: AvailabilityReason) {
  switch (reason) {
    case "COURSE":
      return "Esta missão pertence a outra trilha.";
    case "GRADE":
      return "Esta missão não está disponível para este ano escolar.";
    case "PLAN":
      return "Esta missão faz parte da assinatura. As primeiras missões de cada trilha e o diagnóstico são gratuitos.";
    case "PROFILE_LIMIT":
      return "Este perfil está preservado no histórico. O plano atual permite estudar com menos perfis.";
    case "WITHDRAWN":
      return "Esta missão foi pausada para correção. Escolha outra por enquanto.";
    case "AVAILABLE":
      return "Missão disponível.";
  }
}
