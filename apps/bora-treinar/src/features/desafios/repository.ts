import "server-only";
import { and, asc, db, eq, gte, isNotNull, isNull, lt } from "@informach/db";
import { boraChallenges } from "@informach/db/schema";
import { familyMembershipCondition } from "@informach/family/access";
import { lockFamilyMembership } from "@informach/family/context";
import { assertAllowed } from "@/lib/errors";
import { boraAccessInTransaction } from "../billing/access-repository";
import { ensureFamily } from "../familia/repository";
import { lockTrainerAccess, trainerAccessCondition } from "../familia/scope";
import { lockTrainerUse } from "../familia/use-repository";
import type { Desafio, Metrica } from "./placar";

/**
 * O dono de um desafio: o perfil (o desafio pessoal da semana) ou a família inteira (`profileId`
 * nulo, quando a casa escolhe somar junto). Cada um tem no máximo um desafio por semana, garantido
 * por dois índices únicos parciais no banco.
 */
const dono = (userId: string, groupId: string, profileId: string | null) =>
  and(
    eq(boraChallenges.familyGroupId, groupId),
    familyMembershipCondition(userId, boraChallenges.familyGroupId),
    profileId
      ? and(
          eq(boraChallenges.profileId, profileId),
          trainerAccessCondition(userId, boraChallenges.profileId),
        )
      : isNull(boraChallenges.profileId),
  );

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockChallenge(tx: Tx, userId: string, groupId: string, profileId: string | null) {
  if (profileId) {
    const [scope] = await lockTrainerAccess(tx, userId, [profileId]);
    assertAllowed(scope?.groupId === groupId, "PROFILE", "Perfil não disponível nesta família.");
  } else await lockFamilyMembership(tx, userId, groupId, "administrator");
}

const paraDesafio = (row: typeof boraChallenges.$inferSelect): Desafio => ({
  metric: row.metric as Metrica,
  exerciseId: row.exerciseId,
  target: row.target,
});

export async function challengeOf(
  userId: string,
  groupId: string,
  weekStart: string,
  profileId: string | null = null,
): Promise<Desafio | null> {
  const [row] = await db
    .select()
    .from(boraChallenges)
    .where(and(dono(userId, groupId, profileId), eq(boraChallenges.weekStart, weekStart)));
  return row ? paraDesafio(row) : null;
}

/** Desafios de um dono de `fromWeek` (inclusive) até `toWeek` (exclusive), da mais antiga à mais recente. */
export async function challengesBetween(
  userId: string,
  groupId: string,
  profileId: string | null,
  fromWeek: string,
  toWeek: string,
) {
  const rows = await db
    .select()
    .from(boraChallenges)
    .where(
      and(
        dono(userId, groupId, profileId),
        gte(boraChallenges.weekStart, fromWeek),
        lt(boraChallenges.weekStart, toWeek),
      ),
    )
    .orderBy(asc(boraChallenges.weekStart));
  return rows.map((r) => ({ weekStart: r.weekStart, ...paraDesafio(r) }));
}

export async function setChallenge(
  userId: string,
  groupId: string,
  weekStart: string,
  desafio: Desafio,
  profileId: string | null = null,
) {
  await db.transaction(async (tx) => {
    if (profileId) await lockTrainerUse(tx, userId, groupId, [profileId]);
    else await lockFamilyMembership(tx, userId, groupId, "administrator");
    const access = await boraAccessInTransaction(tx, userId, groupId);
    assertAllowed(access.unlocked, "PLAN", "Os desafios fazem parte do Compasso.");
    await ensureFamily(userId, tx);
    await tx
      .insert(boraChallenges)
      .values({ userId, familyGroupId: groupId, profileId, weekStart, ...desafio })
      .onConflictDoUpdate(
        profileId
          ? {
              target: [boraChallenges.profileId, boraChallenges.weekStart],
              // o predicado tem de ser o mesmo do índice parcial, senão o Postgres não acha o índice
              targetWhere: isNotNull(boraChallenges.profileId),
              set: {
                metric: desafio.metric,
                exerciseId: desafio.exerciseId,
                target: desafio.target,
              },
            }
          : {
              target: [boraChallenges.familyGroupId, boraChallenges.weekStart],
              targetWhere: isNull(boraChallenges.profileId),
              set: {
                metric: desafio.metric,
                exerciseId: desafio.exerciseId,
                target: desafio.target,
              },
            },
      );
  });
}

/**
 * Cria os desafios pessoais que faltam, sem trocar os que já existem. Duas telas abertas ao mesmo
 * tempo tentam criar a mesma semana: o índice único do perfil segura a segunda, que segue em
 * frente e relê o que a primeira gravou.
 */
export async function createMissingProfileChallenges(
  userId: string,
  groupId: string,
  profileId: string,
  semanas: { weekStart: string; desafio: Desafio }[],
) {
  if (!semanas.length) return;
  await db.transaction(async (tx) => {
    const access = await lockTrainerUse(tx, userId, groupId, [profileId]);
    assertAllowed(access.unlocked, "PLAN", "Os desafios fazem parte do Compasso.");
    await ensureFamily(userId, tx);
    await tx
      .insert(boraChallenges)
      .values(
        semanas.map((s) => ({
          userId,
          familyGroupId: groupId,
          profileId,
          weekStart: s.weekStart,
          ...s.desafio,
        })),
      )
      .onConflictDoNothing({
        target: [boraChallenges.profileId, boraChallenges.weekStart],
        where: isNotNull(boraChallenges.profileId),
      });
  });
}

export async function clearChallenge(
  userId: string,
  groupId: string,
  weekStart: string,
  profileId: string | null = null,
) {
  await db.transaction(async (tx) => {
    await lockChallenge(tx, userId, groupId, profileId);
    await tx
      .delete(boraChallenges)
      .where(and(dono(userId, groupId, profileId), eq(boraChallenges.weekStart, weekStart)));
  });
}
