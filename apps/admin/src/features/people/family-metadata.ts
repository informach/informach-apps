import "server-only";
import { type SQLWrapper, sql } from "@informach/db";
import {
  boraFamilies,
  estrelaChildren,
  estrelaDeviceChildren,
  estrelaDevices,
  estrelaFamilies,
  familyAccessGrants,
  familyAppProfiles,
  familyGroups,
  familyMembers,
  missaoFamilies,
} from "@informach/db/schema";

import { profileAccessCondition } from "@informach/family/access";
import { delegatedProfileAccessCondition } from "@informach/family/delegation";

type FamilyApp = "bora-treinar" | "missao-saber" | "dia-de-estrela" | "agenda-da-turma";

/** Aggregate authority only: no identity or school content is selected. */
export function agendaParticipants() {
  return sql`select distinct ${familyMembers.userId} as user_id, ${familyMembers.groupId} as group_id, ${familyMembers.role} as role
    from ${familyMembers} join ${familyAppProfiles} on ${familyAppProfiles.groupId} = ${familyMembers.groupId}
    where ${profileAccessCondition(familyMembers.userId, "agenda-da-turma", familyAppProfiles.id, "read")}`;
}
/** Presence describes account configuration or current access, never a child's historical creator. */
export function familyPresence(app: FamilyApp) {
  if (app === "agenda-da-turma")
    return sql`select distinct user_id from (${agendaParticipants()}) participants`;
  if (app !== "dia-de-estrela") {
    const preferences = app === "bora-treinar" ? boraFamilies : missaoFamilies;
    return sql`select ${preferences.userId} as user_id from ${preferences}
      union select distinct ${familyAccessGrants.userId} as user_id from ${familyAccessGrants}
      join ${familyAppProfiles} on ${familyAppProfiles.id} = ${familyAccessGrants.profileId}
      where ${familyAppProfiles.app} = ${app} and ${familyAppProfiles.archivedAt} is null
        and ${memberOfHousehold(familyAccessGrants.userId, familyAppProfiles.groupId)}`;
  }
  return sql`select distinct ${familyMembers.userId} as user_id
    from ${familyMembers} join ${estrelaFamilies} on ${estrelaFamilies.familyGroupId} = ${familyMembers.groupId}
    join ${familyGroups} on ${familyGroups.id} = ${familyMembers.groupId}
    where ${familyMembers.revokedAt} is null and ${familyGroups.archivedAt} is null`;
}

export function memberOfHousehold(userId: string | SQLWrapper, groupId: SQLWrapper) {
  return sql`exists (select 1 from ${familyMembers} metadata_member
    join ${familyGroups} metadata_group on metadata_group.id = metadata_member.group_id
    where metadata_member.group_id = ${groupId} and metadata_member.user_id = ${userId}
      and metadata_member.revoked_at is null and metadata_group.archived_at is null)`;
}

/** Operational counts exclude a credential whose exact original authority was withdrawn. */
export function estrelaDeviceAuthority() {
  return sql`exists (select 1 from ${estrelaDeviceChildren} metadata_claim
    join ${estrelaChildren} metadata_child on metadata_child.id = metadata_claim.child_id
    where metadata_claim.device_id = ${estrelaDevices.id} and ${delegatedProfileAccessCondition(
      estrelaDevices.userId,
      "dia-de-estrela",
      {
        profileId: sql`metadata_child.family_profile_id`,
        groupId: estrelaDevices.familyGroupId,
        delegationKey: sql`metadata_claim.delegation_key`,
        readGrantId: sql`metadata_claim.read_grant_id`,
        writeGrantId: sql`metadata_claim.write_grant_id`,
      },
    )})`;
}
