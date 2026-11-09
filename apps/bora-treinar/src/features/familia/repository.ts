import "server-only";
import { and, asc, db, eq, inArray, sql } from "@informach/db";
import {
  boraAchievements,
  boraChainProgress,
  boraChallenges,
  boraCustomWorkouts,
  boraFamilies,
  boraProfiles,
  emailUnsubscribes,
} from "@informach/db/schema";
import type { Intensidade } from "@/features/treino/catalog/workouts";
import type { ProgressMap } from "@/features/treino/engine/progression";
import { assertAllowed } from "@/lib/errors";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Transação para os serviços que gravam em mais de uma tabela de uma vez. */
export function inTransaction<T>(operation: (tx: Tx) => Promise<T>) {
  return db.transaction(operation);
}

export async function ensureFamily(userId: string, tx: Tx | typeof db = db) {
  await tx.insert(boraFamilies).values({ userId }).onConflictDoNothing();
}

export async function getFamily(userId: string) {
  const [family] = await db.select().from(boraFamilies).where(eq(boraFamilies.userId, userId));
  return family ?? null;
}

export function listProfiles(userId: string) {
  return db
    .select({
      id: boraProfiles.id,
      name: boraProfiles.name,
      color: boraProfiles.color,
      accessEnabled: boraProfiles.accessEnabled,
      intensity: sql<Intensidade>`${boraProfiles.intensity}`,
      weeklyGoal: boraProfiles.weeklyGoal,
      minutesPref: boraProfiles.minutesPref,
      onboardedAt: boraProfiles.onboardedAt,
    })
    .from(boraProfiles)
    .where(eq(boraProfiles.userId, userId))
    .orderBy(asc(boraProfiles.createdAt), asc(boraProfiles.id));
}

export type ProfileRow = Awaited<ReturnType<typeof listProfiles>>[number];

/**
 * Cria um perfil respeitando o limite do plano. A linha da família é travada
 * para que dois cliques simultâneos não passem do limite.
 */
export async function createProfile(userId: string, name: string, color: string, limit: number) {
  return db.transaction(async (tx) => {
    await ensureFamily(userId, tx);
    await tx
      .select({ userId: boraFamilies.userId })
      .from(boraFamilies)
      .where(eq(boraFamilies.userId, userId))
      .for("update");
    const [counted] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(boraProfiles)
      .where(eq(boraProfiles.userId, userId));
    assertAllowed(
      (counted?.total ?? 0) < limit,
      "PROFILE_LIMIT",
      limit > 1
        ? `O plano permite até ${limit} perfis.`
        : "O plano atual permite um perfil. No plano Família cabem até quatro.",
    );
    const [profile] = await tx
      .insert(boraProfiles)
      .values({ userId, name, color })
      .returning({ id: boraProfiles.id });
    assertAllowed(profile, "PROFILE", "Não foi possível criar o perfil.");
    return profile.id;
  });
}

export async function updateProfile(userId: string, id: string, name: string, color: string) {
  const updated = await db
    .update(boraProfiles)
    .set({ name, color })
    .where(and(eq(boraProfiles.id, id), eq(boraProfiles.userId, userId)))
    .returning({ id: boraProfiles.id });
  assertAllowed(updated.length, "PROFILE", "Perfil não encontrado.");
}

export async function deleteProfile(userId: string, id: string) {
  const deleted = await db
    .delete(boraProfiles)
    .where(and(eq(boraProfiles.id, id), eq(boraProfiles.userId, userId)))
    .returning({ id: boraProfiles.id });
  assertAllowed(deleted.length, "PROFILE", "Perfil não encontrado.");
}

/**
 * Trava o perfil até o fim da transação. Quem lê e regrava o progresso (salvar um treino, aceitar
 * um avanço) passa por aqui antes: dois envios ao mesmo tempo (a fila offline em duas abas, a TV e
 * o celular) liam o mesmo progresso e um apagava a sequência do outro.
 */
export async function lockProfile(
  tx: Tx,
  profileId: string,
): Promise<{ intensity: Intensidade; weeklyGoal: number }> {
  const rows = await tx.execute<{ intensity: string; weekly_goal: number }>(
    sql`SELECT intensity, weekly_goal FROM ${boraProfiles} WHERE id = ${profileId} FOR UPDATE`,
  );
  const intensity = rows[0]?.intensity;
  return {
    intensity: intensity === "leve" || intensity === "forte" ? intensity : "normal",
    weeklyGoal: Number(rows[0]?.weekly_goal ?? 3),
  };
}

export async function progressOf(profileId: string, tx: Tx | typeof db = db): Promise<ProgressMap> {
  const rows = await tx
    .select()
    .from(boraChainProgress)
    .where(eq(boraChainProgress.profileId, profileId));
  return Object.fromEntries(
    rows.map((r) => [
      r.chainId,
      { level: r.level, bonus: r.bonus, streak: r.streak, struggle: r.struggle },
    ]),
  );
}

export async function saveProgress(profileId: string, progress: ProgressMap, tx: Tx | typeof db) {
  const rows = Object.entries(progress).map(([chainId, st]) => ({
    profileId,
    chainId,
    level: st.level,
    bonus: st.bonus,
    streak: st.streak,
    struggle: st.struggle ?? 0,
  }));
  if (!rows.length) return;
  await tx
    .insert(boraChainProgress)
    .values(rows)
    .onConflictDoUpdate({
      target: [boraChainProgress.profileId, boraChainProgress.chainId],
      set: {
        level: sql`excluded.level`,
        bonus: sql`excluded.bonus`,
        streak: sql`excluded.streak`,
        struggle: sql`excluded.struggle`,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Grava o fuso da família. Com `soSePadrao`, só troca se ele ainda for o padrão (o primeiro
 * perfil traz o fuso do navegador, mas não desfaz uma escolha feita em Conta).
 */
export async function setTimezone(userId: string, fuso: string, soSePadrao = false) {
  await ensureFamily(userId);
  await db
    .update(boraFamilies)
    .set({ timezone: fuso })
    .where(
      soSePadrao
        ? and(eq(boraFamilies.userId, userId), eq(boraFamilies.timezone, "America/Sao_Paulo"))
        : eq(boraFamilies.userId, userId),
    );
}

const CATEGORIAS = ["bora.reminder", "bora.weekly-summary"] as const;

/**
 * Grava as preferências e o descadastro de cada categoria na mesma transação.
 * O pipeline de e-mail respeita o descadastro antes de cada envio: religar
 * aqui precisa apagá-lo, e desligar precisa barrar também o lote em andamento.
 */
export async function setPreferences(
  userId: string,
  prefs: { reminderDays: number; reminderHour: number; weeklySummary: boolean; timezone?: string },
) {
  await db.transaction(async (tx) => {
    await ensureFamily(userId, tx);
    await tx.update(boraFamilies).set(prefs).where(eq(boraFamilies.userId, userId));
    const ligado = {
      "bora.reminder": prefs.reminderDays > 0,
      "bora.weekly-summary": prefs.weeklySummary,
    };
    for (const category of CATEGORIAS) {
      if (ligado[category])
        await tx
          .delete(emailUnsubscribes)
          .where(
            and(eq(emailUnsubscribes.userId, userId), eq(emailUnsubscribes.category, category)),
          );
      else await tx.insert(emailUnsubscribes).values({ userId, category }).onConflictDoNothing();
    }
  });
}

/** Categorias que o titular desligou, inclusive pelo link do próprio e-mail. */
export async function unsubscribedCategories(userId: string) {
  const rows = await db
    .select({ category: emailUnsubscribes.category })
    .from(emailUnsubscribes)
    .where(
      and(
        eq(emailUnsubscribes.userId, userId),
        inArray(emailUnsubscribes.category, [...CATEGORIAS]),
      ),
    );
  return new Set(rows.map((r) => r.category));
}

/** Apaga todos os dados do app da conta: perfis, treinos, desafios e preferências caem em cascata. */
export async function clearFamily(userId: string) {
  await db.delete(boraFamilies).where(eq(boraFamilies.userId, userId));
}

/** Tudo o que o app guarda da família, para a exportação (LGPD, portabilidade). */
export async function familyExport(userId: string) {
  const [family] = await db.select().from(boraFamilies).where(eq(boraFamilies.userId, userId));
  const profiles = await db.select().from(boraProfiles).where(eq(boraProfiles.userId, userId));
  const ids = profiles.map((p) => p.id);
  const [progress, achievements, workouts, challenges] = await Promise.all([
    ids.length
      ? db.select().from(boraChainProgress).where(inArray(boraChainProgress.profileId, ids))
      : [],
    ids.length
      ? db.select().from(boraAchievements).where(inArray(boraAchievements.profileId, ids))
      : [],
    db.select().from(boraCustomWorkouts).where(eq(boraCustomWorkouts.userId, userId)),
    db.select().from(boraChallenges).where(eq(boraChallenges.userId, userId)),
  ]);
  return { family: family ?? null, profiles, progress, achievements, workouts, challenges };
}

export type { Tx };
