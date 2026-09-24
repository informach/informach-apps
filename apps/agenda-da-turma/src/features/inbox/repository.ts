import "server-only";
import { createHash } from "node:crypto";
import { and, count, db, eq, isNull, sql } from "@informach/db";
import { agendaInboxAddresses, agendaInboxMessages } from "@informach/db/schema";

export const hashToken = (token: string) =>
  createHash("sha256").update(token.toUpperCase()).digest("hex");

/** Quantas mensagens ainda esperando virar recado. O teto protege a caixa. */
export const MAX_NEW_MESSAGES = 20;
/** Mesma retenção do original de um recado. */
export const MESSAGE_RETENTION_DAYS = 30;

export async function findActiveInboxAddress(userId: string) {
  const [row] = await db
    .select({ id: agendaInboxAddresses.id, createdAt: agendaInboxAddresses.createdAt })
    .from(agendaInboxAddresses)
    .where(and(eq(agendaInboxAddresses.userId, userId), isNull(agendaInboxAddresses.revokedAt)));
  return row ?? null;
}

/**
 * Girar o endereço substitui o anterior na mesma transação.
 *
 * O antigo fica revogado, não apagado: uma mensagem que chegar depois nele
 * encontra a linha e é recusada em silêncio, em vez de cair numa caixa de
 * outra família por reaproveitamento de token.
 */
export async function replaceInboxAddress(userId: string, token: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(agendaInboxAddresses)
      .set({ revokedAt: new Date() })
      .where(and(eq(agendaInboxAddresses.userId, userId), isNull(agendaInboxAddresses.revokedAt)));
    await tx.insert(agendaInboxAddresses).values({ userId, tokenHash: hashToken(token) });
  });
}

export async function revokeInboxAddresses(userId: string) {
  await db
    .update(agendaInboxAddresses)
    .set({ revokedAt: new Date() })
    .where(and(eq(agendaInboxAddresses.userId, userId), isNull(agendaInboxAddresses.revokedAt)));
}

export async function findOwnerByToken(token: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: agendaInboxAddresses.userId })
    .from(agendaInboxAddresses)
    .where(
      and(
        eq(agendaInboxAddresses.tokenHash, hashToken(token)),
        isNull(agendaInboxAddresses.revokedAt),
      ),
    );
  return row?.userId ?? null;
}

export async function countNewMessages(ownerUserId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(agendaInboxMessages)
    .where(
      and(eq(agendaInboxMessages.ownerUserId, ownerUserId), eq(agendaInboxMessages.status, "new")),
    );
  return row?.value ?? 0;
}

/**
 * Insere respeitando o teto, sob trava por família.
 *
 * Contar antes e inserir depois deixa duas entregas simultâneas passarem as
 * duas — o mesmo motivo pelo qual o limite de pendências e o de perfis usam
 * `pg_advisory_xact_lock`. Devolve `null` quando a caixa está cheia.
 */
export async function insertInboxMessageWithinCap(values: typeof agendaInboxMessages.$inferInsert) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:inbox:${values.ownerUserId}`}))`,
    );
    const [current] = await tx
      .select({ value: count() })
      .from(agendaInboxMessages)
      .where(
        and(
          eq(agendaInboxMessages.ownerUserId, values.ownerUserId),
          eq(agendaInboxMessages.status, "new"),
        ),
      );
    if ((current?.value ?? 0) >= MAX_NEW_MESSAGES) return null;
    const [row] = await tx
      .insert(agendaInboxMessages)
      .values(values)
      .returning({ id: agendaInboxMessages.id });
    return row ?? null;
  });
}

export async function listNewInboxMessages(ownerUserId: string) {
  return db
    .select({
      id: agendaInboxMessages.id,
      subject: agendaInboxMessages.subject,
      fromDomain: agendaInboxMessages.fromDomain,
      receivedAt: agendaInboxMessages.receivedAt,
      attachmentName: agendaInboxMessages.attachmentName,
    })
    .from(agendaInboxMessages)
    .where(
      and(eq(agendaInboxMessages.ownerUserId, ownerUserId), eq(agendaInboxMessages.status, "new")),
    )
    .orderBy(sql`${agendaInboxMessages.receivedAt} DESC`)
    .limit(MAX_NEW_MESSAGES);
}

export async function findInboxMessage(ownerUserId: string, id: string) {
  const [row] = await db
    .select()
    .from(agendaInboxMessages)
    .where(
      and(
        eq(agendaInboxMessages.id, id),
        eq(agendaInboxMessages.ownerUserId, ownerUserId),
        eq(agendaInboxMessages.status, "new"),
      ),
    );
  return row ?? null;
}

/**
 * A mesma mensagem, para reabrir a captura.
 *
 * Aceita `used` além de `new`: a mensagem sai da caixa assim que a leitura
 * fica pronta, e voltar para o endereço depois disso — por um recarregamento,
 * por um toque no voltar — mostrava um formulário vazio sem explicação. O corpo
 * continua guardado até a retenção acabar.
 */
export async function findInboxMessageForCapture(ownerUserId: string, id: string) {
  const [row] = await db
    .select()
    .from(agendaInboxMessages)
    .where(
      and(
        eq(agendaInboxMessages.id, id),
        eq(agendaInboxMessages.ownerUserId, ownerUserId),
        sql`${agendaInboxMessages.status} <> 'discarded'`,
      ),
    );
  return row ?? null;
}

export async function setInboxMessageStatus(
  ownerUserId: string,
  id: string,
  status: "used" | "discarded",
  noticeId: string | null = null,
) {
  const [row] = await db
    .update(agendaInboxMessages)
    .set({ status, noticeId })
    .where(
      and(
        eq(agendaInboxMessages.id, id),
        eq(agendaInboxMessages.ownerUserId, ownerUserId),
        eq(agendaInboxMessages.status, "new"),
      ),
    )
    .returning({ id: agendaInboxMessages.id });
  return Boolean(row);
}

/** Retenção: o corpo e o anexo somem no prazo, a linha some junto. */
export async function purgeExpiredInboxMessages(now: Date) {
  await db
    .delete(agendaInboxMessages)
    .where(sql`${agendaInboxMessages.expiresAt} <= ${now.toISOString()}::timestamptz`);
}
