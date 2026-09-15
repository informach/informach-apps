import "server-only";

import { and, db, eq, sql } from "@informach/db";
import {
  agendaActivities,
  agendaStudentProfiles,
  agendaTasks,
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
        sql`NOT EXISTS (SELECT 1 FROM ${agendaTasks} n
        INNER JOIN ${agendaStudentProfiles} p ON p.id = n.profile_id
        WHERE n.shared_activity_id = ${agendaActivities.id} AND p.user_id <> ${userId})`,
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
