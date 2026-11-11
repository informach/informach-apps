import "server-only";
import { and, asc, db, desc, eq, inArray, isNull, type SQLWrapper, sql } from "@informach/db";
import {
  missaoCompetitions as competitions,
  missaoCompetitors as competitors,
  missaoContentControls as controls,
  missaoCompetitionTurns as turns,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { assertAllowed } from "@/lib/errors";
import { learningAccessInTransaction } from "../billing/access-repository";
import { findContentUnit } from "../content/catalog";
import type { ParentAuthority } from "../family/authority";
import { effectiveGrade } from "../family/school-year";
import { lockStudentAccess, studentAccessCondition } from "../family/scope";
import { enabledStudentIds, readStudents } from "../family/student-repository";
import { encontrarDesafio } from "../pecas/catalogo";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Competition = typeof competitions.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type Turn = typeof turns.$inferSelect;

export type NovaCompeticao = Omit<
  typeof competitions.$inferInsert,
  "id" | "userId" | "familyGroupId" | "status" | "createdAt" | "startedAt" | "finishedAt"
>;
export type NovoCompetidor = Omit<typeof competitors.$inferInsert, "id" | "competitionId">;
export type NovaVez = Omit<
  typeof turns.$inferInsert,
  | "id"
  | "competitionId"
  | "competitorId"
  | "startedAt"
  | "deadlineAt"
  | "finishedAt"
  | "answer"
  | "result"
  | "points"
> & { seat: number };

export async function createCompetition(
  actor: ParentAuthority,
  competicao: NovaCompeticao,
  lista: NovoCompetidor[],
  vezes: NovaVez[],
) {
  return db.transaction(async (tx) => {
    assertAllowed(actor.kind === "parent", "AUTH", "Abra a área da família.");
    const access = await learningAccessInTransaction(tx, actor);
    const ids = lista.flatMap((entry) => (entry.profileId ? [entry.profileId] : []));
    assertAllowed(
      ids.length === lista.length && ids.length >= 2,
      "PROFILE",
      "Escolha os estudantes.",
    );
    await lockStudentAccess(tx, actor, ids);
    const current = await readStudents(tx, actor);
    const enabled = await enabledStudentIds(tx, actor, access.profileLimit);
    for (const entry of lista) {
      const profile = current.find((profile) => profile.id === entry.profileId);
      assertAllowed(
        profile && effectiveGrade(profile) === entry.grade,
        "PROFILE",
        "O ano escolar mudou. Prepare a competição novamente.",
      );
      entry.nickname = profile.nickname;
      entry.avatar = profile.avatar;
    }
    // Content correction and coverage are checked under the same group lock as creation.
    const lessonIds = [
      ...new Set(vezes.flatMap((turn) => (turn.lessonId ? [turn.lessonId] : []))),
    ].sort();
    for (const lessonId of lessonIds) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`missao:content:${lessonId}`}, 0))`,
      );
      const [state] = await tx
        .select({ status: controls.status })
        .from(controls)
        .where(eq(controls.lessonId, lessonId))
        .orderBy(desc(controls.createdAt), desc(controls.id))
        .limit(1);
      assertAllowed(
        state?.status !== "suspended",
        "WITHDRAWN",
        "Um conteúdo foi pausado. Prepare a competição novamente.",
      );
    }
    for (const turn of vezes) {
      const profileId = lista.find((entry) => entry.seat === turn.seat)?.profileId;
      const free =
        turn.kind === "problem"
          ? findContentUnit(turn.lessonId ?? "")?.free
          : encontrarDesafio(turn.puzzleId ?? "")?.gratuito;
      assertAllowed(
        free === true ||
          (free === false && access.paid && !!profileId && enabled.includes(profileId)),
        "PLAN",
        "A cobertura mudou. Prepare a competição novamente.",
      );
    }
    const [existente] = await tx
      .select()
      .from(competitions)
      .where(
        and(
          eq(competitions.familyGroupId, actor.familyGroupId),
          eq(competitions.requestKey, competicao.requestKey),
        ),
      );
    if (existente) {
      const previous = await tx
        .select({ profileId: competitors.profileId, seat: competitors.seat })
        .from(competitors)
        .where(eq(competitors.competitionId, existente.id))
        .orderBy(asc(competitors.seat));
      const sameSettings = (
        [
          "title",
          "area",
          "problemCount",
          "challengeCount",
          "problemSeconds",
          "challengeSeconds",
        ] as const
      ).every((key) => existente[key] === competicao[key]);
      const requested = [...lista].sort((a, b) => a.seat - b.seat);
      assertAllowed(
        sameSettings &&
          previous.length === requested.length &&
          previous.every(
            (entry, index) =>
              entry.profileId === requested[index]?.profileId &&
              entry.seat === requested[index]?.seat,
          ),
        "CONFLICT",
        "Esta solicitação já foi usada para outra competição. Prepare novamente.",
      );
      await ownedCompetition(tx, actor, existente.id, "write");
      return existente.id;
    }
    const [criada] = await tx
      .insert(competitions)
      .values({ ...competicao, userId: actor.userId, familyGroupId: actor.familyGroupId })
      .returning({ id: competitions.id });
    if (!criada) throw new Error("Competição não criada");
    const inseridos = await tx
      .insert(competitors)
      .values(lista.map((c) => ({ ...c, competitionId: criada.id })))
      .returning({ id: competitors.id, seat: competitors.seat });
    const porAssento = new Map(inseridos.map((c) => [c.seat, c.id]));
    await tx.insert(turns).values(
      vezes.map(({ seat, ...vez }) => {
        const competitorId = porAssento.get(seat);
        if (!competitorId) throw new Error(`Assento ${seat} sem competidor`);
        return { ...vez, competitionId: criada.id, competitorId };
      }),
    );
    return criada.id;
  });
}

export async function listCompetitions(actor: ParentAuthority) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    const lista = await tx
      .select()
      .from(competitions)
      .where(
        and(
          competitionAccess(actor, competitions.id),
          inArray(competitions.status, ["ready", "running", "finished"]),
        ),
      )
      .orderBy(desc(competitions.createdAt))
      .limit(30);
    if (!lista.length) return [];
    const ids = lista.map((c) => c.id);
    const [todos, contagem] = await Promise.all([
      tx
        .select()
        .from(competitors)
        .where(inArray(competitors.competitionId, ids))
        .orderBy(asc(competitors.seat)),
      tx
        .select({
          competitorId: turns.competitorId,
          points: sql<number>`coalesce(sum(${turns.points}), 0)::int`,
          feitas: sql<number>`count(${turns.finishedAt})::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(turns)
        .where(inArray(turns.competitionId, ids))
        .groupBy(turns.competitorId),
    ]);
    const porCompetidor = new Map(contagem.map((c) => [c.competitorId, c]));
    return lista.map((competicao) => {
      const daCompeticao = todos.filter((c) => c.competitionId === competicao.id);
      return {
        competicao,
        competidores: daCompeticao.map((c) => ({
          ...c,
          pontos: porCompetidor.get(c.id)?.points ?? 0,
        })),
        feitas: daCompeticao.reduce((s, c) => s + (porCompetidor.get(c.id)?.feitas ?? 0), 0),
        total: daCompeticao.reduce((s, c) => s + (porCompetidor.get(c.id)?.total ?? 0), 0),
      };
    });
  });
}

function competitionAccess(
  actor: ParentAuthority,
  competitionId: SQLWrapper,
  action: "read" | "write" | "manage" = "read",
) {
  if (actor.kind !== "parent") return sql`false`;
  return sql`EXISTS (SELECT 1 FROM ${competitions} event WHERE event.id = ${competitionId} AND event.family_group_id = ${actor.familyGroupId}::uuid)
    AND EXISTS (SELECT 1 FROM ${competitors} participant WHERE participant.competition_id = ${competitionId})
    AND NOT EXISTS (SELECT 1 FROM ${competitors} participant WHERE participant.competition_id = ${competitionId}
      AND (participant.profile_id IS NULL OR NOT (${studentAccessCondition(actor, sql`participant.profile_id`, action)})))`;
}
async function ownedCompetition(
  tx: Tx,
  actor: ParentAuthority,
  id: string,
  action: "read" | "write" | "manage" = "read",
) {
  assertAllowed(actor.kind === "parent", "AUTH", "Abra a área da família.");
  await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
  const [candidate] = await tx
    .select({ id: competitions.id })
    .from(competitions)
    .where(and(eq(competitions.id, id), competitionAccess(actor, competitions.id, action)));
  assertAllowed(candidate, "NOT_FOUND", "Competição não encontrada.");
  const students = await tx
    .select({ id: competitors.profileId })
    .from(competitors)
    .where(eq(competitors.competitionId, id));
  await lockStudentAccess(
    tx,
    actor,
    students.flatMap((entry) => (entry.id ? [entry.id] : [])),
    action,
  );
  const [competition] = await tx
    .select()
    .from(competitions)
    .where(and(eq(competitions.id, id), competitionAccess(actor, competitions.id, action)))
    .for("update");
  assertAllowed(
    competition && competition.status !== "cancelled",
    "NOT_FOUND",
    "Competição não encontrada.",
  );
  return competition;
}
export async function readCompetition(actor: ParentAuthority, id: string) {
  return db.transaction(async (tx) => {
    const competicao = await ownedCompetition(tx, actor, id);
    const lista = await tx
      .select()
      .from(competitors)
      .where(eq(competitors.competitionId, id))
      .orderBy(asc(competitors.seat));
    const vezes = await tx
      .select()
      .from(turns)
      .where(eq(turns.competitionId, id))
      .orderBy(asc(turns.position));
    return { competicao, competidores: lista, vezes };
  });
}

/** O que cada perfil já viu em competições, para o sorteio preferir o novo. */
export async function seenInCompetitions(actor: ParentAuthority, profileIds: string[]) {
  if (!profileIds.length) return new Map<string, Set<string>>();
  const linhas = await db
    .select({ profileId: competitors.profileId, itemId: turns.itemId, puzzleId: turns.puzzleId })
    .from(turns)
    .innerJoin(competitors, eq(turns.competitorId, competitors.id))
    .innerJoin(competitions, eq(turns.competitionId, competitions.id))
    .where(
      and(
        studentAccessCondition(actor, competitors.profileId),
        inArray(competitors.profileId, profileIds),
      ),
    );
  const vistos = new Map<string, Set<string>>();
  for (const linha of linhas) {
    if (!linha.profileId) continue;
    const conjunto = vistos.get(linha.profileId) ?? new Set<string>();
    if (linha.itemId) conjunto.add(linha.itemId);
    if (linha.puzzleId) conjunto.add(linha.puzzleId);
    vistos.set(linha.profileId, conjunto);
  }
  return vistos;
}

export async function profilesOf(actor: ParentAuthority, ids: string[]) {
  if (!ids.length) return [];
  return (await readStudents(db, actor)).filter((profile) => ids.includes(profile.id));
}

/** Revalidate current coverage and content before starting or answering a paid turn. */
async function assertTurnPlayable(tx: Tx, actor: ParentAuthority, turn: Turn) {
  const access = await learningAccessInTransaction(tx, actor);
  const [participant] = await tx
    .select({ profileId: competitors.profileId })
    .from(competitors)
    .where(
      and(eq(competitors.id, turn.competitorId), eq(competitors.competitionId, turn.competitionId)),
    );
  assertAllowed(participant?.profileId, "PROFILE", "Estudante não disponível.");
  const free =
    turn.kind === "problem"
      ? findContentUnit(turn.lessonId ?? "")?.free
      : encontrarDesafio(turn.puzzleId ?? "")?.gratuito;
  const enabled = await enabledStudentIds(tx, actor, access.profileLimit);
  assertAllowed(
    free === true || (free === false && access.paid && enabled.includes(participant.profileId)),
    "PLAN",
    "A cobertura desta família mudou. Confira a assinatura na Minha conta.",
  );
  if (turn.lessonId) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`missao:content:${turn.lessonId}`}, 0))`,
    );
    const [state] = await tx
      .select({ status: controls.status })
      .from(controls)
      .where(eq(controls.lessonId, turn.lessonId))
      .orderBy(desc(controls.createdAt), desc(controls.id))
      .limit(1);
    assertAllowed(
      state?.status !== "suspended",
      "WITHDRAWN",
      "Este conteúdo está pausado para correção.",
    );
  }
}

/**
 * Abre a próxima vez: a primeira sem resultado. Se ela já foi aberta e o tempo
 * corre, devolve a mesma (tocar duas vezes em "Começar" não reinicia o relógio).
 */
export async function openNextTurn(actor: ParentAuthority, id: string, agora: Date) {
  return db.transaction(async (tx) => {
    const competicao = await ownedCompetition(tx, actor, id, "write");
    assertAllowed(competicao.status !== "finished", "FINISHED", "Esta competição já terminou.");
    const [proxima] = await tx
      .select()
      .from(turns)
      .where(and(eq(turns.competitionId, id), isNull(turns.result)))
      .orderBy(asc(turns.position))
      .limit(1)
      .for("update");
    assertAllowed(proxima, "FINISHED", "Esta competição já terminou.");
    await assertTurnPlayable(tx, actor, proxima);
    if (competicao.status === "ready")
      await tx
        .update(competitions)
        .set({ status: "running", startedAt: agora })
        .where(eq(competitions.id, id));
    if (proxima.startedAt) return proxima;
    const [aberta] = await tx
      .update(turns)
      .set({ startedAt: agora, deadlineAt: new Date(agora.getTime() + proxima.seconds * 1000) })
      .where(and(eq(turns.id, proxima.id), isNull(turns.startedAt)))
      .returning();
    return aberta ?? proxima;
  });
}

/**
 * Fecha uma vez aberta. O `where result is null` decide a corrida entre a
 * resposta e o fim do tempo: quem chega primeiro grava, o outro recebe a vez
 * já fechada.
 */
export async function closeTurn(
  actor: ParentAuthority,
  id: string,
  turnId: string,
  decidir: (
    vez: Turn,
  ) => { answer: string | null; result: NonNullable<Turn["result"]>; points: number } | null,
  agora: Date,
) {
  return db.transaction(async (tx) => {
    await ownedCompetition(tx, actor, id, "write");
    const [vez] = await tx
      .select()
      .from(turns)
      .where(and(eq(turns.id, turnId), eq(turns.competitionId, id)))
      .for("update");
    assertAllowed(vez, "NOT_FOUND", "Vez não encontrada.");
    assertAllowed(vez.startedAt, "NOT_STARTED", "Toque em Começar para abrir esta vez.");
    if (vez.result) return { vez, fechouAgora: false };
    const decisao = decidir(vez);
    if (!decisao) return { vez, fechouAgora: false };
    if (decisao.result === "correct" || decisao.result === "incorrect")
      await assertTurnPlayable(tx, actor, vez);
    const [fechada] = await tx
      .update(turns)
      .set({ ...decisao, finishedAt: agora })
      .where(and(eq(turns.id, turnId), isNull(turns.result)))
      .returning();
    const [aberta] = await tx
      .select({ id: turns.id })
      .from(turns)
      .where(and(eq(turns.competitionId, id), isNull(turns.result)))
      .limit(1);
    if (!aberta)
      await tx
        .update(competitions)
        .set({ status: "finished", finishedAt: agora })
        .where(eq(competitions.id, id));
    return { vez: fechada ?? vez, fechouAgora: !!fechada };
  });
}

export async function deleteCompetition(actor: ParentAuthority, id: string) {
  return db.transaction(async (tx) => {
    await ownedCompetition(tx, actor, id, "manage");
    await tx.delete(competitions).where(eq(competitions.id, id));
  });
}

/** Para exportação LGPD: tudo da família, com os itens sorteados resumidos ao id. */
export async function exportCompetitions(tx: Tx, actor: ParentAuthority) {
  const lista = await tx
    .select()
    .from(competitions)
    .where(competitionAccess(actor, competitions.id));
  const ids = lista.map((c) => c.id);
  if (!ids.length) return { competitions: [], competitors: [], turns: [] };
  return {
    competitions: lista,
    competitors: await tx.select().from(competitors).where(inArray(competitors.competitionId, ids)),
    turns: (await tx.select().from(turns).where(inArray(turns.competitionId, ids))).map(
      ({ item: _item, ...vez }) => vez,
    ),
  };
}
