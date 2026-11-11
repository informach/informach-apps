import "server-only";
import { activeWebParticipationCondition } from "@informach/auth/web-participation";
import { and, eq, or, sql } from "@informach/db";
import { agendaStudentProfiles, agendaTurmaMembers, agendaTurmas } from "@informach/db/schema";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition } from "@/features/family/scope";

/** Classroom ownership is explicit and does not follow the household's payer or roles. */
export function classroomReadCondition(actor: AgendaAuthority) {
  return and(
    activeWebParticipationCondition(actor.userId),
    or(
      eq(agendaTurmas.createdByUserId, actor.userId),
      sql`EXISTS (
    SELECT 1 FROM ${agendaTurmaMembers}
    JOIN ${agendaStudentProfiles} ON ${agendaStudentProfiles.id} = ${agendaTurmaMembers.studentProfileId}
    WHERE ${agendaTurmaMembers.turmaId} = ${agendaTurmas.id} AND ${agendaProfileCondition(actor)}
  )`,
    ),
  );
}
/** Reading a child's schedule never grants the invitation credential. */
export function classroomCode(actor: AgendaAuthority) {
  return sql<
    string | null
  >`CASE WHEN ${activeWebParticipationCondition(actor.userId)} AND (${agendaTurmas.createdByUserId} = ${actor.userId} OR EXISTS (
    SELECT 1 FROM ${agendaTurmaMembers}
    JOIN ${agendaStudentProfiles} ON ${agendaStudentProfiles.id} = ${agendaTurmaMembers.studentProfileId}
    WHERE ${agendaTurmaMembers.turmaId} = ${agendaTurmas.id}
      AND ${agendaTurmaMembers.enrolledByUserId} = ${actor.userId}
      AND ${and(agendaProfileCondition(actor), agendaProfileCondition(actor, "write"))}
  )) THEN ${agendaTurmas.code} ELSE NULL END`;
}
