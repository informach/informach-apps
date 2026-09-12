import "server-only";

import { type Database, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityStatuses,
  agendaNoticeActions,
  agendaProfileSubjectActivities,
  agendaStudentProfiles,
} from "@informach/db/schema";

export type AgendaTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function lockPendingLimit(tx: AgendaTransaction, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:activities:${userId}`}))`);
}

// Count one school activity even when it applies to siblings. Received school
// activities do not consume the quota. Completed/canceled work stays in history.
export async function countPendingActivities(
  client: Database | AgendaTransaction,
  userId: string,
): Promise<number> {
  const result = await client.execute<{ total: string }>(sql`
    SELECT (
      (SELECT count(*) FROM ${agendaActivities} a
       WHERE a.created_by_user_id = ${userId} AND a.canceled_at IS NULL
         AND EXISTS (SELECT 1 FROM ${agendaActivityStatuses} s
           INNER JOIN ${agendaStudentProfiles} p ON p.id = s.student_profile_id
           WHERE s.activity_id = a.id AND s.status = 'pending' AND p.user_id = ${userId}))
      + (SELECT count(*) FROM ${agendaProfileSubjectActivities} e
         WHERE e.created_by_user_id = ${userId} AND e.status = 'pending')
      + (SELECT count(*) FROM ${agendaNoticeActions} n
         INNER JOIN ${agendaStudentProfiles} p ON p.id = n.profile_id
         WHERE p.user_id = ${userId} AND n.status = 'pending')
    )::text AS total
  `);
  return Number(result[0]?.total ?? 0);
}
