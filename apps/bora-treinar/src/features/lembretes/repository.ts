import "server-only";
import { and, asc, db, eq, gt, gte, or, sql } from "@informach/db";
import { boraFamilies, boraSessions, users } from "@informach/db/schema";

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
        depois ? gt(boraFamilies.userId, depois) : undefined,
      ),
    )
    .orderBy(asc(boraFamilies.userId))
    .limit(limite);
}

/** Alguém da família treinou desde o instante dado? */
export async function treinouDesde(userId: string, desde: Date) {
  const [linha] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(boraSessions)
    .where(and(eq(boraSessions.userId, userId), gte(boraSessions.startedAt, desde)));
  return (linha?.n ?? 0) > 0;
}

/** Marca o resumo da semana como tratado (enviado ou dispensado). */
export async function marcarResumo(userId: string, semana: string) {
  await db
    .update(boraFamilies)
    .set({ weeklySummaryWeek: semana })
    .where(eq(boraFamilies.userId, userId));
}
