import "server-only";
import { and, db, eq, sql } from "@informach/db";
import { missaoPuzzleSolves as solves } from "@informach/db/schema";
import { z } from "zod";
import { assertAllowed } from "@/lib/errors";
import { learningAccessInTransaction } from "../billing/access-repository";
import type { LearningAuthority } from "../family/authority";
import { lockStudentAccess, studentAccessCondition } from "../family/scope";
import { enabledStudentIds } from "../family/student-repository";
import { encontrarDesafio } from "./catalogo";
import { desafioLiberado } from "./esquema";

export async function listSolves(actor: LearningAuthority, profileId: string) {
  return db
    .select()
    .from(solves)
    .where(and(eq(solves.profileId, profileId), studentAccessCondition(actor, solves.profileId)));
}

/** The action verifies the solution; this transaction authorizes its actual student and coverage. */
export async function recordSolve(
  actor: LearningAuthority,
  profileId: string,
  puzzleId: string,
  seconds: number,
) {
  z.number().int().min(0).max(86_400).parse(seconds);
  const challenge = encontrarDesafio(puzzleId);
  assertAllowed(challenge, "NOT_FOUND", "Desafio não encontrado.");
  return db.transaction(async (tx) => {
    const access = await learningAccessInTransaction(tx, actor);
    await lockStudentAccess(tx, actor, [profileId]);
    const enabled = await enabledStudentIds(tx, actor, access.profileLimit);
    assertAllowed(
      desafioLiberado(challenge, {
        pago: access.paid,
        perfilLiberado: enabled.includes(profileId),
      }),
      "PLAN",
      "Este desafio faz parte da assinatura.",
    );
    const [row] = await tx
      .insert(solves)
      .values({ profileId, puzzleId, bestSeconds: seconds })
      .onConflictDoUpdate({
        target: [solves.profileId, solves.puzzleId],
        set: {
          solves: sql`${solves.solves} + 1`,
          bestSeconds: sql`least(${solves.bestSeconds}, ${seconds})`,
          lastSolvedAt: sql`now()`,
        },
      })
      .returning();
    assertAllowed(row, "SAVE", "Não foi possível registrar a montagem.");
    return row;
  });
}
