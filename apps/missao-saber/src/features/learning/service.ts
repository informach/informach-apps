import "server-only";
import { z } from "zod";
import { assertAllowed } from "@/lib/errors";
import { getAccess } from "../billing/service";
import {
  assertableAvailabilityMessage,
  isSuspended,
  lessonAvailability,
} from "../content/availability";
import {
  assessment,
  assessmentHasAllSkills,
  courseAssessmentBanks,
  courseLessons,
  findCourse,
  findLesson,
  skillNames,
} from "../content/catalog";
import { lessonSchema, publicLesson } from "../content/types";
import { weekStart } from "../family/desafio";
import { allowedProfileIds } from "../family/profile-access";
import { gradeAnswer, skillStates, weeklyEvidence } from "./engine";
import { availableLessons, recommend } from "./recommendation";
import * as repo from "./repository";
import { answerSchema, hintSchema, profileSchema, startSchema } from "./schemas";

export async function createProfile(userId: string, raw: unknown) {
  const { consent: _consent, ...input } = profileSchema.parse(raw);
  const course = findCourse(input.courseId);
  assertAllowed(
    course?.grades.includes(input.grade),
    "COURSE",
    "Escolha uma trilha compatível com o ano escolar.",
  );
  const access = await getAccess(userId);
  return repo.addProfile(userId, input, access.profileLimit);
}
export async function dashboard(userId: string, profileId?: string) {
  const profiles = await repo.getProfiles(userId);
  const profile = profileId ? profiles.find((p) => p.id === profileId) : profiles[0];
  assertAllowed(!profileId || profile, "PROFILE", "Perfil não encontrado.");
  const [family, access, contentStates, challenge] = await Promise.all([
    repo.getFamily(userId),
    getAccess(userId),
    repo.contentStates(),
    // O desafio é da família, não do perfil: fica aqui, junto do resto do
    // painel, para que layout e página compartilhem uma leitura só.
    repo.familyChallenge(userId, weekStart(new Date())),
  ]);
  const activeProfileIds = allowedProfileIds(profiles, access.profileLimit);
  if (!profile)
    return {
      profiles,
      profile: null,
      family,
      access,
      contentStates,
      activeProfileIds,
      challenge,
      profileAllowed: false,
      evidence: [],
      attemptedItemIds: [],
      assessmentExposedFamilyIds: [],
      recent: [],
      paused: null,
      diagnosed: false,
      states: [],
      weekly: weeklyEvidence([], new Date()),
    };
  const { evidence, attemptedItemIds, recent, paused, diagnosed, assessmentExposedFamilyIds } =
    await repo.history(userId, profile.id);
  return {
    profiles,
    profile,
    family,
    access,
    contentStates,
    activeProfileIds,
    challenge,
    profileAllowed: activeProfileIds.includes(profile.id),
    evidence,
    attemptedItemIds,
    assessmentExposedFamilyIds,
    recent,
    paused,
    diagnosed,
    states: skillStates(evidence),
    weekly: weeklyEvidence(evidence, new Date()),
  };
}
export async function learningHistory(userId: string, profileId: string, raw: unknown) {
  const cursor = z.string().uuid().optional().parse(raw);
  return repo.sessionHistory(userId, profileId, cursor);
}
export async function begin(userId: string, raw: unknown) {
  const input = startSchema.parse(raw);
  const data = await dashboard(userId, input.profileId);
  assertAllowed(data.profile, "PROFILE", "Crie um perfil para começar.");
  const course = findCourse(data.profile.courseId);
  assertAllowed(course, "COURSE", "Trilha não encontrada.");
  const lesson =
    input.mode === "diagnostic" || input.mode === "exam"
      ? assessment(
          course,
          input.mode,
          new Set(
            courseAssessmentBanks(course)
              .filter((source) => isSuspended(data.contentStates.get(source.id)))
              .map((source) => source.id),
          ),
          new Set(data.assessmentExposedFamilyIds),
        )
      : findLesson(input.lessonId);
  assertAllowed(lesson && lesson.id === input.lessonId, "LESSON", "Missão não encontrada.");
  assertAllowed(
    lesson.skillId !== "mixed" || assessmentHasAllSkills(course, lesson),
    "WITHDRAWN",
    "Este percurso está temporariamente incompleto enquanto corrigimos uma atividade.",
  );
  const availability = lessonAvailability({
    lesson,
    course,
    grade: data.profile.grade,
    paid: data.access.paid,
    profileAllowed: data.profileAllowed,
    state: data.contentStates.get(lesson.id),
  });
  assertAllowed(
    availability.available,
    availability.reason,
    assertableAvailabilityMessage(availability.reason),
  );
  return repo.startSession(userId, input.profileId, lesson, input.mode, input.requestKey);
}
export async function sessionView(userId: string, sessionId: string) {
  const { session, saved, givenHints, sessionReports, suspended } = await repo.readSession(
    userId,
    sessionId,
  );
  const lesson = lessonSchema.parse(session.snapshot);
  const feedbackAllowed =
    (session.mode !== "exam" && session.mode !== "diagnostic") || !!session.completedAt;
  let nextStep: {
    lessonId: string;
    title: string;
    reason: string;
    mode: "mission" | "review";
  } | null = null;
  const assessmentMode = session.mode === "diagnostic" || session.mode === "exam";
  const previous =
    assessmentMode && session.completedAt
      ? await repo.previousAssessment(
          userId,
          session.profileId,
          session.mode as "diagnostic" | "exam",
          session.createdAt,
        )
      : null;
  if (session.mode === "diagnostic" && session.completedAt) {
    const data = await dashboard(userId, session.profileId);
    const course = data.profile && findCourse(data.profile.courseId);
    if (course) {
      const next = recommend(
        availableLessons(courseLessons(course), {
          course,
          grade: data.profile.grade,
          paid: data.access.paid,
          profileAllowed: data.profileAllowed,
          states: data.contentStates,
        }),
        data.evidence,
        data.states,
        new Date(),
        new Set(data.attemptedItemIds),
      );
      if (next)
        nextStep = {
          lessonId: next.lesson.id,
          title: next.lesson.title,
          reason: next.reason,
          mode: next.mode,
        };
    }
  }
  return {
    nextStep,
    skillLabels: Object.fromEntries(
      lesson.items.map((item) => [item.skillId, skillNames[item.skillId] ?? item.skillId]),
    ),
    readingSupport: session.readingSupport,
    previousAssessment: previous
      ? {
          createdAt: previous.createdAt.toISOString(),
          readingSupport: previous.readingSupport,
          counts: previous.counts,
        }
      : null,
    id: session.id,
    profileId: session.profileId,
    mode: session.mode,
    createdAt: session.createdAt.toISOString(),
    completed: !!session.completedAt,
    interrupted: !!session.interruptedAt,
    interruptionReason: session.interruptionReason,
    suspended,
    reports: sessionReports.flatMap((report) =>
      report.category
        ? [{ itemId: report.itemId, category: report.category, detail: report.detail }]
        : [],
    ),
    lesson: publicLesson(lesson),
    saved: saved.map((attempt) => {
      const item = lesson.items.find((q) => q.id === attempt.itemId);
      assertAllowed(item, "CONTENT", "A versão desta missão precisa de revisão.");
      return {
        itemId: item.id,
        chosen: attempt.answer,
        helpCount: attempt.helpCount,
        result: feedbackAllowed
          ? (attempt.result ??
            (attempt.correct === null ? "reflection" : attempt.correct ? "correct" : "incorrect"))
          : null,
        feedback: feedbackAllowed ? gradeAnswer(item, attempt.answer) : null,
      };
    }),
    hints: Object.fromEntries(
      givenHints.map((hint) => [
        hint.itemId,
        lesson.items.find((q) => q.id === hint.itemId)?.hints.slice(0, hint.count) ?? [],
      ]),
    ),
  };
}
export async function answer(userId: string, raw: unknown) {
  const input = answerSchema.parse(raw);
  await repo.recordAnswer(userId, input);
  return sessionView(userId, input.sessionId);
}
export async function hint(userId: string, raw: unknown) {
  return repo.recordHint(userId, hintSchema.parse(raw));
}
export async function markReading(userId: string, raw: unknown) {
  const sessionId = z.string().uuid().parse(raw);
  return repo.markReadingSupport(userId, sessionId);
}
export async function interrupt(userId: string, raw: unknown) {
  const sessionId = z.string().uuid().parse(raw);
  await repo.interruptSession(userId, sessionId);
  return sessionView(userId, sessionId);
}
export async function changeCourse(userId: string, profileId: string, courseId: string) {
  const profiles = await repo.getProfiles(userId);
  const profile = profiles.find((p) => p.id === profileId);
  assertAllowed(
    profile && findCourse(courseId)?.grades.includes(profile.grade),
    "COURSE",
    "Esta trilha não está disponível para o perfil.",
  );
  return repo.updateCourse(userId, profileId, courseId);
}
export type SessionView = Awaited<ReturnType<typeof sessionView>>;
