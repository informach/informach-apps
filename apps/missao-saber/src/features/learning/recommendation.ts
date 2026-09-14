import { type ContentState, lessonAvailability } from "../content/availability";
import type { Course, Lesson } from "../content/types";
import type { Evidence, SkillState } from "./engine";

export function availableLessons(
  lessons: Lesson[],
  input: {
    course: Course;
    grade: number;
    paid: boolean;
    profileAllowed: boolean;
    states: ReadonlyMap<string, ContentState>;
  },
) {
  return lessons.filter(
    (lesson) =>
      lessonAvailability({
        lesson,
        course: input.course,
        grade: input.grade,
        paid: input.paid,
        profileAllowed: input.profileAllowed,
        state: input.states.get(lesson.id),
      }).available,
  );
}
export function reviewLesson(
  lessons: Lesson[],
  skillId: string,
  evidence: Evidence[],
  attemptedItemIds: ReadonlySet<string> = new Set(evidence.map((row) => row.itemId)),
) {
  const choices = lessons.filter((lesson) => lesson.skillId === skillId);
  return (
    choices.find((lesson) => lesson.items.some((item) => !attemptedItemIds.has(item.id))) ??
    choices[0]
  );
}
export function recommend(
  lessons: Lesson[],
  evidence: Evidence[],
  states: SkillState[],
  now: Date,
  attemptedItemIds: ReadonlySet<string> = new Set(evidence.map((row) => row.itemId)),
) {
  const due = [...states]
    .filter((state) => state.dueAt <= now)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  for (const state of due) {
    const lesson = reviewLesson(lessons, state.skillId, evidence, attemptedItemIds);
    if (lesson)
      return {
        lesson,
        mode: "review" as const,
        reason:
          "Esta habilidade está na data de reencontro. Vamos recuperar a estratégia em uma nova tentativa.",
      };
  }
  const diagnosticItemIds = new Set(
    evidence.filter((row) => row.mode === "diagnostic").map((row) => row.itemId),
  );
  const practiced = new Set(
    [...attemptedItemIds].filter((itemId) => !diagnosticItemIds.has(itemId)),
  );
  const diagnostic = evidence
    .filter((row) => row.mode === "diagnostic")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latestDiagnostic = diagnostic.filter((row) => row.sessionId === diagnostic[0]?.sessionId);
  const missed = new Set(latestDiagnostic.filter((row) => !row.correct).map((row) => row.skillId));
  const needsPractice = lessons.find(
    (lesson) => missed.has(lesson.skillId) && lesson.items.some((item) => !practiced.has(item.id)),
  );
  if (needsPractice)
    return {
      lesson: needsPractice,
      mode: "mission" as const,
      reason:
        "Seu diagnóstico mostrou uma ideia que ainda merece apoio. Esta missão ajuda a construir essa ponte.",
    };
  const passed = new Set(latestDiagnostic.filter((row) => row.correct).map((row) => row.skillId));
  const next =
    lessons.find(
      (lesson) =>
        !passed.has(lesson.skillId) && lesson.items.some((item) => !practiced.has(item.id)),
    ) ??
    lessons.find((lesson) => lesson.items.some((item) => !practiced.has(item.id))) ??
    lessons[0];
  if (!next) return null;
  return {
    lesson: next,
    mode: "mission" as const,
    reason: passed.size
      ? "Você já reconheceu algumas ideias no diagnóstico. Esta missão permite testar a compreensão em outros contextos, sem atribuir domínio antecipadamente."
      : "Um passo da sua trilha, com espaço para experimentar e pedir pistas.",
  };
}
