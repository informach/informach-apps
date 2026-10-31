import "server-only";
import { and, asc, db, desc, eq, inArray, isNull, sql } from "@informach/db";
import {
  missaoCompetitions as competitions,
  missaoCompetitors as competitors,
  missaoProfiles as profiles,
  missaoCompetitionTurns as turns,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { lockOwner } from "../learning/repository";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Competition = typeof competitions.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type Turn = typeof turns.$inferSelect;

export type NovaCompeticao = Omit<
  typeof competitions.$inferInsert,
  "id" | "userId" | "status" | "createdAt" | "startedAt" | "finishedAt"
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
  userId: string,
  competicao: NovaCompeticao,
  lista: NovoCompetidor[],
  vezes: NovaVez[],
) {
  return db.transaction(async (tx) => {
    await lockOwner(tx, userId);
    const [existente] = await tx
      .select({ id: competitions.id })
      .from(competitions)
      .where(
        and(eq(competitions.userId, userId), eq(competitions.requestKey, competicao.requestKey)),
      );
    if (existente) return existente.id;
    const [criada] = await tx
      .insert(competitions)
      .values({ ...competicao, userId })
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

export async function listCompetitions(userId: string) {
  const lista = await db
    .select()
    .from(competitions)
    .where(
      and(
        eq(competitions.userId, userId),
        inArray(competitions.status, ["ready", "running", "finished"]),
      ),
    )
    .orderBy(desc(competitions.createdAt))
    .limit(30);
  if (!lista.length) return [];
  const ids = lista.map((c) => c.id);
  const [todos, contagem] = await Promise.all([
    db
      .select()
      .from(competitors)
      .where(inArray(competitors.competitionId, ids))
      .orderBy(asc(competitors.seat)),
    db
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
}

async function ownedCompetition(tx: Tx | typeof db, userId: string, id: string, lock = false) {
  const consulta = tx
    .select()
    .from(competitions)
    .where(and(eq(competitions.id, id), eq(competitions.userId, userId)));
  const [competicao] = lock ? await consulta.for("update") : await consulta;
  assertAllowed(
    competicao && competicao.status !== "cancelled",
    "NOT_FOUND",
    "Competição não encontrada.",
  );
  return competicao;
}

export async function readCompetition(userId: string, id: string) {
  const competicao = await ownedCompetition(db, userId, id);
  const [lista, vezes] = await Promise.all([
    db
      .select()
      .from(competitors)
      .where(eq(competitors.competitionId, id))
      .orderBy(asc(competitors.seat)),
    db.select().from(turns).where(eq(turns.competitionId, id)).orderBy(asc(turns.position)),
  ]);
  return { competicao, competidores: lista, vezes };
}

/** O que cada perfil já viu em competições, para o sorteio preferir o novo. */
export async function seenInCompetitions(userId: string, profileIds: string[]) {
  if (!profileIds.length) return new Map<string, Set<string>>();
  const linhas = await db
    .select({ profileId: competitors.profileId, itemId: turns.itemId, puzzleId: turns.puzzleId })
    .from(turns)
    .innerJoin(competitors, eq(turns.competitorId, competitors.id))
    .innerJoin(competitions, eq(turns.competitionId, competitions.id))
    .where(and(eq(competitions.userId, userId), inArray(competitors.profileId, profileIds)));
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

export async function profilesOf(userId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select()
    .from(profiles)
    .where(and(eq(profiles.userId, userId), inArray(profiles.id, ids)));
}

/**
 * Abre a próxima vez: a primeira sem resultado. Se ela já foi aberta e o tempo
 * corre, devolve a mesma (tocar duas vezes em "Começar" não reinicia o relógio).
 */
export async function openNextTurn(userId: string, id: string, agora: Date) {
  return db.transaction(async (tx) => {
    const competicao = await ownedCompetition(tx, userId, id, true);
    assertAllowed(competicao.status !== "finished", "FINISHED", "Esta competição já terminou.");
    const [proxima] = await tx
      .select()
      .from(turns)
      .where(and(eq(turns.competitionId, id), isNull(turns.result)))
      .orderBy(asc(turns.position))
      .limit(1)
      .for("update");
    assertAllowed(proxima, "FINISHED", "Esta competição já terminou.");
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
  userId: string,
  id: string,
  turnId: string,
  decidir: (
    vez: Turn,
  ) => { answer: string | null; result: NonNullable<Turn["result"]>; points: number } | null,
  agora: Date,
) {
  return db.transaction(async (tx) => {
    await ownedCompetition(tx, userId, id, true);
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

export async function deleteCompetition(userId: string, id: string) {
  await db
    .delete(competitions)
    .where(and(eq(competitions.id, id), eq(competitions.userId, userId)));
}

/** Para exportação LGPD: tudo da família, com os itens sorteados resumidos ao id. */
export async function exportCompetitions(tx: Tx, userId: string) {
  const lista = await tx.select().from(competitions).where(eq(competitions.userId, userId));
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
