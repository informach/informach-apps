import "server-only";
import { and, asc, db, eq, gte, isNotNull, isNull, lt } from "@informach/db";
import { boraChallenges } from "@informach/db/schema";
import { ensureFamily } from "../familia/repository";
import type { Desafio, Metrica } from "./placar";

/**
 * O dono de um desafio: o perfil (o desafio pessoal da semana) ou a família inteira (`profileId`
 * nulo, quando a casa escolhe somar junto). Cada um tem no máximo um desafio por semana, garantido
 * por dois índices únicos parciais no banco.
 */
const dono = (userId: string, profileId: string | null) =>
  and(
    eq(boraChallenges.userId, userId),
    profileId ? eq(boraChallenges.profileId, profileId) : isNull(boraChallenges.profileId),
  );

const paraDesafio = (row: typeof boraChallenges.$inferSelect): Desafio => ({
  metric: row.metric as Metrica,
  exerciseId: row.exerciseId,
  target: row.target,
});

export async function challengeOf(
  userId: string,
  weekStart: string,
  profileId: string | null = null,
): Promise<Desafio | null> {
  const [row] = await db
    .select()
    .from(boraChallenges)
    .where(and(dono(userId, profileId), eq(boraChallenges.weekStart, weekStart)));
  return row ? paraDesafio(row) : null;
}

/** Desafios de um dono de `fromWeek` (inclusive) até `toWeek` (exclusive), da mais antiga à mais recente. */
export async function challengesBetween(
  userId: string,
  profileId: string | null,
  fromWeek: string,
  toWeek: string,
) {
  const rows = await db
    .select()
    .from(boraChallenges)
    .where(
      and(
        dono(userId, profileId),
        gte(boraChallenges.weekStart, fromWeek),
        lt(boraChallenges.weekStart, toWeek),
      ),
    )
    .orderBy(asc(boraChallenges.weekStart));
  return rows.map((r) => ({ weekStart: r.weekStart, ...paraDesafio(r) }));
}

export async function setChallenge(
  userId: string,
  weekStart: string,
  desafio: Desafio,
  profileId: string | null = null,
) {
  await ensureFamily(userId);
  await db
    .insert(boraChallenges)
    .values({ userId, profileId, weekStart, ...desafio })
    .onConflictDoUpdate(
      profileId
        ? {
            target: [boraChallenges.profileId, boraChallenges.weekStart],
            // o predicado tem de ser o mesmo do índice parcial, senão o Postgres não acha o índice
            targetWhere: isNotNull(boraChallenges.profileId),
            set: { metric: desafio.metric, exerciseId: desafio.exerciseId, target: desafio.target },
          }
        : {
            target: [boraChallenges.userId, boraChallenges.weekStart],
            targetWhere: isNull(boraChallenges.profileId),
            set: { metric: desafio.metric, exerciseId: desafio.exerciseId, target: desafio.target },
          },
    );
}

export async function clearChallenge(
  userId: string,
  weekStart: string,
  profileId: string | null = null,
) {
  await db
    .delete(boraChallenges)
    .where(and(dono(userId, profileId), eq(boraChallenges.weekStart, weekStart)));
}
