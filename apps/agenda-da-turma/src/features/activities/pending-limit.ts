import "server-only";
import { type Database, sql } from "@informach/db";
import {
  agendaActivities,
  agendaStudentProfiles,
  agendaTasks,
  familyAppProfiles,
  familyGroupPeople,
  familyPeople,
} from "@informach/db/schema";
import { familyMembershipCondition } from "@informach/family/access";
import { lockFamilyMembership } from "@informach/family/context";
import type { AgendaAuthority } from "@/features/family/authority";
import { activeProfileSubjectConditionFor } from "@/features/profile-subjects/visibility";
export type AgendaTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export async function lockPendingLimit(tx: AgendaTransaction, actor: AgendaAuthority) {
  await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
}
/** Whole-household pending obligations; receiving another household's publication is free. */
export async function countPendingActivities(
  client: Database | AgendaTransaction,
  actor: AgendaAuthority,
): Promise<number> {
  const result = await client.execute<{ total: string }>(sql`
    SELECT count(DISTINCT COALESCE(n.shared_activity_id, n.id))::text AS total
    FROM ${agendaTasks} n
    JOIN ${agendaStudentProfiles} p ON p.id = n.profile_id
    JOIN ${familyAppProfiles} a ON a.id = p.family_profile_id AND a.app = 'agenda-da-turma'
    JOIN ${familyPeople} person ON person.id = a.person_id
    JOIN ${familyGroupPeople} gp ON gp.person_id = a.person_id AND gp.group_id = a.group_id
    LEFT JOIN ${agendaActivities} publication ON publication.id = n.shared_activity_id
    WHERE a.group_id = ${actor.familyGroupId}::uuid AND ${familyMembershipCondition(actor.userId, sql`a.group_id`)}
      AND a.archived_at IS NULL AND person.archived_at IS NULL AND gp.archived_at IS NULL
      AND n.status = 'pending'
      AND (n.shared_activity_id IS NULL OR publication.family_group_id = ${actor.familyGroupId}::uuid)
      AND ${activeProfileSubjectConditionFor("n")}
  `);
  return Number(result[0]?.total ?? 0);
}
