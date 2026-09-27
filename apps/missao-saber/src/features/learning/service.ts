import "server-only";
import { z } from "zod";
import { assertAllowed } from "@/lib/errors";
import { audit } from "@/lib/observability";
import { getAccess } from "../billing/service";
import {
  assertableAvailabilityMessage,
  isSuspended,
  lessonAvailability,
  lessonIdInCourse,
} from "../content/availability";
import {
  assessment,
  assessmentHasAllSkills,
  courseAssessmentBanks,
  courseLessons,
  findCourse,
  findLesson,
  skillNames,
  successorCourse,
} from "../content/catalog";
import { lessonSchema, publicLesson } from "../content/types";
import { weekStart } from "../family/desafio";
import { allowedProfileIds } from "../family/profile-access";
import { schoolYear } from "../family/school-year";
import { gradeAnswer, skillStates, weeklyEvidence } from "./engine";
import { availableLessons, recommend } from "./recommendation";
import * as repo from "./repository";
import {
  answerSchema,
  hintSchema,
  profileSchema,
  startSchema,
  updateProfileSchema,
} from "./schemas";

const birthMonthDate = (value: string | null | undefined) => (value ? `${value}-01` : null);

export async function createProfile(userId: string, raw: unknown) {
  const { consent: _consent, birthMonth, ...input } = profileSchema.parse(raw);
  const course = findCourse(input.courseId);
  assertAllowed(
    course?.grades.includes(input.grade),
    "COURSE",
    "Escolha uma trilha compatível com o ano escolar.",
  );
  const access = await getAccess(userId);
  const profile = await repo.addProfile(
    userId,
    { ...input, gradeYear: schoolYear(), birthMonth: birthMonthDate(birthMonth) },
    access.profileLimit,
  );
  audit({
    eventType: "missao.consent_recorded",
    actorId: userId,
    payload: { profileId: profile.id, scope: "profile", version: repo.CONSENT_VERSION },
  });
  return profile;
}
/** Edição pelo responsável: o ano escolhido vale para o ano civil corrente. */
export async function updateProfile(userId: string, raw: unknown) {
  const { profileId, birthMonth, birthConsent, ...input } = updateProfileSchema.parse(raw);
  const course = findCourse(input.courseId);
  assertAllowed(
    course?.grades.includes(input.grade),
    "COURSE",
    "Escolha uma trilha compatível com o ano escolar.",
  );
  const { profile, changedFields, consentRecorded } = await repo.updateProfile(
    userId,
    profileId,
    { ...input, gradeYear: schoolYear(), birthMonth: birthMonthDate(birthMonth) },
    birthConsent === true,
  );
  if (consentRecorded)
    audit({
      eventType: "missao.consent_recorded",
      actorId: userId,
      payload: { profileId, scope: "birth_month", version: repo.CONSENT_VERSION },
    });
  if (changedFields.length)
    audit({
      eventType: "missao.profile_updated",
      actorId: userId,
      payload: { profileId, fields: changedFields },
    });
  return profile;
}
export async function dashboard(
  userId: string,
  profileId?: string,
  options: { fallbackToFirst?: boolean } = {},
) {
  const profiles = await repo.getProfiles(userId);
  const selected = profileId ? profiles.find((p) => p.id === profileId) : undefined;
  // O cookie de perfil pode sobreviver a um perfil apagado ou a outra conta no
  // mesmo aparelho; as páginas caem no primeiro perfil, o motor de sessão não.
  const profile = selected ?? (options.fallbackToFirst || !profileId ? profiles[0] : undefined);
  assertAllowed(
    !profileId || profile || options.fallbackToFirst,
    "PROFILE",
    "Perfil não encontrado.",
  );
  const [family, access, contentStates, challenge] = await Promise.all([
    repo.getFamily(userId),
    getAccess(userId),
    repo.contentStates(),
    // O desafio é da família, não do perfil: fica aqui, junto do resto do
    // painel, para que layout e página compartilhem uma leitura só.
    repo.familyChallenge(userId, weekStart(new Date())),
  ]);
  const activeProfileIds = allowedProfileIds(profiles, access.profileLimit);
  /* Virada de ano: se a trilha gravada não cobre mais o ano efetivo, as
     páginas já mostram a sucessora (mesma olimpíada, ano novo) e a gravação
     acontece na primeira missão ou na primeira troca. Sem sucessora (faixa
     ainda não publicada), a trilha atual continua valendo. */
  const storedCourse = profile ? findCourse(profile.courseId) : undefined;
  const courseTransition =
    profile && storedCourse && !storedCourse.grades.includes(profile.grade)
      ? { from: storedCourse, to: successorCourse(storedCourse, profile.grade) }
      : null;
  const course = courseTransition?.to ?? storedCourse ?? null;
  if (!profile)
    return {
      profiles,
      profile: null,
      course,
      courseTransition,
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
    course,
    courseTransition,
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
    // Uma pausa de outra trilha (virada de ano ou troca) não pode ser o único
    // caminho da página: ela seria recusada ao abrir.
    paused: paused && course && lessonIdInCourse(course, paused.lessonId) ? paused : null,
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
  const course = data.course;
  assertAllowed(course, "COURSE", "Trilha não encontrada.");
  if (data.courseTransition?.to && data.courseTransition.to.id !== data.profile.courseId)
    await repo.updateCourse(userId, data.profile.id, data.courseTransition.to.id);
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
    const course = data.course;
    if (course && data.profile) {
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
