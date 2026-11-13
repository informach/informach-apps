import "server-only";
import {
  activeWebParticipationCondition,
  lockActiveWebParticipation,
  lockWebParticipation,
} from "@informach/auth/web-participation";
import {
  and,
  count,
  db,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "@informach/db";
import {
  missaoAttempts as attempts,
  missaoContentControls as contentControls,
  emailUnsubscribes,
  missaoExperiments as experiments,
  missaoFamilies as families,
  familyAppProfiles,
  missaoFamilyChallenges as familyChallenges,
  familyPeople,
  missaoHints as hints,
  missaoLabExecutions as labExecutions,
  missaoCompetitions,
  missaoStudyDevices,
  missaoNotes as notes,
  missaoProfiles as profiles,
  missaoPuzzleSolves as puzzleSolves,
  missaoReports as reports,
  missaoSessions as sessions,
  users,
} from "@informach/db/schema";
import { familyMembershipCondition } from "@informach/family/access";
import { lockFamilyMembership, removeProfileInTransaction } from "@informach/family/context";
import { assertAllowed } from "@/lib/errors";
import { eraseMissaoProfiles } from "../account/cleanup-repository";
import { type LearningAccess, learningAccessInTransaction } from "../billing/access-repository";
import { exportCompetitions } from "../competition/repository";
import {
  assertableAvailabilityMessage,
  lessonAvailability,
  lessonIdInCourse,
} from "../content/availability";
import {
  assessmentSources,
  type ContentIdentity,
  findCourse,
  resolvedCourse,
} from "../content/catalog";
import { type Lesson, lessonSchema } from "../content/types";
import { itemHash } from "../content/version";
import type { LearningAuthority, ParentAuthority } from "../family/authority";
import { familyService } from "../family/context-repository";
import { effectiveGrade } from "../family/school-year";
import { lockStudentAccess, studentAccessCondition } from "../family/scope";
import { countStudents, enabledStudentIds, readStudents } from "../family/student-repository";
import { labAttachmentSchema } from "../labs/runtime/schemas";
import { type Evidence, gradeAnswer } from "./engine";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Profile = typeof profiles.$inferSelect;
/**
 * Todo perfil lido do banco sai com o ano escolar efetivo em `grade` (o ano
 * gravado avança a cada virada de ano civil) e o gravado em `storedGrade`.
 */
function withEffectiveGrade<T extends { grade: number; gradeYear: number }>(
  row: T,
  now = new Date(),
) {
  return { ...row, storedGrade: row.grade, grade: effectiveGrade(row, now) };
}
export type LearningSession = typeof sessions.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export async function lockOwner(tx: Tx, userId: string) {
  const [owner] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  assertAllowed(owner, "AUTH", "Entre novamente para continuar.");
}
async function ownedProfile(
  tx: Tx,
  actor: LearningAuthority,
  profileId: string,
  action: "read" | "write" | "manage" = "read",
) {
  const [candidate] = await readStudents(tx, actor, profileId);
  assertAllowed(candidate, "NOT_FOUND", "Perfil não encontrado.");
  await lockStudentAccess(tx, actor, [profileId], action);
  const [profile] = await readStudents(tx, actor, profileId);
  assertAllowed(profile, "NOT_FOUND", "Perfil não encontrado.");
  return withEffectiveGrade(profile);
}
async function ownedSession(
  tx: Tx,
  actor: LearningAuthority,
  sessionId: string,
  action: "read" | "write" = "read",
) {
  const [candidate] = await tx
    .select({ profileId: sessions.profileId })
    .from(sessions)
    .where(
      and(eq(sessions.id, sessionId), studentAccessCondition(actor, sessions.profileId, action)),
    );
  assertAllowed(candidate, "NOT_FOUND", "Missão não encontrada.");
  await lockStudentAccess(tx, actor, [candidate.profileId], action);
  const [session] = await tx
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.id, sessionId), studentAccessCondition(actor, sessions.profileId, action)),
    );
  assertAllowed(session, "NOT_FOUND", "Missão não encontrada.");
  return session;
}
async function assertCurrentSessionAccess(
  tx: Tx,
  actor: LearningAuthority,
  session: LearningSession,
  lesson: Lesson,
  access: LearningAccess,
) {
  if (session.completedAt || session.interruptedAt) return;
  const profile = await ownedProfile(tx, actor, session.profileId);
  const course = resolvedCourse(profile);
  assertAllowed(course, "COURSE", "A trilha mudou. Volte ao início e escolha sua missão.");
  const availability = lessonAvailability({
    lesson,
    course,
    grade: profile.grade,
    paid: access.paid,
    profileAllowed: (await enabledStudentIds(tx, actor, access.profileLimit)).includes(profile.id),
  });
  assertAllowed(
    availability.available,
    availability.reason,
    assertableAvailabilityMessage(availability.reason),
  );
}
export async function getProfiles(actor: LearningAuthority) {
  const rows = await readStudents(db, actor);
  const now = new Date();
  return rows.map((row) => withEffectiveGrade(row, now));
}
export function activeStudentIds(actor: LearningAuthority, limit: number) {
  return enabledStudentIds(db, actor, limit);
}
export async function getFamily(userId: string) {
  return db.transaction(async (tx) => {
    await lockActiveWebParticipation(tx, userId);
    const [family] = await tx.select().from(families).where(eq(families.userId, userId));
    return (
      family ?? {
        userId,
        consentVersion: null,
        consentAt: null,
        dailyMinutes: 10,
        weeklyReportEmail: false,
        weeklyReportProcessedWeek: null,
        createdAt: null,
      }
    );
  });
}
/**
 * Trocar de trilha encerra as pausas que ficaram na trilha anterior: elas não
 * podem mais ser retomadas, e deixá-las abertas faria a página oferecer um
 * percurso que seria recusado. O histórico continua lá, como interrompido.
 */
async function closeSessionsOutsideCourse(tx: Tx, profileId: string, courseId: string) {
  const course = findCourse(courseId);
  if (!course) return;
  const open = await tx
    .select({ id: sessions.id, lessonId: sessions.lessonId })
    .from(sessions)
    .where(
      and(
        eq(sessions.profileId, profileId),
        isNull(sessions.completedAt),
        isNull(sessions.interruptedAt),
      ),
    );
  const outside = open.filter((session) => !lessonIdInCourse(course, session.lessonId));
  if (!outside.length) return;
  await tx
    .update(sessions)
    .set({ interruptedAt: new Date(), interruptionReason: "A trilha mudou" })
    .where(
      inArray(
        sessions.id,
        outside.map((session) => session.id),
      ),
    );
}

/** Versão da política de privacidade aceita no consentimento mais recente. */
export const CONSENT_VERSION = "2026-09-26";

/** Registra o consentimento do responsável na versão atual da política. */
async function recordConsent(tx: Tx, userId: string) {
  await tx
    .insert(families)
    .values({ userId, consentVersion: CONSENT_VERSION, consentAt: new Date() })
    .onConflictDoUpdate({
      target: families.userId,
      set: { consentVersion: CONSENT_VERSION, consentAt: new Date() },
    });
}
export async function addProfile(
  actor: LearningAuthority,
  input: Pick<Profile, "grade" | "gradeYear" | "birthMonth" | "courseId"> & { personId: string },
) {
  assertAllowed(actor.kind === "parent", "AUTH", "Abra a área da família.");
  const { personId, ...settings } = input;
  const result = await familyService.activateProfile(
    actor.userId,
    { groupId: actor.familyGroupId, personId, app: "missao-saber" },
    async (tx, familyProfileId) => {
      const access = await learningAccessInTransaction(tx, actor);
      assertAllowed(
        (await countStudents(tx, actor)) < access.profileLimit,
        "PLAN",
        `A cobertura atual permite ${access.profileLimit} estudante(s).`,
      );
      await recordConsent(tx, actor.userId);
      const [created] = await tx
        .insert(profiles)
        .values({ ...settings, userId: actor.userId, familyProfileId, accessEnabled: true })
        .returning({ id: profiles.id });
      assertAllowed(created, "SAVE", "Não foi possível preparar o estudo.");
      const [profile] = await readStudents(tx, actor, created.id);
      assertAllowed(profile, "SAVE", "Não foi possível preparar o estudo.");
      return withEffectiveGrade(profile);
    },
  );
  return result.value;
}
export async function updateProfile(
  actor: LearningAuthority,
  profileId: string,
  input: Pick<Profile, "grade" | "gradeYear" | "birthMonth" | "courseId">,
  birthConsent = false,
) {
  return db.transaction(async (tx) => {
    const current = await ownedProfile(tx, actor, profileId, "manage");
    // Mês de nascimento novo é dado novo: pede a autorização de novo.
    const consentRecorded = !current.birthMonth && !!input.birthMonth;
    if (consentRecorded) {
      assertAllowed(
        birthConsent,
        "CONSENT",
        "Confirme a autorização para guardar o mês e ano de nascimento.",
      );
      await recordConsent(tx, actor.userId);
    }
    const changedFields = (["grade", "birthMonth", "courseId"] as const).filter((field) =>
      field === "grade"
        ? current.grade !== input.grade
        : String(current[field] ?? "") !== String(input[field] ?? ""),
    );
    const [updated] = await tx
      .update(profiles)
      .set(input)
      .where(eq(profiles.id, profileId))
      .returning();
    assertAllowed(updated, "SAVE", "Não foi possível atualizar o perfil.");
    if (current.courseId !== input.courseId)
      await closeSessionsOutsideCourse(tx, profileId, input.courseId);
    return {
      profile: withEffectiveGrade({
        ...current,
        ...updated,
        nickname: current.nickname,
        avatar: current.avatar,
      }),
      changedFields,
      consentRecorded,
    };
  });
}
export async function updateCourse(actor: LearningAuthority, profileId: string, courseId: string) {
  return db.transaction(async (tx) => {
    const current = await ownedProfile(tx, actor, profileId, "write");
    await tx.update(profiles).set({ courseId }).where(eq(profiles.id, profileId));
    if (current.courseId !== courseId) await closeSessionsOutsideCourse(tx, profileId, courseId);
  });
}
export async function contentStates(reader: Pick<Tx, "select"> = db) {
  const rows = await reader
    .select()
    .from(contentControls)
    .where(inArray(contentControls.status, ["available", "suspended"]))
    .orderBy(desc(contentControls.createdAt), desc(contentControls.id));
  const latest = new Map<string, typeof contentControls.$inferSelect>();
  for (const row of rows) {
    if (!latest.has(row.lessonId)) latest.set(row.lessonId, row);
  }
  return latest;
}
const sourceLessonsForSnapshot = assessmentSources;
async function contentIsSuspended(tx: Tx, sourceLessons: ContentIdentity[], lock: boolean) {
  for (const source of [...sourceLessons].sort((a, b) => a.id.localeCompare(b.id))) {
    if (lock)
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`missao:content:${source.id}`}, 0))`,
      );
    const [decision] = await tx
      .select({ status: contentControls.status })
      .from(contentControls)
      .where(
        and(
          eq(contentControls.lessonId, source.id),
          inArray(contentControls.status, ["available", "suspended"]),
        ),
      )
      .orderBy(desc(contentControls.createdAt), desc(contentControls.id))
      .limit(1);
    if (decision?.status === "suspended") return true;
  }
  return false;
}
export async function startSession(
  actor: LearningAuthority,
  profileId: string,
  lesson: Lesson,
  mode: LearningSession["mode"],
  requestKey: string,
) {
  return db.transaction(async (tx) => {
    const access = await learningAccessInTransaction(tx, actor);
    const profile = await ownedProfile(tx, actor, profileId, "write");
    const course = findCourse(profile.courseId);
    assertAllowed(course, "COURSE", "A trilha mudou. Volte ao início e escolha sua missão.");
    const [replay] = await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.profileId, profileId), eq(sessions.requestKey, requestKey)));
    if (replay) {
      assertAllowed(
        replay.lessonId === lesson.id && replay.mode === mode,
        "CONFLICT",
        "Esta solicitação já iniciou outra missão.",
      );
      return replay;
    }
    const [state] = await tx
      .select({ status: contentControls.status })
      .from(contentControls)
      .where(eq(contentControls.lessonId, lesson.id))
      .orderBy(desc(contentControls.createdAt), desc(contentControls.id))
      .limit(1);
    const availability = lessonAvailability({
      lesson,
      course,
      grade: profile.grade,
      paid: access.paid,
      profileAllowed: (await enabledStudentIds(tx, actor, access.profileLimit)).includes(
        profile.id,
      ),
      state,
    });
    assertAllowed(
      availability.available,
      availability.reason,
      assertableAvailabilityMessage(availability.reason),
    );
    const sourceLessons = sourceLessonsForSnapshot(lesson);
    assertAllowed(
      sourceLessons.length > 0 && !(await contentIsSuspended(tx, sourceLessons, true)),
      "WITHDRAWN",
      "Esta missão foi pausada para correção. Escolha outra por enquanto.",
    );
    const [daily] = await tx
      .select({ total: count() })
      .from(sessions)
      .where(
        and(
          eq(sessions.profileId, profileId),
          gte(sessions.createdAt, new Date(Date.now() - 86_400_000)),
        ),
      );
    assertAllowed(
      (daily?.total ?? 0) < 50,
      "LIMIT",
      "Você já abriu muitas missões hoje. Retome uma missão existente.",
    );
    const [created] = await tx
      .insert(sessions)
      .values({
        profileId,
        lessonId: lesson.id,
        version: lesson.version,
        mode,
        requestKey,
        snapshot: lesson,
      })
      .returning();
    assertAllowed(created, "SAVE", "Não foi possível iniciar a missão.");
    return created;
  });
}
export async function readSession(actor: LearningAuthority, sessionId: string) {
  return db.transaction(async (tx) => {
    const access = await learningAccessInTransaction(tx, actor);
    const session = await ownedSession(tx, actor, sessionId);
    const lesson = lessonSchema.parse(session.snapshot);
    await assertCurrentSessionAccess(tx, actor, session, lesson, access);
    const saved = await tx
      .select()
      .from(attempts)
      .where(eq(attempts.sessionId, sessionId))
      .orderBy(attempts.createdAt);
    const givenHints = await tx.select().from(hints).where(eq(hints.sessionId, sessionId));
    const sessionReports = await tx
      .select({ itemId: reports.itemId, category: reports.category, detail: reports.detail })
      .from(reports)
      .where(eq(reports.sessionId, sessionId));
    const suspended = await contentIsSuspended(tx, sourceLessonsForSnapshot(lesson), false);
    return { session, saved, givenHints, sessionReports, suspended };
  });
}
/**
 * Contagem por habilidade do último percurso concluído do mesmo modo, anterior
 * a esta sessão.
 *
 * Permite a devolutiva dizer "4/6 → 5/6" sem nota, sem média e sem
 * classificação. Usa a coluna `correct` já gravada em vez de reavaliar as
 * respostas antigas: o conteúdo pode ter mudado de versão, e recorrigir o
 * passado reescreveria o histórico.
 */
export async function previousAssessment(
  actor: LearningAuthority,
  profileId: string,
  mode: "diagnostic" | "exam",
  before: Date,
) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, actor, profileId);

    const [previous] = await tx
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        readingSupport: sessions.readingSupport,
      })
      .from(sessions)
      .innerJoin(profiles, eq(sessions.profileId, profiles.id))
      .where(
        and(
          studentAccessCondition(actor, profiles.id),
          eq(sessions.profileId, profileId),
          eq(sessions.mode, mode),
          isNotNull(sessions.completedAt),
          lt(sessions.createdAt, before),
        ),
      )
      .orderBy(desc(sessions.createdAt))
      .limit(1);
    if (!previous) return null;
    const rows = await tx
      .select({
        sessionId: attempts.sessionId,
        itemId: attempts.itemId,
        skillId: attempts.skillId,
        correct: attempts.correct,
      })
      .from(attempts)
      .where(eq(attempts.sessionId, previous.id));
    const counts: Record<string, { correct: number; total: number }> = {};
    for (const row of await validAttemptRows(rows, tx)) {
      // Reflexões não têm acerto objetivo e ficam fora da comparação.
      if (row.correct === null) continue;
      const current = counts[row.skillId] ?? { correct: 0, total: 0 };
      counts[row.skillId] = {
        correct: current.correct + (row.correct ? 1 : 0),
        total: current.total + 1,
      };
    }
    return { createdAt: previous.createdAt, readingSupport: previous.readingSupport, counts };
  });
}

/**
 * Registra que a leitura em voz alta foi usada nesta sessão.
 *
 * Só vale enquanto a sessão está aberta: depois de concluída, ouvir a
 * devolutiva não muda o que foi medido. A coluna só caminha de falso para
 * verdadeiro, então a operação é idempotente por natureza.
 */
export async function markReadingSupport(actor: LearningAuthority, sessionId: string) {
  return db.transaction(async (tx) => {
    const session = await ownedSession(tx, actor, sessionId, "write");
    // Já declarado: repetir a leitura não é falha, é a mesma verdade.
    if (session.readingSupport) return true;
    // Percurso encerrado é história imutável — ouvir na revisão não muda como
    // as respostas foram produzidas, e o cliente precisa saber que não marcou.
    if (session.completedAt || session.interruptedAt) return false;
    await tx.update(sessions).set({ readingSupport: true }).where(eq(sessions.id, session.id));
    return true;
  });
}
export async function recordAnswer(
  actor: LearningAuthority,
  input: {
    sessionId: string;
    itemId: string;
    answer: string;
    requestKey: string;
    readingSupport?: boolean;
  },
) {
  return db.transaction(async (tx) => {
    const access = await learningAccessInTransaction(tx, actor);
    const session = await ownedSession(tx, actor, input.sessionId, "write");
    const lesson = lessonSchema.parse(session.snapshot);
    await assertCurrentSessionAccess(tx, actor, session, lesson, access);
    const existing = await tx.select().from(attempts).where(eq(attempts.sessionId, session.id));
    const replay = existing.find(
      (row) => row.id === input.requestKey || row.itemId === input.itemId,
    );
    if (replay) {
      assertAllowed(
        replay.id === input.requestKey &&
          replay.itemId === input.itemId &&
          replay.answer === input.answer,
        "CONFLICT",
        "Esta questão já foi respondida. Retome a missão para ver o registro.",
      );
      return { attempt: replay, completed: session.completedAt !== null };
    }
    assertAllowed(
      !session.interruptedAt,
      "INTERRUPTED",
      "Esta missão foi encerrada por manutenção.",
    );
    assertAllowed(
      !(await contentIsSuspended(tx, sourceLessonsForSnapshot(lesson), true)),
      "WITHDRAWN",
      "Esta missão foi pausada para correção. Suas respostas anteriores continuam guardadas.",
    );
    assertAllowed(!session.completedAt, "COMPLETE", "Esta missão já terminou.");
    const item = lesson.items[existing.length];
    assertAllowed(item?.id === input.itemId, "ORDER", "Retome a questão atual antes de responder.");
    const evaluation = gradeAnswer(item, input.answer);
    assertAllowed(evaluation.valid, "ANSWER", evaluation.message ?? "Revise sua resposta.");
    // A leitura pode ter ocorrido mesmo quando a marca separada falhou.
    // Grave o fato com a tentativa, antes de encerrar a avaliação; false e
    // campos ausentes nunca removem uma declaração anterior de apoio.
    if (
      input.readingSupport &&
      !session.readingSupport &&
      (session.mode === "diagnostic" || session.mode === "exam")
    )
      await tx.update(sessions).set({ readingSupport: true }).where(eq(sessions.id, session.id));
    const [hint] = await tx
      .select()
      .from(hints)
      .where(and(eq(hints.sessionId, session.id), eq(hints.itemId, item.id)));
    const [attempt] = await tx
      .insert(attempts)
      .values({
        id: input.requestKey,
        sessionId: session.id,
        itemId: item.id,
        skillId: item.skillId,
        familyId: item.familyId,
        answer: input.answer,
        correct: evaluation.correct,
        result: evaluation.result,
        helpCount: hint?.count ?? 0,
      })
      .returning();
    assertAllowed(attempt, "SAVE", "Não foi possível registrar sua resposta.");
    const completed = existing.length + 1 === lesson.items.length;
    if (completed)
      await tx.update(sessions).set({ completedAt: new Date() }).where(eq(sessions.id, session.id));
    return { attempt, completed };
  });
}
export function recordHint(
  actor: LearningAuthority,
  input: { sessionId: string; itemId: string; level: number },
) {
  return db.transaction((tx) => recordHintInTransaction(tx, actor, input));
}
export async function recordHintInTransaction(
  tx: Tx,
  actor: LearningAuthority,
  input: { sessionId: string; itemId: string; level: number },
) {
  const access = await learningAccessInTransaction(tx, actor);
  const session = await ownedSession(tx, actor, input.sessionId, "write");
  assertAllowed(
    session.mode !== "exam" && session.mode !== "diagnostic",
    "MODE",
    "As pistas ficam disponíveis no treino.",
  );
  assertAllowed(!session.completedAt, "COMPLETE", "Esta missão já terminou.");
  assertAllowed(!session.interruptedAt, "INTERRUPTED", "Esta missão foi encerrada por manutenção.");
  const lesson = lessonSchema.parse(session.snapshot);
  await assertCurrentSessionAccess(tx, actor, session, lesson, access);
  assertAllowed(
    !(await contentIsSuspended(tx, sourceLessonsForSnapshot(lesson), true)),
    "WITHDRAWN",
    "Esta missão foi pausada para correção. Suas respostas anteriores continuam guardadas.",
  );
  const saved = await tx
    .select({ id: attempts.id })
    .from(attempts)
    .where(eq(attempts.sessionId, session.id));
  const item = lesson.items[saved.length];
  assertAllowed(item?.id === input.itemId, "ORDER", "Esta não é a questão atual.");
  const [previous] = await tx
    .select()
    .from(hints)
    .where(and(eq(hints.sessionId, session.id), eq(hints.itemId, item.id)));
  assertAllowed(
    input.level <= (previous?.count ?? 0) + 1,
    "ORDER",
    "Leia a pista anterior primeiro.",
  );
  const nextCount = Math.max(previous?.count ?? 0, input.level);
  await tx
    .insert(hints)
    .values({ sessionId: session.id, itemId: item.id, count: nextCount })
    .onConflictDoUpdate({ target: [hints.sessionId, hints.itemId], set: { count: nextCount } });
  return item.hints.slice(0, nextCount);
}
export async function interruptSession(actor: LearningAuthority, sessionId: string) {
  return db.transaction(async (tx) => {
    const session = await ownedSession(tx, actor, sessionId, "write");
    if (session.interruptedAt) return session;
    assertAllowed(!session.completedAt, "COMPLETE", "Esta missão já terminou.");
    const lesson = lessonSchema.parse(session.snapshot);
    assertAllowed(
      await contentIsSuspended(tx, sourceLessonsForSnapshot(lesson), true),
      "AVAILABLE",
      "Esta missão voltou a ficar disponível e pode ser retomada.",
    );
    const [interrupted] = await tx
      .update(sessions)
      .set({
        interruptedAt: new Date(),
        interruptionReason: "Conteúdo pausado para correção",
      })
      .where(
        and(
          eq(sessions.id, session.id),
          isNull(sessions.completedAt),
          isNull(sessions.interruptedAt),
        ),
      )
      .returning();
    return interrupted ?? (await ownedSession(tx, actor, sessionId, "write"));
  });
}
/** A invalidação vale para toda leitura de evidências, pela versão exata do item. */
async function validAttemptRows<T extends { sessionId: string; itemId: string }>(
  rows: T[],
  reader: Pick<Tx, "select"> = db,
) {
  if (!rows.length) return rows;
  const decisions = await reader
    .select({ items: contentControls.invalidatedItems })
    .from(contentControls)
    .where(inArray(contentControls.status, ["suspended", "invalidated"]));
  const items = decisions.flatMap((row) => row.items);
  if (!items.length) return rows;
  const invalidated = new Set(items.map((item) => `${item.itemId}:${item.itemHash}`));
  const invalidatedIds = new Set(items.map((item) => item.itemId));
  const sessionIds = [
    ...new Set(rows.filter((row) => invalidatedIds.has(row.itemId)).map((row) => row.sessionId)),
  ];
  if (!sessionIds.length) return rows;
  const snapshots = await reader
    .select({ id: sessions.id, snapshot: sessions.snapshot })
    .from(sessions)
    .where(inArray(sessions.id, sessionIds));
  const excluded = new Set<string>();
  for (const session of snapshots) {
    const lesson = lessonSchema.parse(session.snapshot);
    for (const item of lesson.items)
      if (invalidated.has(`${item.id}:${itemHash(item)}`)) excluded.add(`${session.id}:${item.id}`);
  }
  return rows.filter((row) => !excluded.has(`${row.sessionId}:${row.itemId}`));
}

export async function history(actor: LearningAuthority, profileId: string) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, actor, profileId);
    /* Os snapshots das avaliações identificam famílias expostas. A política
     compartilhada de invalidação lê outros snapshots só quando há item afetado. */
    const [attemptRows, sessionRows] = await Promise.all([
      tx
        .select({ attempt: attempts, mode: sessions.mode, completedAt: sessions.completedAt })
        .from(attempts)
        .innerJoin(sessions, eq(attempts.sessionId, sessions.id))
        .where(eq(sessions.profileId, profileId)),
      tx
        .select({ id: sessions.id, mode: sessions.mode, completedAt: sessions.completedAt })
        .from(sessions)
        .where(eq(sessions.profileId, profileId)),
    ]);
    const snapshotIds = new Set([
      ...sessionRows
        .filter((session) => session.mode === "diagnostic" || session.mode === "exam")
        .map((session) => session.id),
    ]);
    const snapshotRows = snapshotIds.size
      ? await tx
          .select({ id: sessions.id, snapshot: sessions.snapshot })
          .from(sessions)
          .where(inArray(sessions.id, [...snapshotIds]))
      : [];
    const parsedBySession = new Map(
      snapshotRows.map((session) => {
        const parsed = lessonSchema.safeParse(session.snapshot);
        return [session.id, parsed.success ? parsed.data : null] as const;
      }),
    );
    const assessmentSessions = sessionRows.filter(
      (session) => session.mode === "diagnostic" || session.mode === "exam",
    );
    const assessmentExposedFamilyIds = new Set<string>();
    for (const session of assessmentSessions) {
      const parsed = { success: true as const, data: parsedBySession.get(session.id) };
      if (!parsed.data) continue;
      const answered = attemptRows.filter((row) => row.attempt.sessionId === session.id).length;
      const exposed = session.completedAt ? parsed.data.items.length : answered + 1;
      for (const item of parsed.data.items.slice(0, exposed))
        assessmentExposedFamilyIds.add(item.familyId);
    }
    const visibleRows = await validAttemptRows(
      attemptRows
        .filter(
          (row) => (row.mode !== "exam" && row.mode !== "diagnostic") || row.completedAt !== null,
        )
        .map((row) => ({ ...row, sessionId: row.attempt.sessionId, itemId: row.attempt.itemId })),
      tx,
    );
    const evidence: Evidence[] = visibleRows
      .filter((row) => row.attempt.correct !== null && row.attempt.result !== "reflection")
      .map(({ attempt, mode }) => ({ ...attempt, correct: attempt.correct ?? false, mode }));
    const reflections = visibleRows
      .filter((row) => row.attempt.result === "reflection")
      .map(({ attempt }) => ({
        sessionId: attempt.sessionId,
        itemId: attempt.itemId,
        skillId: attempt.skillId,
        createdAt: attempt.createdAt,
      }));
    const attemptedItemIds = [...new Set(visibleRows.map((row) => row.attempt.itemId))];
    const recent = await tx
      .select(sessionSummary)
      .from(sessions)
      .where(eq(sessions.profileId, profileId))
      .orderBy(desc(sessions.createdAt))
      .limit(30);
    const pausedCandidates = await tx
      .select({ ...sessionSummary, snapshot: sessions.snapshot })
      .from(sessions)
      .where(
        and(
          eq(sessions.profileId, profileId),
          isNull(sessions.completedAt),
          isNull(sessions.interruptedAt),
        ),
      )
      .orderBy(desc(sessions.createdAt), desc(sessions.id))
      .limit(30);
    const states = await contentStates(tx);
    const paused = pausedCandidates.find((session) => {
      const parsed = lessonSchema.safeParse(session.snapshot);
      return (
        parsed.success &&
        sourceLessonsForSnapshot(parsed.data).every(
          (source) => states.get(source.id)?.status !== "suspended",
        )
      );
    });
    const [diagnostic] = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.profileId, profileId),
          eq(sessions.mode, "diagnostic"),
          sql`${sessions.completedAt} is not null`,
        ),
      )
      .limit(1);
    return {
      evidence,
      attemptedItemIds,
      recent,
      paused: paused ? { ...paused, snapshot: undefined } : null,
      diagnosed: !!diagnostic,
      reflections,
      assessmentExposedFamilyIds: [...assessmentExposedFamilyIds],
    };
  });
}
const sessionSummary = {
  id: sessions.id,
  lessonId: sessions.lessonId,
  mode: sessions.mode,
  title: sql<string>`${sessions.snapshot}->>'title'`,
  createdAt: sessions.createdAt,
  completedAt: sessions.completedAt,
  interruptedAt: sessions.interruptedAt,
  interruptionReason: sessions.interruptionReason,
};
export async function sessionHistory(actor: LearningAuthority, profileId: string, before?: string) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, actor, profileId);
    const rows = await tx
      .select(sessionSummary)
      .from(sessions)
      .where(
        and(
          eq(sessions.profileId, profileId),
          before
            ? sql`(${sessions.createdAt}, ${sessions.id}) < (select ${sessions.createdAt}, ${sessions.id} from ${sessions} where ${sessions.id} = ${before}::uuid and ${sessions.profileId} = ${profileId}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(sessions.createdAt), desc(sessions.id))
      .limit(21);
    const items = rows.slice(0, 20);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > 20 && last ? last.id : null,
    };
  });
}
export async function listNotes(actor: LearningAuthority, profileId: string) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, actor, profileId);
    return tx
      .select()
      .from(notes)
      .where(eq(notes.profileId, profileId))
      .orderBy(desc(notes.createdAt))
      .limit(100);
  });
}
export type NoteContext = {
  sessionId: string;
  itemId: string | null;
  title: string;
  prompt: string | null;
};

async function noteContext(
  tx: Tx,
  actor: LearningAuthority,
  profileId: string,
  sessionId: string,
  itemId?: string | null,
): Promise<NoteContext> {
  const session = await ownedSession(tx, actor, sessionId);
  assertAllowed(session.profileId === profileId, "PROFILE", "Escolha uma missão deste estudante.");
  const lesson = lessonSchema.parse(session.snapshot);
  const item = itemId ? lesson.items.find((item) => item.id === itemId) : undefined;
  assertAllowed(!itemId || item, "ITEM", "Esta questão não pertence à missão.");
  return { sessionId, itemId: item?.id ?? null, title: lesson.title, prompt: item?.prompt ?? null };
}

export async function readNoteContext(
  actor: LearningAuthority,
  profileId: string,
  sessionId: string,
  itemId?: string,
) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, actor, profileId);
    return noteContext(tx, actor, profileId, sessionId, itemId);
  });
}

export async function notebookPage(
  actor: LearningAuthority,
  profileId: string,
  input: { archived?: boolean; search?: string; cursor?: string } = {},
) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, actor, profileId);
    const [anchor] = input.cursor
      ? await tx
          .select()
          .from(notes)
          .where(and(eq(notes.id, input.cursor), eq(notes.profileId, profileId)))
      : [];
    assertAllowed(!input.cursor || anchor, "CURSOR", "A página mudou. Volte ao início do caderno.");
    const search = input.search?.trim();
    // %, _ e barra são caracteres pesquisados, não curingas de SQL.
    const pattern = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : undefined;
    const rows = await tx
      .select({ note: notes, snapshot: sessions.snapshot })
      .from(notes)
      .leftJoin(sessions, eq(notes.sessionId, sessions.id))
      .where(
        and(
          eq(notes.profileId, profileId),
          input.archived ? isNotNull(notes.archivedAt) : isNull(notes.archivedAt),
          pattern ? ilike(notes.text, pattern) : undefined,
          anchor
            ? or(
                lt(notes.createdAt, anchor.createdAt),
                and(eq(notes.createdAt, anchor.createdAt), lt(notes.id, anchor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(notes.createdAt), desc(notes.id))
      .limit(21);
    const [totals] = await tx
      .select({
        active: sql<number>`count(*) filter (where ${notes.archivedAt} is null)::int`,
        archived: sql<number>`count(*) filter (where ${notes.archivedAt} is not null)::int`,
      })
      .from(notes)
      .where(eq(notes.profileId, profileId));
    const items = rows.slice(0, 20).map(({ note, snapshot }) => {
      const lesson = snapshot ? lessonSchema.parse(snapshot) : null;
      return {
        ...note,
        labAttachment: note.labAttachment ? labAttachmentSchema.parse(note.labAttachment) : null,
        context:
          note.sessionId && lesson
            ? {
                sessionId: note.sessionId,
                itemId: note.itemId,
                title: lesson.title,
                prompt: lesson.items.find((item) => item.id === note.itemId)?.prompt ?? null,
              }
            : null,
      };
    });
    return {
      items,
      next: rows.length > 20 ? (items.at(-1)?.id ?? null) : null,
      activeCount: totals?.active ?? 0,
      archivedCount: totals?.archived ?? 0,
    };
  });
}

export async function saveNote(
  actor: LearningAuthority,
  profileId: string,
  text: string,
  context?: { sessionId: string; itemId?: string },
) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, actor, profileId, "write");
    const [total] = await tx
      .select({ value: count() })
      .from(notes)
      .where(and(eq(notes.profileId, profileId), isNull(notes.archivedAt)));
    assertAllowed(
      (total?.value ?? 0) < 100,
      "LIMIT",
      "Seu caderno tem 100 anotações ativas. Arquive uma para abrir espaço sem apagar suas ideias.",
    );
    const source = context
      ? await noteContext(tx, actor, profileId, context.sessionId, context.itemId)
      : null;
    await tx
      .insert(notes)
      .values({ profileId, text, sessionId: source?.sessionId, itemId: source?.itemId });
  });
}

export async function editNote(
  actor: LearningAuthority,
  profileId: string,
  id: string,
  text: string,
) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, actor, profileId, "write");
    const [saved] = await tx
      .update(notes)
      .set({ text })
      .where(and(eq(notes.id, id), eq(notes.profileId, profileId)))
      .returning({ id: notes.id });
    assertAllowed(saved, "NOT_FOUND", "Anotação não encontrada.");
  });
}

export async function archiveNote(
  actor: LearningAuthority,
  profileId: string,
  id: string,
  archived: boolean,
) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, actor, profileId, "write");
    const [note] = await tx
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.profileId, profileId)));
    assertAllowed(note, "NOT_FOUND", "Anotação não encontrada.");
    if (!archived && note.archivedAt) {
      const [total] = await tx
        .select({ value: count() })
        .from(notes)
        .where(and(eq(notes.profileId, profileId), isNull(notes.archivedAt)));
      assertAllowed(
        (total?.value ?? 0) < 100,
        "LIMIT",
        "Arquive outra anotação antes de restaurar esta. O limite é de 100 ativas.",
      );
    }
    await tx
      .update(notes)
      .set({ archivedAt: archived ? (note.archivedAt ?? new Date()) : null })
      .where(eq(notes.id, id));
  });
}
export async function removeNote(actor: LearningAuthority, profileId: string, id: string) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, actor, profileId, "write");
    await tx.delete(notes).where(and(eq(notes.id, id), eq(notes.profileId, profileId)));
  });
}
export async function saveReport(
  actor: LearningAuthority,
  input: {
    sessionId: string;
    itemId: string;
    category: "not_understood" | "possible_error" | "figure_issue" | "app_difficulty";
    detail: string;
    requestKey: string;
  },
) {
  return db.transaction(async (tx) => {
    const session = await ownedSession(tx, actor, input.sessionId, "write");
    await lockOwner(tx, actor.userId);

    const [replay] = await tx
      .select()
      .from(reports)
      .where(and(eq(reports.userId, actor.userId), eq(reports.requestKey, input.requestKey)));
    if (replay) {
      assertAllowed(
        replay.sessionId === input.sessionId &&
          replay.itemId === input.itemId &&
          replay.category === input.category &&
          replay.detail === input.detail,
        "CONFLICT",
        "Este envio já foi usado para outro relato.",
      );
      return replay;
    }
    const [semanticReplay] = await tx
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.userId, actor.userId),
          eq(reports.sessionId, input.sessionId),
          eq(reports.itemId, input.itemId),
          eq(reports.category, input.category),
        ),
      )
      .limit(1);
    if (semanticReplay) {
      assertAllowed(
        semanticReplay.detail === input.detail,
        "CONFLICT",
        "Este tipo de relato já foi registrado para a questão. Consulte o envio anterior.",
      );
      return semanticReplay;
    }
    const lesson = lessonSchema.parse(session.snapshot);
    assertAllowed(
      lesson.items.some((item) => item.id === input.itemId),
      "ITEM",
      "Questão não encontrada.",
    );
    const [daily] = await tx
      .select({ total: count() })
      .from(reports)
      .where(
        and(
          eq(reports.userId, actor.userId),
          gte(reports.createdAt, new Date(Date.now() - 86_400_000)),
        ),
      );
    assertAllowed((daily?.total ?? 0) < 10, "LIMIT", "Limite de relatos de hoje atingido.");
    const [created] = await tx
      .insert(reports)
      .values({
        userId: actor.userId,
        profileId: session.profileId,
        sessionId: session.id,
        lessonId: lesson.id,
        version: lesson.version,
        itemId: input.itemId,
        category: input.category,
        detail: input.detail,
        requestKey: input.requestKey,
      })
      .returning();
    assertAllowed(created, "SAVE", "Não foi possível registrar o relato.");
    return created;
  });
}
export async function setRoutine(userId: string, dailyMinutes: number) {
  await db.transaction(async (tx) => {
    await lockActiveWebParticipation(tx, userId);
    await tx
      .insert(families)
      .values({ userId, dailyMinutes })
      .onConflictDoUpdate({ target: families.userId, set: { dailyMinutes } });
  });
}
/**
 * Data do último simulado concluído deste perfil.
 *
 * Consulta própria porque `recent` traz só os trinta percursos mais novos: quem
 * fez trinta missões desde a última prova veria "nenhum ainda" tendo feito
 * várias.
 */
export async function lastExamDate(actor: LearningAuthority, profileId: string) {
  const [ultimo] = await db
    .select({ createdAt: sessions.createdAt })
    .from(sessions)
    .innerJoin(profiles, eq(sessions.profileId, profiles.id))
    .where(
      and(
        studentAccessCondition(actor, profiles.id),
        eq(sessions.profileId, profileId),
        eq(sessions.mode, "exam"),
        isNotNull(sessions.completedAt),
      ),
    )
    .orderBy(desc(sessions.createdAt))
    .limit(1);
  return ultimo?.createdAt ?? null;
}

/**
 * Responsáveis que optaram pelo resumo semanal, com o e-mail verificado e sem
 * cancelamento ativo.
 *
 * O cancelamento é excluído aqui, e não só na entrega: montar o corpo custa uma
 * leitura de todo o histórico de cada filho, e seria um relato completo sobre
 * uma criança construído toda semana para ser descartado em seguida.
 */
export async function listFamiliesForWeeklyReport(
  input: { week?: string; after?: string; limit?: number } = {},
) {
  return db
    .select({ userId: families.userId, email: users.email })
    .from(families)
    .innerJoin(users, eq(families.userId, users.id))
    .leftJoin(
      emailUnsubscribes,
      and(
        eq(emailUnsubscribes.userId, families.userId),
        eq(emailUnsubscribes.category, "missao.weekly-report"),
      ),
    )
    .where(
      and(
        eq(families.weeklyReportEmail, true),
        eq(users.emailVerified, true),
        activeWebParticipationCondition(users.id),
        sql`(${users.banned} = false OR ${users.banExpiresAt} <= statement_timestamp())`,
        isNull(emailUnsubscribes.userId),
        input.week
          ? or(
              isNull(families.weeklyReportProcessedWeek),
              lt(families.weeklyReportProcessedWeek, input.week),
            )
          : undefined,
        input.after ? gt(families.userId, input.after) : undefined,
      ),
    )
    .orderBy(families.userId)
    .limit(input.limit ?? 21);
}

export async function completeWeeklyReport(userId: string, week: string) {
  await db.transaction(async (tx) => {
    const participation = await lockWebParticipation(tx, userId);
    if (participation.state !== "active") return;
    await tx
      .update(families)
      .set({ weeklyReportProcessedWeek: week })
      .where(
        and(
          eq(families.userId, userId),
          or(
            isNull(families.weeklyReportProcessedWeek),
            lt(families.weeklyReportProcessedWeek, week),
          ),
        ),
      );
  });
}

/** Quantas descobertas o perfil guardou. Contagem, não lista: o caderno pagina. */
export async function countNotes(actor: LearningAuthority, profileId: string) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, actor, profileId);
    const [linha] = await tx
      .select({ total: count() })
      .from(notes)
      .where(eq(notes.profileId, profileId));
    return linha?.total ?? 0;
  });
}
export async function setWeeklyReportEmail(userId: string, enabled: boolean) {
  /* As duas escritas andam juntas: se o UPDATE gravasse e o DELETE falhasse, o
     botão diria "ativado" e a política de entrega continuaria descartando todo
     envio, para sempre e em silêncio. */
  await db.transaction(async (tx) => {
    await lockActiveWebParticipation(tx, userId);
    await tx
      .insert(families)
      .values({ userId, ...{ weeklyReportEmail: enabled } })
      .onConflictDoUpdate({ target: families.userId, set: { weeklyReportEmail: enabled } });
    // O dispatcher relê esta política imediatamente antes da entrega. Desligar
    // precisa bloquear também o lote que já selecionou esta família.
    if (enabled)
      await tx
        .delete(emailUnsubscribes)
        .where(
          and(
            eq(emailUnsubscribes.userId, userId),
            eq(emailUnsubscribes.category, "missao.weekly-report"),
          ),
        );
    else
      await tx
        .insert(emailUnsubscribes)
        .values({ userId, category: "missao.weekly-report" })
        .onConflictDoNothing();
  });
}

/**
 * Se o responsável cancelou pelo link do e-mail, a coluna da família continua
 * ligada e só a política de entrega sabe do cancelamento. A área da família
 * precisa mostrar o estado real, não o da coluna.
 */
export async function weeklyReportUnsubscribed(userId: string) {
  const [linha] = await db
    .select({ userId: emailUnsubscribes.userId })
    .from(emailUnsubscribes)
    .where(
      and(
        eq(emailUnsubscribes.userId, userId),
        eq(emailUnsubscribes.category, "missao.weekly-report"),
      ),
    );
  return !!linha;
}

/**
 * Desafio da semana e o que a família já percorreu dele.
 *
 * O progresso conta **famílias de atividade distintas** resolvidas sem pistas na
 * semana, somando todos os perfis. Distinto por família, e não por tentativa: a
 * meta é de variedade, e repetir a mesma estratégia não aumenta a barra. A
 * contribuição por perfil vem junto para o cartão mostrar quem participou, sem
 * ordenar ninguém.
 */
export async function familyChallenge(actor: LearningAuthority, weekStart: string) {
  const [challenge] = await db
    .select()
    .from(familyChallenges)
    .where(
      and(
        eq(familyChallenges.familyGroupId, actor.familyGroupId),
        eq(familyChallenges.weekStart, weekStart),
        familyMembershipCondition(actor.userId, familyChallenges.familyGroupId),
        actor.kind === "study"
          ? studentAccessCondition(actor, sql`${actor.profileId}::uuid`)
          : undefined,
      ),
    );
  /* Sem meta aceita não há barra para preencher, e a varredura da semana inteira
     não precisa acontecer. A maioria das famílias nunca aceita um desafio, e
     esta página abre em toda sessão de estudo. */
  if (!challenge) return { goal: null, progress: 0, contributions: [] };
  /* O recorte precisa ser um instante, porque quem filtra é o banco. São Paulo
     está em UTC-3 o ano inteiro desde 2019, então a meia-noite local da segunda
     é 03:00 UTC. `weeklyEvidence` compara dias locais em JavaScript e continua
     correta se o horário de verão voltar; esta janela precisaria de ajuste. */
  const inicio = new Date(`${weekStart}T03:00:00.000Z`);
  const fim = new Date(inicio.getTime() + 7 * 86_400_000);
  const rows = await db
    .select({
      profileId: profiles.id,
      nickname: sql<string>`coalesce(${users.name}, ${familyPeople.displayName})`,
      familyId: attempts.familyId,
      sessionId: attempts.sessionId,
      itemId: attempts.itemId,
    })
    .from(attempts)
    .innerJoin(sessions, eq(attempts.sessionId, sessions.id))
    .innerJoin(profiles, eq(sessions.profileId, profiles.id))
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, profiles.familyProfileId))
    .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
    .leftJoin(users, eq(users.id, familyPeople.userId))
    .where(
      and(
        studentAccessCondition(actor, profiles.id),
        gte(attempts.createdAt, inicio),
        lt(attempts.createdAt, fim),
        eq(attempts.correct, true),
        eq(attempts.helpCount, 0),
        /* Diagnóstico e simulado ficam de fora, pela mesma razão que
           `skillStates` os exclui: neles não existe pista, então toda resposta
           certa teria `helpCount = 0` e um único diagnóstico de doze itens
           encheria a meta da semana inteira. A barra mede estratégia resolvida
           no treino, não desempenho em avaliação. */
        inArray(sessions.mode, ["mission", "review"]),
      ),
    );
  const distintas = new Set<string>();
  const porPerfil = new Map<string, { nickname: string; families: Set<string> }>();
  for (const row of await validAttemptRows(rows)) {
    distintas.add(row.familyId);
    const atual = porPerfil.get(row.profileId) ?? { nickname: row.nickname, families: new Set() };
    atual.families.add(row.familyId);
    porPerfil.set(row.profileId, atual);
  }
  return {
    goal: challenge.goal as number | null,
    progress: distintas.size,
    contributions: [...porPerfil].map(([profileId, dados]) => ({
      profileId,
      nickname: dados.nickname,
      strategies: dados.families.size,
    })),
  };
}
export async function setFamilyChallenge(
  actor: LearningAuthority,
  weekStart: string,
  goal: number,
) {
  assertAllowed(actor.kind === "parent", "AUTH", "Abra a área da família.");
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId, "administrator");
    await tx
      .insert(familyChallenges)
      .values({ userId: actor.userId, familyGroupId: actor.familyGroupId, weekStart, goal })
      .onConflictDoUpdate({
        target: [familyChallenges.familyGroupId, familyChallenges.weekStart],
        set: { goal },
      });
  });
}
export async function clearFamilyChallenge(actor: LearningAuthority, weekStart: string) {
  assertAllowed(actor.kind === "parent", "AUTH", "Abra a área da família.");
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId, "administrator");
    await tx
      .delete(familyChallenges)
      .where(
        and(
          eq(familyChallenges.familyGroupId, actor.familyGroupId),
          eq(familyChallenges.weekStart, weekStart),
        ),
      );
  });
}
export async function familyReports(actor: ParentAuthority, profileId?: string) {
  return db
    .select({
      id: reports.id,
      lessonId: reports.lessonId,
      version: reports.version,
      itemId: reports.itemId,
      category: reports.category,
      detail: reports.detail,
      status: reports.status,
      resolution: reports.resolution,
      createdAt: reports.createdAt,
      resolvedAt: reports.resolvedAt,
    })
    .from(reports)
    .where(
      and(
        studentAccessCondition(actor, reports.profileId),
        profileId ? eq(reports.profileId, profileId) : undefined,
      ),
    )
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(100);
}
export async function exportFamily(actor: ParentAuthority) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    const familyProfiles = await readStudents(tx, actor);
    if (familyProfiles.length)
      await lockStudentAccess(
        tx,
        actor,
        familyProfiles.map((profile) => profile.id),
        "read",
      );
    const ids = familyProfiles.map((profile) => profile.id);
    const familySessions = ids.length
      ? await tx.select().from(sessions).where(inArray(sessions.profileId, ids))
      : [];
    const sessionIds = familySessions.map((session) => session.id);
    const pendingAssessments = new Set(
      familySessions
        .filter(
          (session) =>
            !session.completedAt && (session.mode === "exam" || session.mode === "diagnostic"),
        )
        .map((session) => session.id),
    );
    const familyAttempts = sessionIds.length
      ? await tx.select().from(attempts).where(inArray(attempts.sessionId, sessionIds))
      : [];
    return {
      exportedAt: new Date().toISOString(),
      profiles: familyProfiles,
      family: await tx.select().from(families).where(eq(families.userId, actor.userId)),
      sessions: familySessions.map(({ snapshot: _snapshot, ...session }) => session),
      attempts: familyAttempts.map((attempt) => ({
        ...attempt,
        correct: pendingAssessments.has(attempt.sessionId) ? null : attempt.correct,
        result: pendingAssessments.has(attempt.sessionId) ? null : attempt.result,
      })),
      hints: sessionIds.length
        ? await tx.select().from(hints).where(inArray(hints.sessionId, sessionIds))
        : [],
      notes: ids.length ? await tx.select().from(notes).where(inArray(notes.profileId, ids)) : [],
      experiments: ids.length
        ? await tx.select().from(experiments).where(inArray(experiments.profileId, ids))
        : [],
      labExecutions: ids.length
        ? await tx.select().from(labExecutions).where(inArray(labExecutions.profileId, ids))
        : [],
      reports: await tx
        .select()
        .from(reports)
        .where(studentAccessCondition(actor, reports.profileId)),
      challenges: await tx
        .select()
        .from(familyChallenges)
        .where(eq(familyChallenges.familyGroupId, actor.familyGroupId)),
      competitions: await exportCompetitions(tx, actor),
      puzzleSolves: ids.length
        ? await tx.select().from(puzzleSolves).where(inArray(puzzleSolves.profileId, ids))
        : [],
    };
  });
}
/** Clears only this app's selected family. Shared people, accounts and other apps survive. */
export async function clearFamily(actor: ParentAuthority) {
  assertAllowed(actor.kind === "parent", "AUTH", "Abra a área da família.");
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId, "administrator");
    const native = await tx
      .select({ id: profiles.id, activationId: profiles.familyProfileId })
      .from(profiles)
      .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, profiles.familyProfileId))
      .where(eq(familyAppProfiles.groupId, actor.familyGroupId));
    await tx
      .delete(missaoCompetitions)
      .where(eq(missaoCompetitions.familyGroupId, actor.familyGroupId));
    await tx
      .delete(familyChallenges)
      .where(eq(familyChallenges.familyGroupId, actor.familyGroupId));
    await tx
      .delete(missaoStudyDevices)
      .where(eq(missaoStudyDevices.familyGroupId, actor.familyGroupId));
    for (const profile of native) {
      assertAllowed(profile.activationId, "PROFILE", "Estudante não disponível.");
      await removeProfileInTransaction(
        tx,
        actor.userId,
        "missao-saber",
        profile.activationId,
        async (nested, activationId) => {
          await eraseMissaoProfiles(nested, [activationId]);
        },
      );
    }
  });
}
