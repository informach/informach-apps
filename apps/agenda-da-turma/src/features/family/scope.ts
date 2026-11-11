import "server-only";
import { and, inArray, sql } from "@informach/db";
import { agendaStudentProfiles, familyAppProfiles, familyPeople } from "@informach/db/schema";
import {
  type FamilyAction,
  type FamilyTransaction,
  requireFamilyCondition,
} from "@informach/family";
import { profileAccessCondition } from "@informach/family/access";
import { lockProfilesAccess } from "@informach/family/context";
import type { AgendaAuthority } from "./authority";

/** The name is identity, never a second editable copy of the shared person. */
export const studentName = sql<string>`(
  SELECT p.display_name FROM ${familyAppProfiles} fp
  JOIN ${familyPeople} p ON p.id = fp.person_id
  WHERE fp.id = ${agendaStudentProfiles.familyProfileId} AND fp.app = 'agenda-da-turma'
)`;

export const studentGroupId = sql<string>`(
  SELECT fp.group_id FROM ${familyAppProfiles} fp
  WHERE fp.id = ${agendaStudentProfiles.familyProfileId} AND fp.app = 'agenda-da-turma'
)`;

export function agendaProfileCondition(actor: AgendaAuthority, action: FamilyAction = "read") {
  return and(
    profileAccessCondition(
      actor.userId,
      "agenda-da-turma",
      agendaStudentProfiles.familyProfileId,
      action,
    ),
    sql`EXISTS (SELECT 1 FROM ${familyAppProfiles} fp
      WHERE fp.id = ${agendaStudentProfiles.familyProfileId}
      AND fp.app = 'agenda-da-turma' AND fp.group_id = ${actor.familyGroupId})`,
  );
}

/** Group → native profile order is shared by mutation, revocation and reassociation. */
export async function lockAgendaProfiles(
  tx: FamilyTransaction,
  actor: AgendaAuthority,
  profileIds: readonly string[],
  action: FamilyAction = "write",
) {
  const ids = [...new Set(profileIds)].sort();
  requireFamilyCondition(ids.length > 0 && ids.length <= 100, "INVALID_INPUT");
  const observed = await tx
    .select({ id: agendaStudentProfiles.id, activationId: agendaStudentProfiles.familyProfileId })
    .from(agendaStudentProfiles)
    .where(and(inArray(agendaStudentProfiles.id, ids), agendaProfileCondition(actor, action)));
  const activationIds = observed.flatMap((p) => (p.activationId ? [p.activationId] : []));
  requireFamilyCondition(observed.length === ids.length && activationIds.length === ids.length);
  const scopes = await lockProfilesAccess(
    tx,
    actor.userId,
    "agenda-da-turma",
    activationIds,
    action,
  );
  requireFamilyCondition(scopes.every((scope) => scope.groupId === actor.familyGroupId));
  // Writing does not implicitly confer the right to inspect a child's content.
  if (action !== "read")
    await lockProfilesAccess(tx, actor.userId, "agenda-da-turma", activationIds, "read");
  const current = await tx
    .select()
    .from(agendaStudentProfiles)
    .where(and(inArray(agendaStudentProfiles.id, ids), agendaProfileCondition(actor, action)))
    .orderBy(agendaStudentProfiles.id)
    .for("update");
  requireFamilyCondition(
    current.length === ids.length &&
      current.every((p) =>
        observed.some((o) => o.id === p.id && o.activationId === p.familyProfileId),
      ),
  );
  return current;
}
