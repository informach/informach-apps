import "server-only";
import { sql } from "@informach/db";
import { agendaStudentProfiles, agendaTurmaMembers } from "@informach/db/schema";

// Active group is a preference. Membership is the authority, even if an old
// profile row still contains a group that has since been revoked.
export function activeMembershipCondition() {
  return sql`EXISTS (SELECT 1 FROM ${agendaTurmaMembers} membership
    WHERE membership.student_profile_id = ${agendaStudentProfiles.id}
      AND membership.turma_id = ${agendaStudentProfiles.activeTurmaId})`;
}
