import "server-only";
import { PRO_STATUSES } from "@informach/billing";
import { and, count, db, eq, gte, inArray, lt, sql } from "@informach/db";
import {
  agentRuns,
  customers,
  emailDeliveries,
  jobRuns,
  serviceStatus,
  subscriptions,
  users,
} from "@informach/db/schema";
import { readDb } from "@/lib/read-db";
import type { StoredRow } from "./decide";

/**
 * Escritas da vigia (só no schema `ops`) e leituras do resumo da semana. Nada
 * aqui lê nome, e-mail ou conteúdo de pessoa: só contagens, IDs de produto e
 * horários.
 */

export async function saveServiceStatus(row: StoredRow): Promise<void> {
  await db
    .insert(serviceStatus)
    .values(row)
    .onConflictDoUpdate({
      target: serviceStatus.service,
      set: {
        state: row.state,
        since: row.since,
        checkedAt: row.checkedAt,
        latencyMs: row.latencyMs,
        commit: row.commit,
        detail: row.detail,
        alertedAt: row.alertedAt,
      },
    });
}

export async function markAlerted(service: string, at: Date): Promise<void> {
  await db.update(serviceStatus).set({ alertedAt: at }).where(eq(serviceStatus.service, service));
}

/** O aviso de queda chegou a parte das pessoas: guarda a marca em `detail` (ver `decide.ts`). */
export async function markReached(service: string, detail: string): Promise<void> {
  await db.update(serviceStatus).set({ detail }).where(eq(serviceStatus.service, service));
}

/** Apaga execuções antigas de rotina. Devolve quantas saíram. */
export async function pruneJobRuns(before: Date): Promise<number> {
  const deleted = await db
    .delete(jobRuns)
    .where(lt(jobRuns.startedAt, before))
    .returning({ id: jobRuns.id });
  return deleted.length;
}

export async function newAccountsBetween(start: Date, end: Date): Promise<number> {
  const [row] = await readDb()
    .select({ total: count() })
    .from(users)
    .where(and(gte(users.createdAt, start), lt(users.createdAt, end)));
  return Number(row?.total ?? 0);
}

export type ProSubscription = { app: string; productId: string; status: string };

/** Assinaturas que contam como Pro hoje (`PRO_STATUSES`: `active` e `trialing`), por app e produto. */
export async function proSubscriptions(): Promise<ProSubscription[]> {
  return readDb()
    .select({
      app: customers.app,
      productId: subscriptions.productId,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId))
    .where(inArray(subscriptions.status, [...PRO_STATUSES]));
}

export async function reportedAiCostBetween(start: Date, end: Date): Promise<number> {
  const [row] = await readDb()
    .select({
      total:
        sql<number>`coalesce(sum(case when jsonb_typeof(${agentRuns.metadata}->'providerCostUsd') = 'number' then (${agentRuns.metadata}->>'providerCostUsd')::numeric end), 0)`.mapWith(
          Number,
        ),
      withCost:
        sql<number>`count(*) filter (where jsonb_typeof(${agentRuns.metadata}->'providerCostUsd') = 'number')`.mapWith(
          Number,
        ),
    })
    .from(agentRuns)
    .where(and(gte(agentRuns.startedAt, start), lt(agentRuns.startedAt, end)));
  return row && row.withCost > 0 ? row.total : 0;
}

export async function failedRunsBetween(start: Date, end: Date) {
  const rows = await readDb()
    .select({ app: jobRuns.app, job: jobRuns.job, failures: count() })
    .from(jobRuns)
    .where(and(gte(jobRuns.startedAt, start), lt(jobRuns.startedAt, end), eq(jobRuns.ok, false)))
    .groupBy(jobRuns.app, jobRuns.job);
  return rows.map((row) => ({ ...row, failures: Number(row.failures) }));
}

/**
 * Avisos de queda e de volta da semana, pela chave das mensagens
 * (`admin.alert:<serviço>:<início>:<down|up>:<destinatário>`). A chave não traz
 * o endereço, só um resumo dele, e o destinatário da linha não é lido.
 */
export async function alertKeysBetween(start: Date, end: Date) {
  return readDb()
    .select({ messageKey: emailDeliveries.messageKey, createdAt: emailDeliveries.createdAt })
    .from(emailDeliveries)
    .where(
      and(
        eq(emailDeliveries.category, "admin.alert"),
        gte(emailDeliveries.createdAt, start),
        lt(emailDeliveries.createdAt, end),
      ),
    );
}
