import "server-only";

import { type Database, sql } from "@informach/db";
import { agendaStudentProfiles, agendaTasks } from "@informach/db/schema";

export type AgendaTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function lockPendingLimit(tx: AgendaTransaction, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:activities:${userId}`}))`);
}

/**
 * Pendências próprias da família, para o limite do plano gratuito.
 *
 * Eram três contagens somadas, uma por tabela. A regra que a soma existia para
 * proteger continua valendo e agora cabe num `DISTINCT`: **a mesma atividade
 * escolar conta uma vez, ainda que valha para dois filhos** — são duas tarefas,
 * mas uma obrigação só, e cobrar duas seria punir quem tem mais de um filho.
 * `COALESCE(shared_activity_id, id)` é essa identidade: a atividade publicada
 * quando existe, a própria tarefa quando não.
 *
 * Atividade compartilhada recebida de outra família não consome cota — é
 * benefício do gratuito (ver §1 do guia do app). Concluído e cancelado saem da
 * conta sem sair do histórico.
 */
export async function countPendingActivities(
  client: Database | AgendaTransaction,
  userId: string,
): Promise<number> {
  const result = await client.execute<{ total: string }>(sql`
    SELECT count(DISTINCT COALESCE(n.shared_activity_id, n.id))::text AS total
    FROM ${agendaTasks} n
    INNER JOIN ${agendaStudentProfiles} p ON p.id = n.profile_id
    WHERE p.user_id = ${userId}
      AND n.status = 'pending'
      AND (n.shared_activity_id IS NULL OR n.created_by_user_id = ${userId})
  `);
  return Number(result[0]?.total ?? 0);
}
