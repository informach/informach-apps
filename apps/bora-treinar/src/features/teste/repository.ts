import "server-only";
import { and, db, eq, inArray, sql } from "@informach/db";
import { boraFamilies, boraTrialClaims } from "@informach/db/schema";
import { ensureFamily } from "../familia/repository";

/** Quando o teste da família começou (nulo = nunca). */
export async function inicioDoTeste(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ trialStartedAt: boraFamilies.trialStartedAt })
    .from(boraFamilies)
    .where(eq(boraFamilies.userId, userId));
  return row?.trialStartedAt ?? null;
}

/**
 * Reivindica o teste para este e-mail (pelo hash) e grava o início na família. Um por e-mail:
 * se o hash já foi usado por outra conta (o e-mail apagou a conta e criou de novo), devolve nulo.
 * Pedir de novo na mesma conta devolve o mesmo início, sem recomeçar o teste.
 */
export async function reivindicarTeste(
  userId: string,
  /** o primeiro é o que se grava; os outros só reconhecem pedidos feitos com a chave antiga */
  hashes: string[],
): Promise<Date | null> {
  const [emailHash] = hashes;
  if (!emailHash) return null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`bora:teste:${emailHash}`}))`);
    await ensureFamily(userId, tx);
    // já pedido com qualquer uma das chaves? vale o pedido antigo
    const [anterior] = await tx
      .select()
      .from(boraTrialClaims)
      .where(inArray(boraTrialClaims.emailHash, hashes))
      .orderBy(boraTrialClaims.startedAt)
      .limit(1);
    if (!anterior)
      await tx.insert(boraTrialClaims).values({ emailHash, userId }).onConflictDoNothing();
    const [claim] = anterior
      ? [anterior]
      : await tx.select().from(boraTrialClaims).where(eq(boraTrialClaims.emailHash, emailHash));
    if (!claim || claim.userId !== userId) return null;
    await tx
      .update(boraFamilies)
      .set({ trialStartedAt: claim.startedAt })
      .where(and(eq(boraFamilies.userId, userId)));
    return claim.startedAt;
  });
}
