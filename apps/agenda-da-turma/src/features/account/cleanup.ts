import "server-only";

import { and, db, eq, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityStatuses,
  agendaStudentProfiles,
  agendaTurmaMembers,
  agendaTurmas,
} from "@informach/db/schema";

// Keep activities already used by another household; nullable attribution is
// cleared by the user FK. Delete private/orphaned content before auth deletion.
export async function cleanAgendaAccount(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(agendaActivities).where(
      and(
        eq(agendaActivities.createdByUserId, userId),
        sql`NOT EXISTS (SELECT 1 FROM ${agendaActivityStatuses} s
        INNER JOIN ${agendaStudentProfiles} p ON p.id = s.student_profile_id
        WHERE s.activity_id = ${agendaActivities.id} AND p.user_id <> ${userId})`,
      ),
    );
    await tx.delete(agendaTurmas).where(
      and(
        eq(agendaTurmas.createdByUserId, userId),
        sql`NOT EXISTS (SELECT 1 FROM ${agendaTurmaMembers} m
        INNER JOIN ${agendaStudentProfiles} p ON p.id = m.student_profile_id
        WHERE m.turma_id = ${agendaTurmas.id} AND p.user_id <> ${userId})`,
        sql`NOT EXISTS (SELECT 1 FROM ${agendaActivities} a
        WHERE a.turma_id = ${agendaTurmas.id})`,
      ),
    );
  });
}
