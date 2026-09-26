import "server-only";
import { and, count, db, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "@informach/db";
import {
  missaoAttempts as attempts,
  missaoContentControls as contentControls,
  emailUnsubscribes,
  missaoExperiments as experiments,
  missaoFamilies as families,
  missaoFamilyChallenges as familyChallenges,
  missaoHints as hints,
  missaoNotes as notes,
  missaoProfiles as profiles,
  missaoReports as reports,
  missaoSessions as sessions,
  users,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { withBillingLifecycleWait } from "../billing/repository";
import { getAccess } from "../billing/service";
import { assertableAvailabilityMessage, lessonAvailability } from "../content/availability";
import { assessmentSources, type ContentIdentity, findCourse } from "../content/catalog";
import { type Lesson, lessonSchema } from "../content/types";
import { itemHash } from "../content/version";
import { allowedProfileIds } from "../family/profile-access";
import { type Evidence, gradeAnswer } from "./engine";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Profile = typeof profiles.$inferSelect;
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
async function ownedProfile(tx: Tx, userId: string, profileId: string) {
  const [profile] = await tx
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)));
  assertAllowed(profile, "NOT_FOUND", "Perfil não encontrado.");
  return profile;
}
async function ownedSession(tx: Tx, userId: string, sessionId: string) {
  const [session] = await tx
    .select({ session: sessions })
    .from(sessions)
    .innerJoin(profiles, eq(sessions.profileId, profiles.id))
    .where(and(eq(sessions.id, sessionId), eq(profiles.userId, userId)));
  assertAllowed(session, "NOT_FOUND", "Missão não encontrada.");
  return session.session;
}

async function assertCurrentSessionAccess(
  tx: Tx,
  userId: string,
  session: LearningSession,
  lesson: Lesson,
  access: Awaited<ReturnType<typeof getAccess>>,
) {
  // A completed session is immutable history. Open sessions must always reflect
  // the current subscription and the current profile position, even when they
  // were created before a payment failure or a plan downgrade.
  if (session.completedAt) return;
  const profile = await ownedProfile(tx, userId, session.profileId);
  const course = findCourse(profile.courseId);
  assertAllowed(course, "COURSE", "A trilha mudou. Volte ao início e escolha sua missão.");
  const orderedProfiles = await tx
    .select({ id: profiles.id, accessEnabled: profiles.accessEnabled })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .orderBy(profiles.createdAt, profiles.id);
  const availability = lessonAvailability({
    lesson,
    course,
    grade: profile.grade,
    paid: access.paid,
    profileAllowed: allowedProfileIds(orderedProfiles, access.profileLimit).includes(profile.id),
  });
  assertAllowed(
    availability.available,
    availability.reason,
    assertableAvailabilityMessage(availability.reason),
  );
}
export async function getProfiles(userId: string) {
  return db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .orderBy(profiles.createdAt, profiles.id);
}
export async function getFamily(userId: string) {
  const [family] = await db.select().from(families).where(eq(families.userId, userId));
  return family ?? null;
}
export async function addProfile(
  userId: string,
  input: Omit<Profile, "id" | "createdAt" | "userId" | "accessEnabled">,
  limit: number,
) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, userId);
    const existing = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, userId));
    assertAllowed(existing.length < limit, "PLAN", `Seu plano permite ${limit} estudante(s).`);
    await tx
      .insert(families)
      .values({ userId, consentVersion: "2026-09-13" })
      .onConflictDoNothing();
    const [profile] = await tx
      .insert(profiles)
      .values({ ...input, userId, accessEnabled: true })
      .returning();
    assertAllowed(profile, "SAVE", "Não foi possível criar o perfil.");
    return profile;
  });
}
export async function updateCourse(userId: string, profileId: string, courseId: string) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, userId);
    await ownedProfile(tx, userId, profileId);
    await tx.update(profiles).set({ courseId }).where(eq(profiles.id, profileId));
  });
}
export async function contentStates() {
  const rows = await db
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
  userId: string,
  profileId: string,
  lesson: Lesson,
  mode: LearningSession["mode"],
  requestKey: string,
) {
  return withBillingLifecycleWait(userId, async () => {
    const access = await getAccess(userId);
    return db.transaction(async (tx) => {
      await lockOwner(tx, userId);
      const profile = await ownedProfile(tx, userId, profileId);
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
      const orderedProfiles = await tx
        .select({ id: profiles.id, accessEnabled: profiles.accessEnabled })
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .orderBy(profiles.createdAt, profiles.id);
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
        profileAllowed: allowedProfileIds(orderedProfiles, access.profileLimit).includes(
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
  });
}
export async function readSession(userId: string, sessionId: string) {
  return withBillingLifecycleWait(userId, async () => {
    const access = await getAccess(userId);
    return db.transaction(async (tx) => {
      await lockOwner(tx, userId);
      const session = await ownedSession(tx, userId, sessionId);
      const lesson = lessonSchema.parse(session.snapshot);
      await assertCurrentSessionAccess(tx, userId, session, lesson, access);
      const saved = await tx
        .select()
        .from(attempts)
        .where(eq(attempts.sessionId, sessionId))
        .orderBy(attempts.createdAt);
      const givenHints = await tx.select().from(hints).where(eq(hints.sessionId, sessionId));
      const sessionReports = await tx
        .select({ itemId: reports.itemId, category: reports.category, detail: reports.detail })
        .from(reports)
        .where(and(eq(reports.userId, userId), eq(reports.sessionId, sessionId)));
      const suspended = await contentIsSuspended(tx, sourceLessonsForSnapshot(lesson), false);
      return { session, saved, givenHints, sessionReports, suspended };
    });
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
  userId: string,
  profileId: string,
  mode: "diagnostic" | "exam",
  before: Date,
) {
  const [previous] = await db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      readingSupport: sessions.readingSupport,
    })
    .from(sessions)
    .innerJoin(profiles, eq(sessions.profileId, profiles.id))
    .where(
      and(
        eq(profiles.userId, userId),
        eq(sessions.profileId, profileId),
        eq(sessions.mode, mode),
        isNotNull(sessions.completedAt),
        lt(sessions.createdAt, before),
      ),
    )
    .orderBy(desc(sessions.createdAt))
    .limit(1);
  if (!previous) return null;
  const rows = await db
    .select({ skillId: attempts.skillId, correct: attempts.correct })
    .from(attempts)
    .where(eq(attempts.sessionId, previous.id));
  const counts: Record<string, { correct: number; total: number }> = {};
  for (const row of rows) {
    // Reflexões não têm acerto objetivo e ficam fora da comparação.
    if (row.correct === null) continue;
    const current = counts[row.skillId] ?? { correct: 0, total: 0 };
    counts[row.skillId] = {
      correct: current.correct + (row.correct ? 1 : 0),
      total: current.total + 1,
    };
  }
  return { createdAt: previous.createdAt, readingSupport: previous.readingSupport, counts };
}

/**
 * Registra que a leitura em voz alta foi usada nesta sessão.
 *
 * Só vale enquanto a sessão está aberta: depois de concluída, ouvir a
 * devolutiva não muda o que foi medido. A coluna só caminha de falso para
 * verdadeiro, então a operação é idempotente por natureza.
 */
export async function markReadingSupport(userId: string, sessionId: string) {
  return db.transaction(async (tx) => {
    const session = await ownedSession(tx, userId, sessionId);
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
  userId: string,
  input: { sessionId: string; itemId: string; answer: string; requestKey: string },
) {
  return withBillingLifecycleWait(userId, async () => {
    const access = await getAccess(userId);
    return db.transaction(async (tx) => {
      await lockOwner(tx, userId);
      const session = await ownedSession(tx, userId, input.sessionId);
      const lesson = lessonSchema.parse(session.snapshot);
      await assertCurrentSessionAccess(tx, userId, session, lesson, access);
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
      assertAllowed(
        item?.id === input.itemId,
        "ORDER",
        "Retome a questão atual antes de responder.",
      );
      const evaluation = gradeAnswer(item, input.answer);
      assertAllowed(evaluation.valid, "ANSWER", evaluation.message ?? "Revise sua resposta.");
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
        await tx
          .update(sessions)
          .set({ completedAt: new Date() })
          .where(eq(sessions.id, session.id));
      return { attempt, completed };
    });
  });
}
export async function recordHint(
  userId: string,
  input: { sessionId: string; itemId: string; level: number },
) {
  return withBillingLifecycleWait(userId, async () => {
    const access = await getAccess(userId);
    return db.transaction(async (tx) => {
      await lockOwner(tx, userId);
      const session = await ownedSession(tx, userId, input.sessionId);
      assertAllowed(
        session.mode !== "exam" && session.mode !== "diagnostic",
        "MODE",
        "As pistas ficam disponíveis no treino.",
      );
      assertAllowed(!session.completedAt, "COMPLETE", "Esta missão já terminou.");
      assertAllowed(
        !session.interruptedAt,
        "INTERRUPTED",
        "Esta missão foi encerrada por manutenção.",
      );
      const lesson = lessonSchema.parse(session.snapshot);
      await assertCurrentSessionAccess(tx, userId, session, lesson, access);
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
    });
  });
}
export async function interruptSession(userId: string, sessionId: string) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, userId);
    const session = await ownedSession(tx, userId, sessionId);
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
    return interrupted ?? (await ownedSession(tx, userId, sessionId));
  });
}
export async function history(userId: string, profileId: string) {
  const owner = await getProfiles(userId);
  assertAllowed(
    owner.some((profile) => profile.id === profileId),
    "NOT_FOUND",
    "Perfil não encontrado.",
  );
  /* O snapshot da lição é grande e igual para todas as tentativas de uma
     sessão: vem uma vez por sessão, e cada tentativa o encontra pelo id. Esta
     consulta roda em toda página do app, então o tamanho importa. */
  const [attemptRows, sessionRows] = await Promise.all([
    db
      .select({ attempt: attempts, mode: sessions.mode, completedAt: sessions.completedAt })
      .from(attempts)
      .innerJoin(sessions, eq(attempts.sessionId, sessions.id))
      .where(eq(sessions.profileId, profileId)),
    db
      .select({
        id: sessions.id,
        mode: sessions.mode,
        snapshot: sessions.snapshot,
        completedAt: sessions.completedAt,
      })
      .from(sessions)
      .where(eq(sessions.profileId, profileId)),
  ]);
  const parsedBySession = new Map(
    sessionRows.map((session) => {
      const parsed = lessonSchema.safeParse(session.snapshot);
      return [session.id, parsed.success ? parsed.data : null] as const;
    }),
  );
  const rows = attemptRows.map((row) => ({
    ...row,
    lesson: parsedBySession.get(row.attempt.sessionId) ?? null,
  }));
  const assessmentSessions = sessionRows.filter(
    (session) => session.mode === "diagnostic" || session.mode === "exam",
  );
  const assessmentExposedFamilyIds = new Set<string>();
  for (const session of assessmentSessions) {
    const parsed = { success: true as const, data: parsedBySession.get(session.id) };
    if (!parsed.data) continue;
    const answered = rows.filter((row) => row.attempt.sessionId === session.id).length;
    const exposed = session.completedAt ? parsed.data.items.length : answered + 1;
    for (const item of parsed.data.items.slice(0, exposed))
      assessmentExposedFamilyIds.add(item.familyId);
  }
  const invalidationRows = await db
    .select({
      items: contentControls.invalidatedItems,
    })
    .from(contentControls)
    .where(inArray(contentControls.status, ["suspended", "invalidated"]));
  const invalidated = new Set(
    invalidationRows.flatMap((row) => row.items.map((item) => `${item.itemId}:${item.itemHash}`)),
  );
  const visibleRows = rows
    .filter((row) => (row.mode !== "exam" && row.mode !== "diagnostic") || row.completedAt !== null)
    .filter((row) => {
      const item = row.lesson?.items.find((candidate) => candidate.id === row.attempt.itemId);
      return !item || !invalidated.has(`${item.id}:${itemHash(item)}`);
    });
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
  const recent = await db
    .select()
    .from(sessions)
    .where(eq(sessions.profileId, profileId))
    .orderBy(desc(sessions.createdAt))
    .limit(30);
  const pausedCandidates = await db
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
  const states = await contentStates();
  const paused = pausedCandidates.find((session) => {
    const parsed = lessonSchema.safeParse(session.snapshot);
    return (
      parsed.success &&
      sourceLessonsForSnapshot(parsed.data).every(
        (source) => states.get(source.id)?.status !== "suspended",
      )
    );
  });
  const [diagnostic] = await db
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
export async function sessionHistory(userId: string, profileId: string, before?: string) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, userId, profileId);
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
export async function listNotes(userId: string, profileId: string) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, userId, profileId);
    return tx
      .select()
      .from(notes)
      .where(eq(notes.profileId, profileId))
      .orderBy(desc(notes.createdAt))
      .limit(100);
  });
}
export async function saveNote(userId: string, profileId: string, text: string) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, userId);
    await ownedProfile(tx, userId, profileId);
    const [total] = await tx
      .select({ value: count() })
      .from(notes)
      .where(eq(notes.profileId, profileId));
    assertAllowed(
      (total?.value ?? 0) < 100,
      "LIMIT",
      "Seu caderno tem 100 anotações. Exporte ou remova uma antes de acrescentar outra.",
    );
    await tx.insert(notes).values({ profileId, text });
  });
}
export async function removeNote(userId: string, profileId: string, id: string) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, userId);
    await ownedProfile(tx, userId, profileId);
    await tx.delete(notes).where(and(eq(notes.id, id), eq(notes.profileId, profileId)));
  });
}
export async function saveReport(
  userId: string,
  input: {
    sessionId: string;
    itemId: string;
    category: "not_understood" | "possible_error" | "figure_issue" | "app_difficulty";
    detail: string;
    requestKey: string;
  },
) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, userId);
    const [replay] = await tx
      .select()
      .from(reports)
      .where(and(eq(reports.userId, userId), eq(reports.requestKey, input.requestKey)));
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
          eq(reports.userId, userId),
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
    const session = await ownedSession(tx, userId, input.sessionId);
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
        and(eq(reports.userId, userId), gte(reports.createdAt, new Date(Date.now() - 86_400_000))),
      );
    assertAllowed((daily?.total ?? 0) < 10, "LIMIT", "Limite de relatos de hoje atingido.");
    const [created] = await tx
      .insert(reports)
      .values({
        userId,
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
  await db.update(families).set({ dailyMinutes }).where(eq(families.userId, userId));
}
/**
 * Data do último simulado concluído deste perfil.
 *
 * Consulta própria porque `recent` traz só os trinta percursos mais novos: quem
 * fez trinta missões desde a última prova veria "nenhum ainda" tendo feito
 * várias.
 */
export async function lastExamDate(userId: string, profileId: string) {
  const [ultimo] = await db
    .select({ createdAt: sessions.createdAt })
    .from(sessions)
    .innerJoin(profiles, eq(sessions.profileId, profiles.id))
    .where(
      and(
        eq(profiles.userId, userId),
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
export async function listFamiliesForWeeklyReport() {
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
        isNull(emailUnsubscribes.userId),
      ),
    );
}

/** Quantas descobertas o perfil guardou. Contagem, não lista: o caderno pagina. */
export async function countNotes(userId: string, profileId: string) {
  return db.transaction(async (tx) => {
    await ownedProfile(tx, userId, profileId);
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
    await tx
      .update(families)
      .set({ weeklyReportEmail: enabled })
      .where(eq(families.userId, userId));
    // Religar pelo app desfaz um cancelamento feito pelo link do e-mail.
    if (enabled)
      await tx
        .delete(emailUnsubscribes)
        .where(
          and(
            eq(emailUnsubscribes.userId, userId),
            eq(emailUnsubscribes.category, "missao.weekly-report"),
          ),
        );
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
export async function familyChallenge(userId: string, weekStart: string) {
  const [challenge] = await db
    .select()
    .from(familyChallenges)
    .where(and(eq(familyChallenges.userId, userId), eq(familyChallenges.weekStart, weekStart)));
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
      nickname: profiles.nickname,
      familyId: attempts.familyId,
    })
    .from(attempts)
    .innerJoin(sessions, eq(attempts.sessionId, sessions.id))
    .innerJoin(profiles, eq(sessions.profileId, profiles.id))
    .where(
      and(
        eq(profiles.userId, userId),
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
  for (const row of rows) {
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
export async function setFamilyChallenge(userId: string, weekStart: string, goal: number) {
  await db
    .insert(familyChallenges)
    .values({ userId, weekStart, goal })
    .onConflictDoUpdate({
      target: [familyChallenges.userId, familyChallenges.weekStart],
      set: { goal },
    });
}
export async function clearFamilyChallenge(userId: string, weekStart: string) {
  await db
    .delete(familyChallenges)
    .where(and(eq(familyChallenges.userId, userId), eq(familyChallenges.weekStart, weekStart)));
}
export async function familyReports(userId: string) {
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
    .where(eq(reports.userId, userId))
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(100);
}
export async function exportFamily(userId: string) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, userId);
    const familyProfiles = await tx.select().from(profiles).where(eq(profiles.userId, userId));
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
      family: await tx.select().from(families).where(eq(families.userId, userId)),
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
      reports: await tx.select().from(reports).where(eq(reports.userId, userId)),
      challenges: await tx
        .select()
        .from(familyChallenges)
        .where(eq(familyChallenges.userId, userId)),
    };
  });
}
export async function clearFamily(userId: string) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, userId);
    await tx.delete(reports).where(eq(reports.userId, userId));
    await tx.delete(families).where(eq(families.userId, userId));
  });
}
