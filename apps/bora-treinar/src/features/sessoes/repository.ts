import "server-only";
import { and, asc, db, desc, eq, gte, inArray, lt, ne, sql } from "@informach/db";
import { boraAchievements, boraSessions, boraSetLogs } from "@informach/db/schema";
import type { SessaoResumo } from "@/features/conquistas/catalogo";
import type { MelhorMarca } from "@/features/treino/engine/habito";
import type { Feeling } from "@/features/treino/engine/progression";
import type { SetLog } from "@/features/treino/engine/runner";
import type { Tx } from "../familia/repository";

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
  rows: (typeof boraSessions.$inferSelect)[],
  tx: Tx | typeof db = db,
): Promise<SessionRecord[]> {
  if (!rows.length) return [];
  const logs = await tx
    .select()
    .from(boraSetLogs)
    .where(
      inArray(
        boraSetLogs.sessionId,
        rows.map((r) => r.id),
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
        opts.since ? gte(boraSessions.startedAt, opts.since) : undefined,
      ),
    )
    .orderBy(desc(boraSessions.startedAt))
    .limit(opts.limit ?? 2000);
  return (await withLogs(rows, tx)).reverse();
}

/**
 * O resumo de cada treino do perfil (quando, duração, modo, repetições, isometria, avisos de forma),
 * somado no banco. As conquistas precisam do histórico inteiro, mas não das séries: carregar até
 * 2000 sessões com todas as séries dentro da transação de cada treino salvo deixava o save cada vez
 * mais lento.
 */
export async function resumosDoPerfil(
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
    .where(eq(boraSessions.profileId, profileId))
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
  profileId: string,
  excetoSessao: string,
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
    .where(and(eq(boraSessions.profileId, profileId), ne(boraSessions.id, excetoSessao)))
    .groupBy(boraSetLogs.exerciseId);
  return new Map(
    rows.map((r) => [r.exerciseId, { bestSet: Number(r.bestSet), bestHold: Number(r.bestHold) }]),
  );
}

/** Sessões de toda a família desde um instante (desafios e resumo semanal). */
export async function familySessionsSince(userId: string, since: Date, until?: Date) {
  const rows = await db
    .select()
    .from(boraSessions)
    .where(
      and(
        eq(boraSessions.userId, userId),
        gte(boraSessions.startedAt, since),
        until ? lt(boraSessions.startedAt, until) : undefined,
      ),
    )
    .orderBy(asc(boraSessions.startedAt));
  return withLogs(rows);
}

/** O perfil já tem algum treino salvo? (o primeiro mostra os cuidados no portão) */
export async function jaTreinou(profileId: string) {
  const rows = await db
    .select({ id: boraSessions.id })
    .from(boraSessions)
    .where(eq(boraSessions.profileId, profileId))
    .limit(1);
  return rows.length > 0;
}

export async function sessionById(userId: string, id: string) {
  const rows = await db
    .select()
    .from(boraSessions)
    .where(and(eq(boraSessions.id, id), eq(boraSessions.userId, userId)));
  return (await withLogs(rows))[0] ?? null;
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

export async function achievementsOf(profileId: string, tx: Tx | typeof db = db) {
  return tx
    .select()
    .from(boraAchievements)
    .where(eq(boraAchievements.profileId, profileId))
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
    .where(and(eq(boraSessions.userId, userId), eq(boraSessions.groupId, groupId)))
    .orderBy(asc(boraSessions.profileId));
  return withLogs(rows);
}
