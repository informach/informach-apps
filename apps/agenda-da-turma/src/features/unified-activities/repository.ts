import "server-only";
import { db, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityStatuses,
  agendaNoticeActions,
  agendaProfileSubjectActivities,
  agendaStudentProfiles,
} from "@informach/db/schema";
import type { DashboardCounters } from "@/features/dashboard/types";
import { accessibleProfileCondition } from "@/features/family/access";
import { type ActivityOverviewOptions, OVERVIEW_PAGE_SIZE } from "./overview-types";
import { ROUTINE_MAX_ITEMS, type RoutineBucketKey } from "./routine-types";

// Projeção única das três fontes de atividade. Tudo que lista ou conta
// atividades (a lista de /atividades, os buckets da rotina, os KPIs) passa por
// aqui, para que os números e as listas nunca discordem.
function activityIndexCte(userId: string) {
  const profiles = sql`SELECT ${agendaStudentProfiles.id} FROM ${agendaStudentProfiles}
    WHERE ${accessibleProfileCondition(userId)}`;
  return sql`
    WITH activity_index AS (
      SELECT ${agendaActivityStatuses.id} AS id, 'turma' AS source,
        ${agendaActivityStatuses.studentProfileId} AS profile_id,
        ${agendaActivities.type}::text AS type,
        CASE WHEN ${agendaActivities.canceledAt} IS NOT NULL THEN 'canceled'
          ELSE ${agendaActivityStatuses.status}::text END AS status,
        ${agendaActivities.dueAt} AS due_at, ${agendaActivities.createdAt} AS created_at,
        NULL::uuid AS notice_id
      FROM ${agendaActivityStatuses}
      JOIN ${agendaActivities} ON ${agendaActivities.id} = ${agendaActivityStatuses.activityId}
      WHERE ${agendaActivityStatuses.studentProfileId} IN (${profiles})
      UNION ALL
      SELECT ${agendaNoticeActions.id}, 'notice', ${agendaNoticeActions.profileId},
        ${agendaNoticeActions.type}::text, ${agendaNoticeActions.status}::text,
        ${agendaNoticeActions.dueAt}, ${agendaNoticeActions.createdAt}, ${agendaNoticeActions.noticeId}
      FROM ${agendaNoticeActions} WHERE ${agendaNoticeActions.profileId} IN (${profiles})
      UNION ALL
      SELECT ${agendaProfileSubjectActivities.id}, 'extra', ${agendaProfileSubjectActivities.profileId},
        ${agendaProfileSubjectActivities.type}::text, ${agendaProfileSubjectActivities.status}::text,
        ${agendaProfileSubjectActivities.dueAt}, ${agendaProfileSubjectActivities.createdAt}, NULL::uuid
      FROM ${agendaProfileSubjectActivities} WHERE ${agendaProfileSubjectActivities.profileId} IN (${profiles})
    )`;
}

export async function listActivityOverviewIndex(userId: string, options: ActivityOverviewOptions) {
  return db.execute<{ id: string; source: "turma" | "notice" | "extra" }>(sql`
    ${activityIndexCte(userId)}
    SELECT id, source FROM activity_index
    WHERE (${options.profileFilter}::uuid IS NULL OR profile_id = ${options.profileFilter}::uuid)
      AND (${options.typeFilter}::text IS NULL OR type = ${options.typeFilter})
      AND (${options.statusFilter} = 'all' OR status = ${options.statusFilter})
      AND (${options.noticeId}::uuid IS NULL OR notice_id = ${options.noticeId}::uuid)
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
      CASE WHEN status = 'pending' THEN due_at END ASC NULLS FIRST,
      CASE WHEN status <> 'pending' THEN due_at END DESC NULLS LAST,
      created_at ASC, source ASC, id ASC
    LIMIT ${OVERVIEW_PAGE_SIZE + 1} OFFSET ${(options.page - 1) * OVERVIEW_PAGE_SIZE}
  `);
}

// Buckets da rotina do dashboard, sobre a MESMA projeção da lista.
//   attention — pendente, vencida, de hoje ou sem prazo a confirmar
//   tomorrow  — pendente para amanhã
//   week      — pendente de depois de amanhã até o sétimo dia
export async function listRoutineIndex(
  userId: string,
  options: {
    profileFilter: string | null;
    todayIso: string;
    tomorrowIso: string;
    weekEndIso: string;
  },
) {
  return db.execute<{ id: string; source: "turma" | "notice" | "extra"; bucket: RoutineBucketKey }>(
    sql`
    ${activityIndexCte(userId)}
    SELECT id, source,
      CASE
        WHEN due_at IS NULL OR due_at <= ${options.todayIso}::date THEN 'attention'
        WHEN due_at = ${options.tomorrowIso}::date THEN 'tomorrow'
        ELSE 'week'
      END AS bucket
    FROM activity_index
    WHERE status = 'pending'
      AND (${options.profileFilter}::uuid IS NULL OR profile_id = ${options.profileFilter}::uuid)
      AND (due_at IS NULL OR due_at <= ${options.weekEndIso}::date)
    ORDER BY due_at ASC NULLS FIRST, created_at ASC, source ASC, id ASC
    LIMIT ${ROUTINE_MAX_ITEMS}
  `,
  );
}

// KPIs contados sobre a mesma projeção — antes os contadores olhavam só turma
// e extras, então o número podia discordar da lista logo abaixo dele.
export async function getRoutineCounters(
  userId: string,
  options: {
    profileFilter: string | null;
    todayIso: string;
    tomorrowIso: string;
    weekEndIso: string;
    weekAgoIso: string;
  },
): Promise<DashboardCounters> {
  const rows = await db.execute<{
    overdue: string;
    today: string;
    week: string;
    done_recent: string;
  }>(sql`
    ${activityIndexCte(userId)}
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending' AND due_at < ${options.todayIso}::date) AS overdue,
      COUNT(*) FILTER (WHERE status = 'pending' AND due_at = ${options.todayIso}::date) AS today,
      COUNT(*) FILTER (
        WHERE status = 'pending'
          AND due_at BETWEEN ${options.tomorrowIso}::date AND ${options.weekEndIso}::date
      ) AS week,
      COUNT(*) FILTER (
        WHERE status = 'done'
          AND due_at BETWEEN ${options.weekAgoIso}::date AND ${options.todayIso}::date
      ) AS done_recent
    FROM activity_index
    WHERE (${options.profileFilter}::uuid IS NULL OR profile_id = ${options.profileFilter}::uuid)
  `);
  const row = rows[0];
  return {
    overdue: Number(row?.overdue ?? 0),
    today: Number(row?.today ?? 0),
    week: Number(row?.week ?? 0),
    doneRecent: Number(row?.done_recent ?? 0),
  };
}
