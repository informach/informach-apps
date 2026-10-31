import "server-only";
import { and, db, eq, sql } from "@informach/db";
import { missaoPuzzleSolves as solves } from "@informach/db/schema";

export async function listSolves(profileId: string) {
  return db.select().from(solves).where(eq(solves.profileId, profileId));
}

/** Uma linha por perfil e desafio: conta as montagens e guarda o melhor tempo. */
export async function recordSolve(profileId: string, puzzleId: string, seconds: number) {
  await db
    .insert(solves)
    .values({ profileId, puzzleId, bestSeconds: seconds })
    .onConflictDoUpdate({
      target: [solves.profileId, solves.puzzleId],
      set: {
        solves: sql`${solves.solves} + 1`,
        bestSeconds: sql`least(${solves.bestSeconds}, ${seconds})`,
        lastSolvedAt: sql`now()`,
      },
    });
  const [linha] = await db
    .select()
    .from(solves)
    .where(and(eq(solves.profileId, profileId), eq(solves.puzzleId, puzzleId)));
  return linha;
}
