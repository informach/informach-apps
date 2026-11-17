import "server-only";
import { and, asc, db, desc, eq, gt, gte, inArray, lt, ne, or, sql } from "@informach/db";
import { boraAchievements, boraSessions, boraSetLogs } from "@informach/db/schema";
import type { SessaoResumo } from "@/features/conquistas/catalogo";
import type { MelhorMarca } from "@/features/treino/engine/habito";
import type { Feeling } from "@/features/treino/engine/progression";
import type { SetLog } from "@/features/treino/engine/runner";
import type { Tx } from "../familia/repository";
import { trainerAccessCondition } from "../familia/scope";

export interface SessionRecord {
  id: string;
  profileId: string;
  workoutRef: string;
  workoutName: string;
  startedAt: number;
  /** segundos */
  duration: number;
  mode: "camera" | "manual" | "pareado";
  logs: SetLog[];
  feeling?: Feeling | null;
  endedEarly?: boolean;
  /** treinar junto: o mesmo id nos treinos de cada perfil do grupo */
  groupId?: string | null;
}

const toLog = (l: typeof boraSetLogs.$inferSelect): SetLog => ({
  exerciseId: l.exerciseId,
  kind: l.kind as SetLog["kind"],
  target: l.target ?? undefined,
  reps: l.reps,
  partials: l.partials,
  holdSeconds: l.holdSeconds,
  seconds: l.seconds,
  issues: l.issues,
});

async function withLogs(
  actorId: string,
  rows: (typeof boraSessions.$inferSelect)[],
  tx: Tx | typeof db = db,
): Promise<SessionRecord[]> {
  if (!rows.length) return [];
  const logs = await tx
    .select()
    .from(boraSetLogs)
    .where(
      and(
        inArray(
          boraSetLogs.sessionId,
          rows.map((r) => r.id),
        ),
        sql`EXISTS (SELECT 1 FROM ${boraSessions} session WHERE session.id = ${boraSetLogs.sessionId} AND ${trainerAccessCondition(actorId, sql`session.profile_id`)})`,
      ),
    )
    .orderBy(asc(boraSetLogs.position));
  return rows.map((r) => ({
    id: r.id,
    profileId: r.profileId,
    workoutRef: r.workoutRef,
    workoutName: r.workoutName,
    startedAt: r.startedAt.getTime(),
    duration: r.durationSeconds,
    mode: r.mode as SessionRecord["mode"],
    logs: logs.filter((l) => l.sessionId === r.id).map(toLog),
    feeling: (r.feeling as Feeling | null) ?? null,
    endedEarly: r.endedEarly,
    groupId: r.groupId,
  }));
}

/** Sessões de um perfil, da mais antiga para a mais recente. */
export async function sessionsOf(
  actorId: string,
  profileId: string,
  opts: { since?: Date; limit?: number } = {},
  tx: Tx | typeof db = db,
) {
  const rows = await tx
    .select()
    .from(boraSessions)
    .where(
      and(
        eq(boraSessions.profileId, profileId),
        trainerAccessCondition(actorId, boraSessions.profileId),
        opts.since ? gte(boraSessions.startedAt, opts.since) : undefined,
      ),
    )
    .orderBy(desc(boraSessions.startedAt))
    .limit(opts.limit ?? 2000);
  return (await withLogs(actorId, rows, tx)).reverse();
}

/**
 * O resumo de cada treino do perfil (quando, duração, modo, repetições, isometria, avisos de forma),
 * somado no banco. As conquistas precisam do histórico inteiro, mas não das séries: carregar até
 * 2000 sessões com todas as séries dentro da transação de cada treino salvo deixava o save cada vez
 * mais lento.
 */
export async function resumosDoPerfil(
  actorId: string,
  profileId: string,
  tx: Tx | typeof db = db,
): Promise<SessaoResumo[]> {
  const rows = await tx
    .select({
      startedAt: boraSessions.startedAt,
      duration: boraSessions.durationSeconds,
      mode: boraSessions.mode,
      reps: sql<number>`coalesce(sum(${boraSetLogs.reps}), 0)::int`,
      holdSeconds: sql<number>`coalesce(sum(${boraSetLogs.holdSeconds}), 0)::int`,
      bestHold: sql<number>`coalesce(max(${boraSetLogs.holdSeconds}), 0)::int`,
      semAvisos: sql<boolean>`coalesce(bool_and(${boraSetLogs.issues} = '{}'::jsonb), true)`,
    })
    .from(boraSessions)
    .leftJoin(boraSetLogs, eq(boraSetLogs.sessionId, boraSessions.id))
    .where(
      and(
        eq(boraSessions.profileId, profileId),
        trainerAccessCondition(actorId, boraSessions.profileId),
      ),
    )
    .groupBy(boraSessions.id)
    .orderBy(asc(boraSessions.startedAt));
  return rows.map((r) => ({
    startedAt: r.startedAt.getTime(),
    duration: r.duration,
    mode: r.mode as SessionRecord["mode"],
    reps: Number(r.reps),
    holdSeconds: Number(r.holdSeconds),
    bestHold: Number(r.bestHold),
    semAvisos: Boolean(r.semAvisos),
  }));
}

/**
 * Melhor série e maior isometria de cada exercício do perfil em todas as outras sessões, somadas
 * no banco (o recorde pessoal compara a sessão salva com isto).
 */
export async function melhoresAnteriores(
  actorId: string,
  profileId: string,
  excetoSessao: string,
  /**
   * só treinos feitos antes deste: um treino da fila offline que chega dias depois é comparado com
   * o que existia quando ele foi feito, não com o que veio depois
   */
  antesDe: Date,
  tx: Tx | typeof db = db,
): Promise<Map<string, MelhorMarca>> {
  const rows = await tx
    .select({
      exerciseId: boraSetLogs.exerciseId,
      bestSet: sql<number>`max(${boraSetLogs.reps})::int`,
      bestHold: sql<number>`max(${boraSetLogs.holdSeconds})::int`,
    })
    .from(boraSetLogs)
    .innerJoin(boraSessions, eq(boraSessions.id, boraSetLogs.sessionId))
    .where(
      and(
        eq(boraSessions.profileId, profileId),
        trainerAccessCondition(actorId, boraSessions.profileId),
        ne(boraSessions.id, excetoSessao),
        lt(boraSessions.startedAt, antesDe),
      ),
    )
    .groupBy(boraSetLogs.exerciseId);
  return new Map(
    rows.map((r) => [r.exerciseId, { bestSet: Number(r.bestSet), bestHold: Number(r.bestHold) }]),
  );
}

/** Sessões de toda a família desde um instante (desafios e resumo semanal). */
export async function familySessionsSince(
  userId: string,
  since: Date,
  until?: Date,
  groupId?: string,
) {
  const rows = await db
    .select()
    .from(boraSessions)
    .where(
      and(
        trainerAccessCondition(userId, boraSessions.profileId, "read", groupId),
        gte(boraSessions.startedAt, since),
        until ? lt(boraSessions.startedAt, until) : undefined,
      ),
    )
    .orderBy(asc(boraSessions.startedAt));
  return withLogs(userId, rows);
}

/** O perfil já tem algum treino salvo? (o primeiro mostra os cuidados no portão) */
export async function jaTreinou(actorId: string, profileId: string) {
  const rows = await db
    .select({ id: boraSessions.id })
    .from(boraSessions)
    .where(
      and(
        eq(boraSessions.profileId, profileId),
        trainerAccessCondition(actorId, boraSessions.profileId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function sessionById(userId: string, id: string) {
  const rows = await db
    .select()
    .from(boraSessions)
    .where(and(eq(boraSessions.id, id), trainerAccessCondition(userId, boraSessions.profileId)));
  return (await withLogs(userId, rows))[0] ?? null;
}

/** Grava a sessão; devolve false se o mesmo id já tinha sido gravado (reenvio). */
export async function insertSession(
  tx: Tx,
  userId: string,
  session: Omit<SessionRecord, "logs"> & { logs: SetLog[] },
) {
  const inserted = await tx
    .insert(boraSessions)
    .values({
      id: session.id,
      userId,
      profileId: session.profileId,
      workoutRef: session.workoutRef,
      workoutName: session.workoutName,
      startedAt: new Date(session.startedAt),
      durationSeconds: session.duration,
      mode: session.mode,
      feeling: session.feeling ?? null,
      endedEarly: session.endedEarly ?? false,
      groupId: session.groupId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: boraSessions.id });
  if (!inserted.length) return false;
  await tx.insert(boraSetLogs).values(
    session.logs.map((l, position) => ({
      sessionId: session.id,
      position,
      exerciseId: l.exerciseId,
      kind: l.kind,
      target: l.target ?? null,
      reps: l.reps,
      partials: l.partials,
      holdSeconds: l.holdSeconds,
      seconds: l.seconds,
      issues: l.issues,
    })),
  );
  return true;
}

export async function achievementsOf(actorId: string, profileId: string, tx: Tx | typeof db = db) {
  return tx
    .select()
    .from(boraAchievements)
    .where(
      and(
        eq(boraAchievements.profileId, profileId),
        trainerAccessCondition(actorId, boraAchievements.profileId),
      ),
    )
    .orderBy(asc(boraAchievements.earnedAt));
}

export async function grantAchievements(
  tx: Tx | typeof db,
  profileId: string,
  ids: string[],
  sessionId: string | null,
) {
  if (!ids.length) return [];
  const rows = await tx
    .insert(boraAchievements)
    .values(ids.map((achievementId) => ({ profileId, achievementId, sessionId })))
    .onConflictDoNothing()
    .returning({ achievementId: boraAchievements.achievementId });
  return rows.map((r) => r.achievementId);
}

/** Os treinos de um grupo (treinar junto), na ordem dos perfis. */
export async function sessoesDoGrupo(userId: string, groupId: string) {
  const rows = await db
    .select()
    .from(boraSessions)
    .where(
      and(
        trainerAccessCondition(userId, boraSessions.profileId),
        eq(boraSessions.groupId, groupId),
      ),
    )
    .orderBy(asc(boraSessions.profileId));
  return withLogs(userId, rows);
}

/**
 * O volume de cada treino da família desde um instante, somado por exercício no banco: o desafio
 * da semana só precisa de repetições, segundos de isometria e duração. Antes ele carregava cada
 * série de 8 semanas de todos os perfis a cada abertura do Início e do Progresso.
 */
export async function volumeDaFamiliaDesde(userId: string, groupId: string, since: Date) {
  const rows = await db
    .select({
      id: boraSessions.id,
      profileId: boraSessions.profileId,
      startedAt: boraSessions.startedAt,
      duration: boraSessions.durationSeconds,
      exerciseId: boraSetLogs.exerciseId,
      reps: sql<number>`coalesce(sum(${boraSetLogs.reps}), 0)::int`,
      holdSeconds: sql<number>`coalesce(sum(${boraSetLogs.holdSeconds}), 0)::int`,
    })
    .from(boraSessions)
    .leftJoin(boraSetLogs, eq(boraSetLogs.sessionId, boraSessions.id))
    .where(
      and(
        trainerAccessCondition(userId, boraSessions.profileId, "read", groupId),
        gte(boraSessions.startedAt, since),
      ),
    )
    .groupBy(boraSessions.id, boraSetLogs.exerciseId)
    .orderBy(asc(boraSessions.startedAt));
  const porSessao = new Map<
    string,
    {
      profileId: string;
      startedAt: number;
      duration: number;
      logs: { exerciseId: string; reps: number; holdSeconds: number }[];
    }
  >();
  for (const r of rows) {
    const sessao = porSessao.get(r.id) ?? {
      profileId: r.profileId,
      startedAt: r.startedAt.getTime(),
      duration: r.duration,
      logs: [],
    };
    porSessao.set(r.id, sessao);
    if (r.exerciseId)
      sessao.logs.push({
        exerciseId: r.exerciseId,
        reps: Number(r.reps),
        holdSeconds: Number(r.holdSeconds),
      });
  }
  return [...porSessao.values()];
}

/**
 * Todos os treinos de um perfil, em páginas: a exportação (LGPD) não pode depender de caber numa
 * consulta só. Antes ia tudo de uma vez, e as séries saíam num `IN` com todos os ids, que passa
 * do limite de parâmetros do Postgres num histórico longo.
 */
export async function todasAsSessoes(actorId: string, profileId: string, pagina = 500) {
  const todas: SessionRecord[] = [];
  let depois: { startedAt: Date; id: string } | null = null;
  for (;;) {
    const rows: (typeof boraSessions.$inferSelect)[] = await db
      .select()
      .from(boraSessions)
      .where(
        and(
          eq(boraSessions.profileId, profileId),
          trainerAccessCondition(actorId, boraSessions.profileId),
          depois
            ? or(
                gt(boraSessions.startedAt, depois.startedAt),
                and(eq(boraSessions.startedAt, depois.startedAt), gt(boraSessions.id, depois.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(boraSessions.startedAt), asc(boraSessions.id))
      .limit(pagina);
    todas.push(...(await withLogs(actorId, rows)));
    const ultima = rows.at(-1);
    if (rows.length < pagina || !ultima) return todas;
    depois = { startedAt: ultima.startedAt, id: ultima.id };
  }
}
