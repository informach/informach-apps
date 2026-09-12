import "server-only";
import { db, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityStatuses,
  agendaNoticeActions,
  agendaProfileSubjectActivities,
  agendaStudentProfiles,
} from "@informach/db/schema";
import { accessibleProfileCondition } from "@/features/family/access";
import { type ActivityOverviewOptions, OVERVIEW_PAGE_SIZE } from "./overview-types";

export async function listActivityOverviewIndex(userId: string, options: ActivityOverviewOptions) {
  const profiles = sql`SELECT ${agendaStudentProfiles.id} FROM ${agendaStudentProfiles}
    WHERE ${accessibleProfileCondition(userId)}`;
  return db.execute<{ id: string; source: "turma" | "notice" | "extra" }>(sql`
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
    )
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
