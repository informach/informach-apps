import "server-only";
import { checkSchemaReadiness, count, desc, gte, sql } from "@informach/db";
import { agentRuns, creditReservations, emailDeliveries, jobRuns } from "@informach/db/schema";
import { readDb } from "@/lib/read-db";
import type { LastRun } from "./routines";

/**
 * Leituras de Operação. Só contagens, horários e nomes de rotina: nenhum
 * destinatário, assunto ou corpo de e-mail, nenhum dado de pessoa.
 */

export type StoredRun = LastRun & { app: string; job: string };

/** Última execução de cada rotina, pelo índice (app, job, started_at). */
export async function latestRuns(): Promise<StoredRun[]> {
  const rows = await readDb()
    .selectDistinctOn([jobRuns.app, jobRuns.job], {
      app: jobRuns.app,
      job: jobRuns.job,
      startedAt: jobRuns.startedAt,
      finishedAt: jobRuns.finishedAt,
      ok: jobRuns.ok,
      errorName: jobRuns.errorName,
      summary: jobRuns.summary,
    })
    .from(jobRuns)
    .orderBy(jobRuns.app, jobRuns.job, desc(jobRuns.startedAt));
  return rows;
}

export type RunFailures = { app: string; job: string; failures: number; runs: number };

export async function runCountsSince(since: Date): Promise<RunFailures[]> {
  const rows = await readDb()
    .select({
      app: jobRuns.app,
      job: jobRuns.job,
      runs: count(),
      failures: sql<number>`count(*) filter (where ${jobRuns.ok} = false)`.mapWith(Number),
    })
    .from(jobRuns)
    .where(gte(jobRuns.startedAt, since))
    .groupBy(jobRuns.app, jobRuns.job);
  return rows.map((row) => ({ ...row, runs: Number(row.runs) }));
}

export type EmailCount = {
  category: string;
  status: string;
  retryScheduled: boolean;
  count: number;
};

/** E-mails criados desde `since`, por categoria e situação. */
export async function emailCountsSince(since: Date): Promise<EmailCount[]> {
  const retryScheduled = sql<boolean>`(${emailDeliveries.nextAttemptAt} is not null)`;
  const rows = await readDb()
    .select({
      category: emailDeliveries.category,
      status: emailDeliveries.status,
      retryScheduled,
      count: count(),
    })
    .from(emailDeliveries)
    .where(gte(emailDeliveries.createdAt, since))
    .groupBy(emailDeliveries.category, emailDeliveries.status, retryScheduled);
  return rows.map((row) => ({
    ...row,
    retryScheduled: Boolean(row.retryScheduled),
    count: Number(row.count),
  }));
}

export type ReservationCount = { app: string; status: string; count: number };

/**
 * Tarefas de IA pelas reservas de crédito: `committed` usou o crédito,
 * `released`/`expired` devolveram (a tarefa falhou ou foi abandonada) e
 * `active` ainda está em andamento.
 */
export async function reservationCountsSince(since: Date): Promise<ReservationCount[]> {
  const rows = await readDb()
    .select({ app: creditReservations.app, status: creditReservations.status, count: count() })
    .from(creditReservations)
    .where(gte(creditReservations.createdAt, since))
    .groupBy(creditReservations.app, creditReservations.status);
  return rows.map((row) => ({ ...row, count: Number(row.count) }));
}

export type AiCost = { app: string; runs: number; withCost: number; reportedUsd: number };

/** Custo que o provedor informou nas execuções de IA (hoje só o Cozya grava). */
export async function aiCostSince(since: Date): Promise<AiCost[]> {
  const rows = await readDb()
    .select({
      app: agentRuns.app,
      runs: count(),
      withCost:
        sql<number>`count(*) filter (where jsonb_typeof(${agentRuns.metadata}->'providerCostUsd') = 'number')`.mapWith(
          Number,
        ),
      reportedUsd:
        sql<number>`coalesce(sum(case when jsonb_typeof(${agentRuns.metadata}->'providerCostUsd') = 'number' then (${agentRuns.metadata}->>'providerCostUsd')::numeric end), 0)`.mapWith(
          Number,
        ),
    })
    .from(agentRuns)
    .where(gte(agentRuns.startedAt, since))
    .groupBy(agentRuns.app);
  return rows.map((row) => ({ ...row, runs: Number(row.runs) }));
}

/** Estado das migrações do banco, pela mesma pergunta do `/api/ready`. */
export function migrationState() {
  return checkSchemaReadiness();
}
