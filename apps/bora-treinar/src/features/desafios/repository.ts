import "server-only";
import { and, db, eq } from "@informach/db";
import { boraChallenges } from "@informach/db/schema";
import { ensureFamily } from "../familia/repository";
import type { Desafio, Metrica } from "./placar";

export async function challengeOf(userId: string, weekStart: string): Promise<Desafio | null> {
  const [row] = await db
    .select()
    .from(boraChallenges)
    .where(and(eq(boraChallenges.userId, userId), eq(boraChallenges.weekStart, weekStart)));
  return row
    ? { metric: row.metric as Metrica, exerciseId: row.exerciseId, target: row.target }
    : null;
}

export async function setChallenge(userId: string, weekStart: string, desafio: Desafio) {
  await ensureFamily(userId);
  await db
    .insert(boraChallenges)
    .values({ userId, weekStart, ...desafio })
    .onConflictDoUpdate({
      target: [boraChallenges.userId, boraChallenges.weekStart],
      set: { metric: desafio.metric, exerciseId: desafio.exerciseId, target: desafio.target },
    });
}

export async function clearChallenge(userId: string, weekStart: string) {
  await db
    .delete(boraChallenges)
    .where(and(eq(boraChallenges.userId, userId), eq(boraChallenges.weekStart, weekStart)));
}
