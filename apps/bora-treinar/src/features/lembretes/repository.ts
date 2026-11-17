import "server-only";
import {
  activeWebParticipationCondition,
  lockWebParticipation,
} from "@informach/auth/web-participation";
import { and, asc, db, eq, gt, gte, lt, or, sql } from "@informach/db";
import { boraFamilies, boraSessions, boraSetLogs, users } from "@informach/db/schema";
import type { MelhorMarca } from "@/features/treino/engine/habito";
import { trainerAccessCondition } from "../familia/scope";

/** The recipient may have changed their address after the scheduler selected this batch. */
export async function isCurrentRecipient(userId: string, email: string) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.email, email),
        eq(users.emailVerified, true),
        activeWebParticipationCondition(userId),
        sql`(not ${users.banned} or ${users.banExpiresAt} <= now())`,
      ),
    )
    .limit(1);
  return !!row;
}

/** Famílias com lembrete ou resumo ligados, em páginas ordenadas pelo id do titular. */
export async function familiasComAvisos(depois: string | null, limite: number) {
  return db
    .select({
      userId: boraFamilies.userId,
      email: users.email,
      emailVerified: users.emailVerified,
      reminderDays: boraFamilies.reminderDays,
      reminderHour: boraFamilies.reminderHour,
      timezone: boraFamilies.timezone,
      weeklySummary: boraFamilies.weeklySummary,
      weeklySummaryWeek: boraFamilies.weeklySummaryWeek,
    })
    .from(boraFamilies)
    .innerJoin(users, eq(users.id, boraFamilies.userId))
    .where(
      and(
        or(gt(boraFamilies.reminderDays, 0), eq(boraFamilies.weeklySummary, true)),
        activeWebParticipationCondition(boraFamilies.userId),
        eq(users.emailVerified, true),
        sql`(not ${users.banned} or ${users.banExpiresAt} <= now())`,
        depois ? gt(boraFamilies.userId, depois) : undefined,
      ),
    )
    .orderBy(asc(boraFamilies.userId))
    .limit(limite);
}

/**
 * Cada sessão da família desde o instante dado, já somada no banco (perfil, início, duração,
 * repetições e segundos de isometria): o bastante para saber se conta como treino e para a meta
 * da semana, sem carregar as séries.
 */
export async function sessoesSomadasDesde(userId: string, desde: Date, groupId: string) {
  const rows = await db
    .select({
      profileId: boraSessions.profileId,
      startedAt: boraSessions.startedAt,
      duration: boraSessions.durationSeconds,
      volume: sql<number>`coalesce(sum(${boraSetLogs.reps} + ${boraSetLogs.holdSeconds}), 0)::int`,
    })
    .from(boraSessions)
    .leftJoin(boraSetLogs, eq(boraSetLogs.sessionId, boraSessions.id))
    .where(
      and(
        trainerAccessCondition(userId, boraSessions.profileId, "read", groupId),
        gte(boraSessions.startedAt, desde),
      ),
    )
    .groupBy(boraSessions.id)
    .orderBy(asc(boraSessions.startedAt));
  return rows.map((r) => ({
    profileId: r.profileId,
    startedAt: r.startedAt.getTime(),
    duration: r.duration,
    volume: Number(r.volume),
  }));
}

/** Melhor série e maior isometria de cada exercício, por perfil, nas sessões antes do instante. */
export async function melhoresAntesDe(userId: string, antes: Date, groupId: string) {
  const rows = await db
    .select({
      profileId: boraSessions.profileId,
      exerciseId: boraSetLogs.exerciseId,
      bestSet: sql<number>`max(${boraSetLogs.reps})::int`,
      bestHold: sql<number>`max(${boraSetLogs.holdSeconds})::int`,
    })
    .from(boraSetLogs)
    .innerJoin(boraSessions, eq(boraSessions.id, boraSetLogs.sessionId))
    .where(
      and(
        trainerAccessCondition(userId, boraSessions.profileId, "read", groupId),
        lt(boraSessions.startedAt, antes),
      ),
    )
    .groupBy(boraSessions.profileId, boraSetLogs.exerciseId);
  const porPerfil = new Map<string, Map<string, MelhorMarca>>();
  for (const r of rows) {
    const marcas = porPerfil.get(r.profileId) ?? new Map<string, MelhorMarca>();
    marcas.set(r.exerciseId, { bestSet: Number(r.bestSet), bestHold: Number(r.bestHold) });
    porPerfil.set(r.profileId, marcas);
  }
  return porPerfil;
}

/** Marca o resumo da semana como tratado (enviado ou dispensado). */
export async function marcarResumo(userId: string, semana: string) {
  await db.transaction(async (tx) => {
    const participation = await lockWebParticipation(tx, userId);
    if (participation.state !== "active") return;
    await tx
      .update(boraFamilies)
      .set({ weeklySummaryWeek: semana })
      .where(eq(boraFamilies.userId, userId));
  });
}
