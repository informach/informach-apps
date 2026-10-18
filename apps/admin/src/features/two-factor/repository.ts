import "server-only";
import { randomUUID } from "node:crypto";
import { and, db, eq, gt, sql } from "@informach/db";
import { verifications } from "@informach/db/schema";
import { readDb } from "@/lib/read-db";

/**
 * Registros da prova por e-mail em `core.verifications` (ver `service.ts`).
 * Nenhuma consulta lê o valor guardado: a conferência é achar o `identifier`.
 */

function startsWith(prefix: string) {
  return sql`${verifications.identifier} like ${`${prefix}%`}`;
}

function stillValid() {
  return gt(verifications.expiresAt, sql`now()`);
}

/** Troca qualquer código anterior da sessão pelo novo. */
export async function replaceSetupCode(input: {
  prefix: string;
  identifier: string;
  userId: string;
  expiresAt: Date;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(verifications).where(startsWith(input.prefix));
    await tx.insert(verifications).values({
      id: randomUUID(),
      identifier: input.identifier,
      value: input.userId,
      expiresAt: input.expiresAt,
    });
  });
}

/**
 * Consome o código, se ele existir e não tiver vencido, e grava a prova da
 * sessão no lugar. Tudo numa transação: dois pedidos com o mesmo código não
 * geram duas provas.
 */
export async function redeemSetupCode(input: {
  prefix: string;
  identifier: string;
  proofIdentifier: string;
  userId: string;
  proofExpiresAt: Date;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [code] = await tx
      .delete(verifications)
      .where(and(eq(verifications.identifier, input.identifier), stillValid()))
      .returning({ id: verifications.id });
    if (!code) return false;
    await tx.delete(verifications).where(startsWith(input.prefix));
    await tx.delete(verifications).where(eq(verifications.identifier, input.proofIdentifier));
    await tx.insert(verifications).values({
      id: randomUUID(),
      identifier: input.proofIdentifier,
      value: input.userId,
      expiresAt: input.proofExpiresAt,
    });
    return true;
  });
}

/** Consome a prova da sessão (uso único). Devolve quando ela venceria, para poder devolvê-la. */
export async function takeEnableProof(
  proofIdentifier: string,
): Promise<{ expiresAt: Date } | null> {
  const [proof] = await db
    .delete(verifications)
    .where(and(eq(verifications.identifier, proofIdentifier), stillValid()))
    .returning({ expiresAt: verifications.expiresAt });
  return proof ?? null;
}

/** Devolve a prova quando a ativação não deu certo (senha errada, por exemplo). */
export async function restoreEnableProof(input: {
  proofIdentifier: string;
  userId: string;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(verifications).values({
    id: randomUUID(),
    identifier: input.proofIdentifier,
    value: input.userId,
    expiresAt: input.expiresAt,
  });
}

/** A tela pula o passo do e-mail quando a sessão já tem prova válida. */
export async function hasEnableProof(proofIdentifier: string): Promise<boolean> {
  const [row] = await readDb()
    .select({ id: verifications.id })
    .from(verifications)
    .where(and(eq(verifications.identifier, proofIdentifier), stillValid()))
    .limit(1);
  return Boolean(row);
}
