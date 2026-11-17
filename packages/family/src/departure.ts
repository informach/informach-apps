import { activeWebParticipationCondition } from "@informach/auth/web-participation";
import { and, type Database, desc, eq, isNull, lt, or, sql } from "@informach/db";
import {
  familyAppProfiles,
  familyGroups,
  familyMembers,
  familyPeople,
  familyPersonManagers,
} from "@informach/db/schema";
import { requireActor } from "./internal";
import type { FamilyReader } from "./types";
import { app as appSchema } from "./validation";

const PAGE_SIZE = 50;
const activeActor = (actorId: string) =>
  sql`exists (select 1 from core.users u where u.id = ${actorId} and u.email_verified and (not u.banned or u.ban_expires_at <= statement_timestamp()))`;

const managesProfile = (actorId: string) =>
  sql`exists (select 1 from family.access_grants ag join family.members m on m.group_id = ag.group_id and m.user_id = ag.user_id where ag.profile_id = ${familyAppProfiles.id} and ag.group_id = ${familyAppProfiles.groupId} and ag.user_id = ${actorId} and ag.action = 'manage' and m.revoked_at is null)`;

const profileResponsibility = (actorId: string) =>
  and(activeActor(actorId), or(eq(familyPeople.userId, actorId), managesProfile(actorId)));

/** Counts remain advisory and include archived histories. Profile ownership is
 * personal identity or explicit management, never subscription payment. */
export async function assessAppProfileResponsibilities(
  reader: FamilyReader,
  actorId: string,
  app: string,
) {
  appSchema.parse(app);
  await requireActor(reader, actorId, new Date());
  const [summary] = await reader
    .select({
      hasPersonalData:
        sql<boolean>`coalesce(bool_or(${familyPeople.userId} = ${actorId}), false)`.mapWith(
          Boolean,
        ),
      managedProfiles: sql<number>`count(*)::integer`.mapWith(Number),
      sharedProfiles: sql<number>`count(*) filter (where exists (
        select 1 from family.access_grants ag
        join family.members m on m.group_id = ag.group_id and m.user_id = ag.user_id
        join core.users u on u.id = ag.user_id
        where ag.profile_id = ${familyAppProfiles.id} and ag.user_id <> ${actorId}
          and m.revoked_at is null and u.email_verified
          and (not u.banned or u.ban_expires_at <= statement_timestamp())
      ))::integer`.mapWith(Number),
    })
    .from(familyAppProfiles)
    .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
    .where(and(eq(familyAppProfiles.app, app), profileResponsibility(actorId)));
  if (!summary) throw new Error("Profile responsibility assessment unavailable");
  return summary;
}

/** Advisory, read-only inventory for a closure preview. These records are not
 * permission to delete: the eventual freeze/commit must revalidate all facts.
 * Common identity custody is global; app content authority remains contextual. */
export async function* inspectFamilyDeparture(
  db: Database,
  actorId: string,
  authorize: () => Promise<void>,
) {
  async function check() {
    await authorize();
    await requireActor(db, actorId, new Date());
  }
  let before: string | undefined;
  while (true) {
    await check();
    const rows = await db
      .select({
        id: familyGroups.id,
        name: familyGroups.name,
        archivedAt: familyGroups.archivedAt,
        role: familyMembers.role,
        otherMembers:
          sql<number>`(select count(*)::integer from family.members m where m.group_id = ${familyGroups.id} and m.user_id <> ${actorId} and m.revoked_at is null)`.mapWith(
            Number,
          ),
        otherAdministrators:
          sql<number>`(select count(*)::integer from family.members m join core.users u on u.id = m.user_id where m.group_id = ${familyGroups.id} and m.user_id <> ${actorId} and m.revoked_at is null and m.role = 'administrator' and ${activeWebParticipationCondition(sql`u.id`)} and u.email_verified and (not u.banned or u.ban_expires_at <= statement_timestamp()))`.mapWith(
            Number,
          ),
      })
      .from(familyGroups)
      .innerJoin(familyMembers, eq(familyMembers.groupId, familyGroups.id))
      .where(
        and(
          eq(familyMembers.userId, actorId),
          isNull(familyMembers.revokedAt),
          activeActor(actorId),
          before ? lt(familyGroups.id, before) : undefined,
        ),
      )
      .orderBy(desc(familyGroups.id))
      .limit(PAGE_SIZE);
    if (!rows.length) break;
    await check();
    yield { kind: "family.memberships" as const, records: rows };
    if (rows.length < PAGE_SIZE) break;
    before = rows[rows.length - 1]?.id;
  }

  // Even an archived person or a custodian removed from a group remains a
  // responsibility to resolve. Never infer that this identity may be erased.
  before = undefined;
  while (true) {
    await check();
    const rows = await db
      .select({
        id: familyPeople.id,
        displayName: familyPeople.displayName,
        version: familyPeople.version,
        archivedAt: familyPeople.archivedAt,
        linkedGroups:
          sql<number>`(select count(*)::integer from family.group_people gp where gp.person_id = ${familyPeople.id})`.mapWith(
            Number,
          ),
        accessibleGroups:
          sql<number>`(select count(*)::integer from family.group_people gp join family.groups g on g.id = gp.group_id join family.members m on m.group_id = gp.group_id where gp.person_id = ${familyPeople.id} and g.archived_at is null and m.user_id = ${actorId} and m.revoked_at is null)`.mapWith(
            Number,
          ),
        otherCustodians:
          sql<number>`(select count(*)::integer from family.person_managers pm join core.users u on u.id = pm.user_id where pm.person_id = ${familyPeople.id} and pm.user_id <> ${actorId} and ${activeWebParticipationCondition(sql`u.id`)} and u.email_verified and (not u.banned or u.ban_expires_at <= statement_timestamp()) and exists (select 1 from family.group_people gp join family.members m on m.group_id = gp.group_id join family.groups g on g.id = gp.group_id where gp.person_id = pm.person_id and m.user_id = pm.user_id and m.revoked_at is null and g.archived_at is null))`.mapWith(
            Number,
          ),
      })
      .from(familyPeople)
      .innerJoin(familyPersonManagers, eq(familyPersonManagers.personId, familyPeople.id))
      .where(
        and(
          eq(familyPersonManagers.userId, actorId),
          isNull(familyPeople.userId),
          activeActor(actorId),
          before ? lt(familyPeople.id, before) : undefined,
        ),
      )
      .orderBy(desc(familyPeople.id))
      .limit(PAGE_SIZE);
    if (!rows.length) break;
    await check();
    yield { kind: "family.identity_responsibilities" as const, records: rows };
    if (rows.length < PAGE_SIZE) break;
    before = rows[rows.length - 1]?.id;
  }

  before = undefined;
  while (true) {
    await check();
    const rows = await db
      .select({
        id: familyAppProfiles.id,
        app: familyAppProfiles.app,
        groupId: familyAppProfiles.groupId,
        personId: familyAppProfiles.personId,
        archivedAt: familyAppProfiles.archivedAt,
        ownAccount: sql<boolean>`coalesce(${familyPeople.userId} = ${actorId}, false)`.mapWith(
          Boolean,
        ),
        otherManagers:
          sql<number>`(select count(*)::integer from family.access_grants ag join family.members m on m.group_id = ag.group_id and m.user_id = ag.user_id join core.users u on u.id = ag.user_id where ag.profile_id = ${familyAppProfiles.id} and ag.action = 'manage' and ag.user_id <> ${actorId} and m.revoked_at is null and ${activeWebParticipationCondition(sql`u.id`)} and u.email_verified and (not u.banned or u.ban_expires_at <= statement_timestamp()))`.mapWith(
            Number,
          ),
      })
      .from(familyAppProfiles)
      .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
      .where(
        and(profileResponsibility(actorId), before ? lt(familyAppProfiles.id, before) : undefined),
      )
      .orderBy(desc(familyAppProfiles.id))
      .limit(PAGE_SIZE);
    if (!rows.length) break;
    await check();
    yield { kind: "family.profile_responsibilities" as const, records: rows };
    if (rows.length < PAGE_SIZE) break;
    before = rows[rows.length - 1]?.id;
  }
  await check();
}
