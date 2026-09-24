import "server-only";
import { and, db, eq, sql } from "@informach/db";
import { agendaIdempotentWrites } from "@informach/db/schema";
import type { z } from "zod";
import type { statusNoticeActionSchema } from "@/features/notices/schemas";
import { setNoticeActionStatusWithinTx } from "@/features/notices/write-repository";
import { logger } from "@/lib/logger";
import { type WriteReceipt, writeReceiptSchema } from "./schemas";

/** Quanto tempo um recibo vale. Depois disso, repetir a chave grava de novo. */
export const RECEIPT_RETENTION_DAYS = 7;

export type StoredReceipt =
  | { found: false }
  | { found: true; taskId: string | null; receipt: WriteReceipt | null };

/**
 * O recibo de uma chave, sem tocar na atividade.
 *
 * Lido ANTES de procurar a atividade: o recibo precisa sobreviver à atividade
 * que descreve (é por isso que `task_id` não tem chave estrangeira), e procurar
 * a atividade primeiro faria a repetição de uma gravação cuja atividade foi
 * apagada responder "não encontrado" em vez de devolver o que foi respondido
 * da primeira vez.
 */
export async function findWriteReceipt(userId: string, key: string): Promise<StoredReceipt> {
  const [row] = await db
    .select({ result: agendaIdempotentWrites.result, taskId: agendaIdempotentWrites.taskId })
    .from(agendaIdempotentWrites)
    .where(and(eq(agendaIdempotentWrites.userId, userId), eq(agendaIdempotentWrites.key, key)));
  if (!row) return { found: false };
  const parsed = writeReceiptSchema.safeParse(row.result);
  if (!parsed.success) logger.warn({ key }, "agenda.offline_queue.unreadable_receipt");
  return { found: true, taskId: row.taskId, receipt: parsed.success ? parsed.data : null };
}

/**
 * Grava o status uma vez só, por mais vezes que o aparelho tente.
 *
 * A trava por chave é o que torna isto honesto. Sem ela, duas tentativas
 * simultâneas da mesma chave — a fila esvaziando enquanto a pessoa toca o card
 * — passariam as duas pelo SELECT vazio; a segunda seria serializada pela trava
 * da família, veria a versão já incrementada e devolveria "alguém mudou isso
 * agora" para uma mudança que foi dela mesma.
 *
 * O recibo e a gravação são a MESMA transação de propósito: gravar primeiro e
 * anotar depois deixa uma janela em que a atividade está concluída e o recibo
 * não existe, e é justamente nessa janela que uma queda de rede manda o
 * aparelho tentar de novo.
 *
 * Um `return` de dentro de uma transação Drizzle COMMITA, e aqui isso é o
 * desejado: a recusa por versão também é um resultado, e precisa ficar guardada
 * para que a retentativa receba a mesma recusa em vez de outra.
 */
export async function applyTaskStatusOnce(params: {
  key: string;
  userId: string;
  ownerId: string;
  isPro: boolean;
  input: z.infer<typeof statusNoticeActionSchema>;
}): Promise<{ result: WriteReceipt; replayed: boolean } | { conflictingTaskId: string | null }> {
  const { key, userId, ownerId, isPro, input } = params;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:idem:${userId}:${key}`}))`,
    );
    const [stored] = await tx
      .select({ result: agendaIdempotentWrites.result, taskId: agendaIdempotentWrites.taskId })
      .from(agendaIdempotentWrites)
      .where(and(eq(agendaIdempotentWrites.userId, userId), eq(agendaIdempotentWrites.key, key)));
    if (stored) {
      // A mesma chave para outra atividade é defeito do aparelho, não repetição:
      // devolver o recibo antigo confirmaria uma gravação que nunca aconteceu.
      if (stored.taskId !== input.id) return { conflictingTaskId: stored.taskId };
      const parsed = writeReceiptSchema.safeParse(stored.result);
      if (parsed.success) return { result: parsed.data, replayed: true };
      logger.warn({ key }, "agenda.offline_queue.unreadable_receipt");
    }
    const result = (await setNoticeActionStatusWithinTx(
      tx,
      userId,
      input,
      ownerId,
      isPro,
    )) as WriteReceipt;
    // `DoUpdate`, e não `DoNothing`: só se chega aqui sem recibo legível, e sob
    // a trava ninguém mais escreve nesta chave. Um recibo ilegível de um build
    // anterior seria eterno com `DoNothing` — toda retentativa regravaria, veria
    // conflito de versão, e a idempotência daquela chave ficaria desligada para
    // sempre.
    await tx
      .insert(agendaIdempotentWrites)
      .values({ key, userId, taskId: input.id, result })
      .onConflictDoUpdate({
        target: [agendaIdempotentWrites.userId, agendaIdempotentWrites.key],
        set: { result, taskId: input.id },
      });
    return { result, replayed: false };
  });
}

/**
 * Retenção: recibo é lembrança de curto prazo.
 *
 * Sete dias cobrem com folga um aparelho que ficou sem rede uma semana. Guardar
 * para sempre transformaria a tabela num diário de tudo que a família concluiu,
 * que é justamente o que ela não precisa ser.
 */
export async function purgeExpiredIdempotentWrites(now: Date) {
  await db
    .delete(agendaIdempotentWrites)
    .where(
      sql`${agendaIdempotentWrites.createdAt} <= ${new Date(now.valueOf() - RECEIPT_RETENTION_DAYS * 86_400_000).toISOString()}::timestamptz`,
    );
}
