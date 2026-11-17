import "server-only";
import { inArray, sql } from "@informach/db";
import { agendaStudentProfiles, agendaTurmas } from "@informach/db/schema";
import { type FamilyTransaction, requireFamilyCondition } from "@informach/family";

/** IDs only, before family locks. Includes old class dependencies retained by
 * tasks/kits after the child left the class. Author scope is for global closure. */
async function classesForProfiles(
  tx: FamilyTransaction,
  activationIds: string[],
  authorId?: string,
) {
  const native = tx
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .where(inArray(agendaStudentProfiles.familyProfileId, activationIds));
  return tx.execute<{ id: string }>(sql`with profiles as (${native}), dependencies as (
    select turma_id as id from agenda.turma_members where student_profile_id in (select id from profiles)
    union select active_turma_id from agenda.student_profiles where id in (select id from profiles)
    union select s.turma_id from agenda.tasks t join agenda.subjects s on s.id = t.subject_id where t.profile_id in (select id from profiles)
    union select a.turma_id from agenda.tasks t join agenda.activities a on a.id = t.shared_activity_id where t.profile_id in (select id from profiles)
    union select s.turma_id from agenda.subject_kits k join agenda.subjects s on s.id = k.subject_id where k.profile_id in (select id from profiles)
    union select id from agenda.turmas where created_by_user_id = ${authorId ?? null}
    union select turma_id from agenda.subjects where created_by_user_id = ${authorId ?? null}
    union select turma_id from agenda.activities where created_by_user_id = ${authorId ?? null}
  ) select id from dependencies where id is not null order by id`);
}

/** School → family → participation → native profile/content. The returned
 * verifier runs after canonical authorization, refusing a newly added class
 * instead of acquiring a class lock in the reverse order. No fixed UI page cap. */
export async function lockAgendaProfileSchoolContexts(
  tx: FamilyTransaction,
  activationIds: string[],
  authorId?: string,
) {
  const observed = await classesForProfiles(tx, activationIds, authorId);
  const ids = observed.map((row) => row.id);
  if (ids.length) {
    const locked = await tx
      .select({ id: agendaTurmas.id })
      .from(agendaTurmas)
      .where(inArray(agendaTurmas.id, ids))
      .orderBy(agendaTurmas.id)
      .for("update");
    requireFamilyCondition(
      locked.length === ids.length,
      "CONFLICT",
      "As turmas mudaram. Atualize a página.",
    );
  }
  return async () => {
    const current = await classesForProfiles(tx, activationIds, authorId);
    const locked = new Set(ids);
    requireFamilyCondition(
      current.every((row) => locked.has(row.id)),
      "CONFLICT",
      "As turmas mudaram. Atualize a página.",
    );
  };
}
