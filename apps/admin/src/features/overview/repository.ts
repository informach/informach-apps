import "server-only";
import { and, count, eq, gte, inArray, lt, sql } from "@informach/db";
import {
  agendaFamilyMembers,
  agendaStudentProfiles,
  agentRuns,
  events as auditEvents,
  boraFamilies,
  cozyaProfiles,
  creditReservations,
  customers,
  ediDevices,
  ediEntitlements,
  missaoFamilies,
  missaoReports,
  users,
} from "@informach/db/schema";
import { readDb } from "@/lib/read-db";
import type { DayCount } from "./logic";
import { memo } from "./memo";

/**
 * Leituras do Painel. Só contagens e somas: nenhuma linha de pessoa, nenhum
 * conteúdo. O destinatário dos e-mails nunca é lido, só a categoria.
 */

/** Total de contas e quem entrou desde `since7`. As novas da semana saem do gráfico por dia. */
export type AccountTotals = { total: number; signedIn7: number };

export async function accountTotals(since7: Date): Promise<AccountTotals> {
  const db = readDb();
  const [accounts, signedIn] = await Promise.all([
    db.select({ total: count() }).from(users),
    // `session.created` é gravado pelo pacote de autenticação em toda entrada, em
    // qualquer app, mesmo quando a sessão mora no Redis (o hook roda igual).
    db
      .select({ total: sql<number>`count(distinct ${auditEvents.actorId})`.mapWith(Number) })
      .from(auditEvents)
      .where(and(eq(auditEvents.eventType, "session.created"), gte(auditEvents.createdAt, since7))),
  ]);
  return {
    total: Number(accounts[0]?.total ?? 0),
    signedIn7: signedIn[0]?.total ?? 0,
  };
}

export async function signupsPerDay(since: Date): Promise<DayCount[]> {
  const day = sql<string>`to_char(${users.createdAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;
  const rows = await readDb()
    .select({ day, count: count() })
    .from(users)
    .where(gte(users.createdAt, since))
    .groupBy(day);
  return rows.map((row) => ({ day: row.day, count: Number(row.count) }));
}

/**
 * Contas presentes em dois produtos ou mais. Presença é ter dado próprio do
 * produto (perfil do Cozya, criança ou convite na Agenda, família na Missão ou
 * no Bora Treinar, computador ou direito na Suíte Edi) ou um cadastro de
 * cobrança nele.
 */
export function multiProductAccounts(): Promise<number> {
  return memo("overview:multi-product", 5 * 60_000, async () => {
    const rows = await readDb().execute<{ total: number }>(sql`
      select count(*)::int as total from (
        select presence.user_id
        from (
          select ${cozyaProfiles.userId} as user_id, 'cozya' as product from ${cozyaProfiles}
          union select ${agendaStudentProfiles.userId}, 'agenda-da-turma' from ${agendaStudentProfiles}
          union select ${agendaFamilyMembers.userId}, 'agenda-da-turma' from ${agendaFamilyMembers}
          union select ${missaoFamilies.userId}, 'missao-saber' from ${missaoFamilies}
          union select ${boraFamilies.userId}, 'bora-treinar' from ${boraFamilies}
          union select ${ediDevices.userId}, 'edi' from ${ediDevices}
          union select ${ediEntitlements.userId}, 'edi' from ${ediEntitlements}
          union select ${customers.subjectId}, ${customers.app} from ${customers}
            where ${customers.subjectType} = 'user'
        ) as presence
        group by presence.user_id
        having count(distinct presence.product) >= 2
      ) as several
    `);
    return Number(rows[0]?.total ?? 0);
  });
}

/** Relatos de erro de conteúdo abertos pelas famílias na Missão Saber. */
export async function openContentReports(): Promise<number> {
  const [row] = await readDb()
    .select({ total: count() })
    .from(missaoReports)
    .where(inArray(missaoReports.status, ["open", "investigating"]));
  return Number(row?.total ?? 0);
}

export type AiWeek = {
  /** Execuções de modelo gravadas em `ai.agent_runs`, por app. */
  runs: { app: string; total: number; withCost: number; costUsd: number; failed: number }[];
  /** Tarefas cobradas em crédito (`billing.credit_reservations`), por app e situação. */
  tasks: { app: string; status: string; total: number }[];
};

export async function aiWeek(since: Date): Promise<AiWeek> {
  const db = readDb();
  const costIsNumber = sql`jsonb_typeof(${agentRuns.metadata}->'providerCostUsd') = 'number'`;
  const [runs, tasks] = await Promise.all([
    db
      .select({
        app: agentRuns.app,
        total: count(),
        withCost: sql<number>`count(*) filter (where ${costIsNumber})`.mapWith(Number),
        costUsd:
          sql<number>`coalesce(sum(case when ${costIsNumber} then (${agentRuns.metadata}->>'providerCostUsd')::numeric end), 0)`.mapWith(
            Number,
          ),
        failed: sql<number>`count(*) filter (where ${agentRuns.status} = 'failed')`.mapWith(Number),
      })
      .from(agentRuns)
      .where(gte(agentRuns.startedAt, since))
      .groupBy(agentRuns.app),
    db
      .select({
        app: creditReservations.app,
        status: creditReservations.status,
        total: count(),
      })
      .from(creditReservations)
      .where(gte(creditReservations.createdAt, since))
      .groupBy(creditReservations.app, creditReservations.status),
  ]);
  return {
    runs: runs.map((row) => ({ ...row, total: Number(row.total) })),
    tasks: tasks.map((row) => ({ ...row, total: Number(row.total) })),
  };
}

/** Reservas abertas além do prazo. */
export async function overdueReservationCount(now: Date): Promise<number> {
  const [row] = await readDb()
    .select({ total: count() })
    .from(creditReservations)
    .where(and(eq(creditReservations.status, "active"), lt(creditReservations.expiresAt, now)));
  return Number(row?.total ?? 0);
}
