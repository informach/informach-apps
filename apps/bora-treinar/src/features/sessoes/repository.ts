import "server-only";
import { and, asc, db, desc, eq, gte, inArray, lt, sql } from "@informach/db";
import { boraAchievements, boraSessions, boraSetLogs } from "@informach/db/schema";
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
 * O resumo de cada treino do perfil (quando, modo, repetições, maior isometria), somado no banco.
 * As conquistas precisam do histórico inteiro, mas não das séries: carregar até 2000 sessões com
 * todas as séries dentro da transação de cada treino salvo deixava o save cada vez mais lento.
 */
export async function resumosDoPerfil(profileId: string, tx: Tx | typeof db = db) {
  const rows = await tx
    .select({
      startedAt: boraSessions.startedAt,
      mode: boraSessions.mode,
      reps: sql<number>`coalesce(sum(${boraSetLogs.reps}), 0)::int`,
      bestHold: sql<number>`coalesce(max(${boraSetLogs.holdSeconds}), 0)::int`,
    })
    .from(boraSessions)
    .leftJoin(boraSetLogs, eq(boraSetLogs.sessionId, boraSessions.id))
    .where(eq(boraSessions.profileId, profileId))
    .groupBy(boraSessions.id)
    .orderBy(asc(boraSessions.startedAt));
  return rows.map((r) => ({
    startedAt: r.startedAt.getTime(),
    mode: r.mode as SessionRecord["mode"],
    reps: Number(r.reps),
    bestHold: Number(r.bestHold),
  }));
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
