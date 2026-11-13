import { activeWebParticipationCondition } from "@informach/auth/web-participation";
import { sql } from "@informach/db";
import { familyAppProfiles } from "@informach/db/schema";

/** Metadata predicates shared by app erasure and final identity detachment. */
export function closureProfileAuthority(actorId: string) {
  return {
    manages: sql<boolean>`exists (select 1 from family.access_grants ag join family.members m on m.group_id = ag.group_id and m.user_id = ag.user_id
      where ag.profile_id = ${familyAppProfiles.id} and ag.user_id = ${actorId} and ag.action = 'manage' and m.revoked_at is null)`,
    others: sql<boolean>`exists (select 1 from family.access_grants ag join family.members m on m.group_id = ag.group_id and m.user_id = ag.user_id
      where ag.profile_id = ${familyAppProfiles.id} and ag.user_id <> ${actorId} and m.revoked_at is null)`,
    otherManager: sql<boolean>`exists (select 1 from family.access_grants ag join family.members m on m.group_id = ag.group_id and m.user_id = ag.user_id join core.users u on u.id = ag.user_id
      where ag.profile_id = ${familyAppProfiles.id} and ag.user_id <> ${actorId} and ag.action = 'manage' and m.revoked_at is null
      and u.email_verified and (not u.banned or u.ban_expires_at <= statement_timestamp()) and ${activeWebParticipationCondition(sql`u.id`)})`,
  };
}
