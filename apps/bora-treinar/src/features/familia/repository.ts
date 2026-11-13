import "server-only";
import {
  activeWebParticipationCondition,
  lockActiveWebParticipation,
} from "@informach/auth/web-participation";
import { and, asc, db, eq, inArray, isNull, sql } from "@informach/db";
import {
  boraAchievements,
  boraChainProgress,
  boraChallenges,
  boraCustomWorkouts,
  boraFamilies,
  boraProfiles,
  emailUnsubscribes,
  familyAppProfiles,
  familyGroupPeople,
  familyPeople,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { familyMembershipCondition } from "@informach/family/access";
import type { Intensidade } from "@/features/treino/catalog/workouts";
import type { ProgressMap } from "@/features/treino/engine/progression";
import { assertAllowed } from "@/lib/errors";
import { eraseBoraProfiles } from "../account/cleanup-repository";
import { boraAccessInTransaction } from "../billing/access-repository";
import { allowedProfileIds } from "./profile-access";
import { lockTrainerAccess, trainerAccessCondition } from "./scope";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const familyService = createFamilyService({ db });

/** Transação para os serviços que gravam em mais de uma tabela de uma vez. */
export function inTransaction<T>(operation: (tx: Tx) => Promise<T>) {
  return db.transaction(operation);
}

export async function ensureFamily(userId: string, tx?: Tx): Promise<void> {
  if (!tx) return db.transaction((transaction) => ensureFamily(userId, transaction));
  await lockActiveWebParticipation(tx, userId);
  await tx.insert(boraFamilies).values({ userId }).onConflictDoNothing();
}

export async function getFamily(userId: string) {
  const [family] = await db
    .select()
    .from(boraFamilies)
    .where(and(eq(boraFamilies.userId, userId), activeWebParticipationCondition(userId)));
  return family ?? null;
}

export function listProfiles(userId: string, groupId?: string) {
  return db
    .select({
      id: boraProfiles.id,
      name: sql<string>`coalesce(${users.name}, ${familyPeople.displayName})`,
      color: familyPeople.color,
      groupId: familyAppProfiles.groupId,
      personId: familyPeople.id,
      canWrite: sql<boolean>`${trainerAccessCondition(userId, boraProfiles.id, "write")}`.mapWith(
        Boolean,
      ),
      canManage: sql<boolean>`${trainerAccessCondition(userId, boraProfiles.id, "manage")}`.mapWith(
        Boolean,
      ),
      createdAt: boraProfiles.createdAt,
      accessEnabled: boraProfiles.accessEnabled,
      intensity: sql<Intensidade>`${boraProfiles.intensity}`,
      weeklyGoal: boraProfiles.weeklyGoal,
      minutesPref: boraProfiles.minutesPref,
      onboardedAt: boraProfiles.onboardedAt,
    })
    .from(boraProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, boraProfiles.familyProfileId))
    .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
    .leftJoin(users, eq(users.id, familyPeople.userId))
    .where(
      and(
        trainerAccessCondition(userId, boraProfiles.id),
        groupId ? eq(familyAppProfiles.groupId, groupId) : undefined,
      ),
    )
    .orderBy(asc(boraProfiles.createdAt), asc(boraProfiles.id));
}

export type ProfileRow = Awaited<ReturnType<typeof listProfiles>>[number];

/** Compute commercial slots across the family, independently of a visitor's grants. */
export async function enabledTrainerIds(
  actorId: string,
  groupId: string,
  limit: number,
  tx: Tx | typeof db = db,
) {
  const rows = await tx
    .select({ id: boraProfiles.id, accessEnabled: boraProfiles.accessEnabled })
    .from(boraProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, boraProfiles.familyProfileId))
    .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
    .innerJoin(
      familyGroupPeople,
      and(
        eq(familyGroupPeople.personId, familyPeople.id),
        eq(familyGroupPeople.groupId, familyAppProfiles.groupId),
      ),
    )
    .where(
      and(
        eq(familyAppProfiles.groupId, groupId),
        familyMembershipCondition(actorId, familyAppProfiles.groupId),
        isNull(familyAppProfiles.archivedAt),
        isNull(familyPeople.archivedAt),
        isNull(familyGroupPeople.archivedAt),
      ),
    )
    .orderBy(asc(boraProfiles.createdAt), asc(boraProfiles.id));
  return allowedProfileIds(rows, limit);
}

/** Native settings are created in the activation transaction, without a second identity. */
export async function createNativeTrainer(
  tx: Tx,
  userId: string,
  activationId: string,
  groupId: string,
) {
  const { profileLimit: limit } = await boraAccessInTransaction(tx, userId, groupId);
  await ensureFamily(userId, tx);
  const [counted] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(boraProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, boraProfiles.familyProfileId))
    .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
    .innerJoin(
      familyGroupPeople,
      and(
        eq(familyGroupPeople.personId, familyPeople.id),
        eq(familyGroupPeople.groupId, familyAppProfiles.groupId),
      ),
    )
    .where(
      and(
        eq(familyAppProfiles.groupId, groupId),
        isNull(familyAppProfiles.archivedAt),
        isNull(familyPeople.archivedAt),
        isNull(familyGroupPeople.archivedAt),
      ),
    );
  assertAllowed(
    (counted?.total ?? 0) < limit,
    "PROFILE_LIMIT",
    limit > 1
      ? `A cobertura atual permite até ${limit} perfis.`
      : "O treino gratuito inclui um perfil. Gerencie o Compasso na Minha conta para liberar os demais.",
  );
  const [profile] = await tx
    .insert(boraProfiles)
    .values({ userId, familyProfileId: activationId })
    .returning({ id: boraProfiles.id });
  assertAllowed(profile, "PROFILE", "Não foi possível ativar o perfil.");
  return profile.id;
}

export async function deleteProfile(userId: string, id: string) {
  const [profile] = await db
    .select({ activationId: boraProfiles.familyProfileId })
    .from(boraProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, boraProfiles.familyProfileId))
    .where(
      and(
        eq(boraProfiles.id, id),
        eq(familyAppProfiles.app, "bora-treinar"),
        familyMembershipCondition(userId, familyAppProfiles.groupId),
      ),
    );
  assertAllowed(profile?.activationId, "PROFILE", "Perfil não disponível.");
  await familyService.removeProfile(
    userId,
    "bora-treinar",
    profile.activationId,
    async (tx, activationId) => {
      const removed = await eraseBoraProfiles(tx, [activationId]);
      assertAllowed(
        removed.length === 1 && removed[0]?.id === id,
        "PROFILE",
        "Perfil não disponível.",
      );
    },
  );
}

/**
 * Trava o perfil até o fim da transação. Quem lê e regrava o progresso (salvar um treino, aceitar
 * um avanço) passa por aqui antes: dois envios ao mesmo tempo (a fila offline em duas abas, a TV e
 * o celular) liam o mesmo progresso e um apagava a sequência do outro.
 */
export async function lockProfile(
  tx: Tx,
  actorId: string,
  profileId: string,
): Promise<{ intensity: Intensidade; weeklyGoal: number }> {
  await lockTrainerAccess(tx, actorId, [profileId]);
  const rows = await tx.execute<{ intensity: string; weekly_goal: number }>(
    sql`SELECT intensity, weekly_goal FROM ${boraProfiles} WHERE id = ${profileId} FOR UPDATE`,
  );
  const intensity = rows[0]?.intensity;
  return {
    intensity: intensity === "leve" || intensity === "forte" ? intensity : "normal",
    weeklyGoal: Number(rows[0]?.weekly_goal ?? 3),
  };
}

export async function progressOf(
  actorId: string,
  profileId: string,
  tx: Tx | typeof db = db,
): Promise<ProgressMap> {
  const rows = await tx
    .select()
    .from(boraChainProgress)
    .where(
      and(
        eq(boraChainProgress.profileId, profileId),
        trainerAccessCondition(actorId, boraChainProgress.profileId),
      ),
    );
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
  await db.transaction(async (tx) => {
    await ensureFamily(userId, tx);
    await tx
      .update(boraFamilies)
      .set({ timezone: fuso })
      .where(
        soSePadrao
          ? and(eq(boraFamilies.userId, userId), eq(boraFamilies.timezone, "America/Sao_Paulo"))
          : eq(boraFamilies.userId, userId),
      );
  });
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

/** Tudo o que o app guarda da família, para a exportação (LGPD, portabilidade). */
export async function familyExport(userId: string) {
  await db.transaction((tx) => lockActiveWebParticipation(tx, userId));
  const family = await getFamily(userId);
  const profiles = await listProfiles(userId);
  const ids = profiles.map((p) => p.id);
  const [progress, achievements, workouts, challenges] = await Promise.all([
    ids.length
      ? db
          .select()
          .from(boraChainProgress)
          .where(
            and(
              inArray(boraChainProgress.profileId, ids),
              trainerAccessCondition(userId, boraChainProgress.profileId),
            ),
          )
      : [],
    ids.length
      ? db
          .select()
          .from(boraAchievements)
          .where(
            and(
              inArray(boraAchievements.profileId, ids),
              trainerAccessCondition(userId, boraAchievements.profileId),
            ),
          )
      : [],
    db
      .select()
      .from(boraCustomWorkouts)
      .where(and(eq(boraCustomWorkouts.userId, userId), activeWebParticipationCondition(userId))),
    db
      .select()
      .from(boraChallenges)
      .where(
        sql`((${boraChallenges.profileId} is null AND ${familyMembershipCondition(userId, boraChallenges.familyGroupId)}) OR ${trainerAccessCondition(userId, boraChallenges.profileId)})`,
      ),
  ]);
  await db.transaction((tx) => lockActiveWebParticipation(tx, userId));
  return { family, profiles, progress, achievements, workouts, challenges };
}

export type { Tx };
