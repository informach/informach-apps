import "server-only";

import { and, asc, db, eq, sql } from "@informach/db";
import { agendaProfileSubjects, agendaStudentProfiles, agendaTasks } from "@informach/db/schema";
import { accessibleProfileCondition } from "@/features/family/access";
import { addDaysIso, todayLocalIso } from "./date";
import type { DashboardCounters, DashboardProfileSummary } from "./types";

/**
 * Matéria extracurricular pausada é silêncio: nem KPI, nem progresso.
 *
 * A regra existia só para a tabela de extras; agora vale para a tarefa que
 * tiver vínculo com uma matéria pausada, venha de onde vier. Tarefa sem
 * vínculo nunca é escondida por isto.
 */
const visibleTaskCondition = sql`
  ${agendaTasks.status} <> 'canceled'
  AND (
    ${agendaTasks.profileSubjectId} IS NULL
    OR EXISTS (
      SELECT 1 FROM ${agendaProfileSubjects} ps
      WHERE ps.id = ${agendaTasks.profileSubjectId} AND ps.status = 'active'
    )
  )
`;

/**
 * Os quatro contadores numa consulta só.
 *
 * Eram duas — uma por tabela — somadas em JavaScript, e cada uma com o seu
 * jeito de esconder o que estava cancelado. Uma tarefa é uma linha: "5 hoje"
 * quer dizer cinco itens na lista logo abaixo, inclusive quando a mesma
 * atividade vale para dois filhos (são duas coisas a fazer).
 */
export async function getDashboardCounters(
  userId: string,
  options: { profileFilter: string | null },
): Promise<DashboardCounters> {
  const today = todayLocalIso();
  const tomorrow = addDaysIso(today, 1);
  const sevenAhead = addDaysIso(today, 7);
  const sevenAgo = addDaysIso(today, -7);
  const due = agendaTasks.dueAt;
  const status = agendaTasks.status;

  const [row] = await db
    .select({
      overdue: sql<number>`COUNT(*) FILTER (WHERE ${status} = 'pending' AND ${due} < ${today}::date)`,
      today: sql<number>`COUNT(*) FILTER (WHERE ${status} = 'pending' AND ${due} = ${today}::date)`,
      week: sql<number>`COUNT(*) FILTER (WHERE ${status} = 'pending' AND ${due} BETWEEN ${tomorrow}::date AND ${sevenAhead}::date)`,
      doneRecent: sql<number>`COUNT(*) FILTER (WHERE ${status} = 'done' AND ${due} BETWEEN ${sevenAgo}::date AND ${today}::date)`,
    })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(
      and(
        accessibleProfileCondition(userId),
        options.profileFilter ? eq(agendaStudentProfiles.id, options.profileFilter) : undefined,
        visibleTaskCondition,
      ),
    );

  return {
    overdue: Number(row?.overdue ?? 0),
    today: Number(row?.today ?? 0),
    week: Number(row?.week ?? 0),
    doneRecent: Number(row?.doneRecent ?? 0),
  };
}

/**
 * Resumo por criança. Sempre traz TODAS as crianças acessíveis, mesmo as sem
 * nenhuma atividade — daí o LEFT JOIN. Não aceita filtro: é a fonte de
 * "o que cada filho tem".
 */
export async function listProfileSummaries(userId: string): Promise<DashboardProfileSummary[]> {
  const today = todayLocalIso();
  const due = agendaTasks.dueAt;
  const status = agendaTasks.status;

  const rows = await db
    .select({
      profileId: agendaStudentProfiles.id,
      profileName: agendaStudentProfiles.name,
      pending: sql<number>`COUNT(*) FILTER (WHERE ${status} = 'pending')`,
      overdue: sql<number>`COUNT(*) FILTER (WHERE ${status} = 'pending' AND ${due} < ${today}::date)`,
      done: sql<number>`COUNT(*) FILTER (WHERE ${status} = 'done')`,
    })
    .from(agendaStudentProfiles)
    .leftJoin(
      agendaTasks,
      and(eq(agendaTasks.profileId, agendaStudentProfiles.id), visibleTaskCondition),
    )
    .where(accessibleProfileCondition(userId))
    .groupBy(agendaStudentProfiles.id, agendaStudentProfiles.name, agendaStudentProfiles.createdAt)
    .orderBy(asc(agendaStudentProfiles.createdAt));

  return rows.map((r) => {
    const pending = Number(r.pending ?? 0);
    const done = Number(r.done ?? 0);
    const total = pending + done;
    return {
      profileId: r.profileId,
      profileName: r.profileName,
      pending,
      overdue: Number(r.overdue ?? 0),
      doneTotal: done,
      totalAll: total,
      progressPercent: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  });
}
