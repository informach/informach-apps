import { createHash } from "node:crypto";
import {
  activeWebParticipationCondition,
  lockFrozenWebParticipation,
  lockWebParticipation,
} from "@informach/auth/web-participation";
import { getCollectionApps } from "@informach/config/collections";
import { and, asc, eq, gt, inArray, isNull, or, sql } from "@informach/db";
import {
  familyAccessGrants,
  familyAppProfiles,
  familyEvents,
  familyGroupPeople,
  familyGroups,
  familyInvitations,
  familyMembers,
  familyPeople,
  familyPersonManagers,
  familyPersonTransfers,
  users,
} from "@informach/db/schema";
import { exists, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { FamilyClosureScopeError, type FrozenFamilyActor } from "./closure";
import { closureProfileAuthority } from "./closure-authority";
import type { FamilyTransaction } from "./types";

const PAGE_SIZE = 250;
async function pages<T extends { id: string }>(read: (after?: string) => Promise<T[]>) {
  const rows: T[] = [];
  const deadline = performance.now() + 45_000;
  let after: string | undefined;
  while (true) {
    if (performance.now() > deadline) throw new FamilyClosureScopeError();
    const page = await read(after);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    after = page.at(-1)?.id;
    if (!after) throw new FamilyClosureScopeError();
  }
}

const ownPerson = (actorId: string) =>
  or(
    eq(familyPeople.userId, actorId),
    sql`exists (select 1 from ${familyPersonManagers} pm where pm.person_id = ${familyPeople.id} and pm.user_id = ${actorId})`,
  );

/** IDs only until all affected contexts are locked. Custody survives membership
 * revocation, so former/archived contexts must participate in the lock set. */
async function roots(tx: FamilyTransaction, actorId: string) {
  const people = await pages((after) =>
    tx
      .select({ id: familyPeople.id })
      .from(familyPeople)
      .where(and(ownPerson(actorId), after ? gt(familyPeople.id, after) : undefined))
      .orderBy(asc(familyPeople.id))
      .limit(PAGE_SIZE),
  );
  const groups = await pages((after) =>
    tx
      .select({ id: familyGroups.id })
      .from(familyGroups)
      .where(
        and(
          sql`(
        exists (select 1 from ${familyMembers} m where m.group_id = ${familyGroups.id} and m.user_id = ${actorId})
        or exists (select 1 from ${familyGroupPeople} gp join ${familyPeople} on ${familyPeople.id} = gp.person_id where gp.group_id = ${familyGroups.id} and ${ownPerson(actorId)})
        or exists (select 1 from ${familyInvitations} i where i.group_id = ${familyGroups.id} and i.invited_by = ${actorId})
        or exists (select 1 from ${familyPersonTransfers} t where t.group_id = ${familyGroups.id} and (t.source_user_id = ${actorId} or t.target_user_id = ${actorId}))
      )`,
          after ? gt(familyGroups.id, after) : undefined,
        ),
      )
      .orderBy(asc(familyGroups.id))
      .limit(PAGE_SIZE),
  );
  return { people: people.map((p) => p.id), groups: groups.map((g) => g.id) };
}

/** Final family step only. It neither cancels billing nor erases app content.
 * Preparation anticipates the app-owned removals so their completion does not
 * invalidate consent to the same common identities and memberships. */
export async function lockFamilyDetachmentScope(tx: FamilyTransaction, actor: FrozenFamilyActor) {
  await tx.execute(sql`set local statement_timeout = '10s'`);
  const observed = await roots(tx, actor.userId);
  for (let start = 0; start < observed.groups.length; start += PAGE_SIZE)
    await tx
      .select({ id: familyGroups.id })
      .from(familyGroups)
      .where(inArray(familyGroups.id, observed.groups.slice(start, start + PAGE_SIZE)))
      .orderBy(familyGroups.id)
      .for("update");

  const adults = await pages((after) =>
    tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          or(
            eq(users.id, actor.userId),
            observed.groups.length
              ? sql`exists (select 1 from ${familyMembers} m where m.user_id = ${users.id} and m.revoked_at is null and m.group_id in (select id from ${familyGroups} where ${inArray(familyGroups.id, observed.groups)}))`
              : undefined,
            sql`exists (select 1 from ${familyPersonManagers} pm join ${familyPeople} on ${familyPeople.id} = pm.person_id where pm.user_id = ${users.id} and ${ownPerson(actor.userId)})`,
          ),
          after ? gt(users.id, after) : undefined,
        ),
      )
      .orderBy(users.id)
      .limit(PAGE_SIZE),
  );
  for (const adult of adults) await lockWebParticipation(tx, adult.id);
  await lockFrozenWebParticipation(tx, actor);
  for (let start = 0; start < observed.people.length; start += PAGE_SIZE)
    await tx
      .select({ id: familyPeople.id })
      .from(familyPeople)
      .where(inArray(familyPeople.id, observed.people.slice(start, start + PAGE_SIZE)))
      .orderBy(familyPeople.id)
      .for("update");
  const current = await roots(tx, actor.userId);
  if (JSON.stringify(current) !== JSON.stringify(observed)) throw new FamilyClosureScopeError();

  const authority = closureProfileAuthority(actor.userId);
  const catalog = new Set(getCollectionApps("compasso").map((app) => app.slug));
  const profiles = await pages((after) =>
    tx
      .select({
        id: familyAppProfiles.id,
        groupId: familyAppProfiles.groupId,
        personId: familyAppProfiles.personId,
        personUserId: familyPeople.userId,
        app: familyAppProfiles.app,
        ...authority,
      })
      .from(familyAppProfiles)
      .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
      .where(
        and(
          or(
            ownPerson(actor.userId),
            sql`exists (select 1 from ${familyMembers} m where m.group_id = ${familyAppProfiles.groupId} and m.user_id = ${actor.userId})`,
          ),
          after ? gt(familyAppProfiles.id, after) : undefined,
        ),
      )
      .orderBy(familyAppProfiles.id)
      .limit(PAGE_SIZE),
  );
  const removedByApps = profiles.filter(
    (p) =>
      catalog.has(p.app) &&
      p.manages &&
      !p.others &&
      (p.personUserId === null || p.personUserId === actor.userId),
  );
  const removableIds = new Set(removedByApps.map((p) => p.id));
  const retainedProfiles = profiles.filter((p) => !removableIds.has(p.id));
  const retainedPersonIds = new Set(retainedProfiles.map((p) => p.personId));
  const retainedGroupIds = new Set(retainedProfiles.map((p) => p.groupId));
  const people = await pages((after) =>
    tx
      .select({
        id: familyPeople.id,
        version: familyPeople.version,
        userId: familyPeople.userId,
        // A query node preserves correlated column qualification in Drizzle's
        // single-table projection; a flat SQL expression would strip it.
        otherCustodian: exists(
          tx
            .select({ present: sql`1` })
            .from(familyPersonManagers)
            .where(
              and(
                eq(familyPersonManagers.personId, familyPeople.id),
                ne(familyPersonManagers.userId, actor.userId),
              ),
            ),
        ),
        availableCustodian: exists(
          tx
            .select({ present: sql`1` })
            .from(familyPersonManagers)
            .innerJoin(users, eq(users.id, familyPersonManagers.userId))
            .where(
              and(
                eq(familyPersonManagers.personId, familyPeople.id),
                ne(users.id, actor.userId),
                eq(users.emailVerified, true),
                or(eq(users.banned, false), sql`${users.banExpiresAt} <= statement_timestamp()`),
                activeWebParticipationCondition(users.id),
                sql`exists (select 1 from ${familyGroupPeople} gp join ${familyMembers} m on m.group_id = gp.group_id join ${familyGroups} g on g.id = gp.group_id
              where gp.person_id = ${familyPersonManagers.personId} and m.user_id = ${familyPersonManagers.userId} and m.revoked_at is null and g.archived_at is null)`,
              ),
            ),
        ),
      })
      .from(familyPeople)
      .where(and(ownPerson(actor.userId), after ? gt(familyPeople.id, after) : undefined))
      .orderBy(familyPeople.id)
      .limit(PAGE_SIZE),
  );
  const removePeople = people.filter(
    (p) => p.userId === null && !p.otherCustodian && !retainedPersonIds.has(p.id),
  );
  const removeIds = new Set(removePeople.map((p) => p.id));
  const preservePeople = people.filter((p) => !removeIds.has(p.id));
  const otherMember = alias(familyMembers, "detachment_other_member");
  const memberships = await pages((after) =>
    tx
      .select({
        id: familyMembers.groupId,
        role: familyMembers.role,
        revoked: sql<boolean>`${familyMembers.revokedAt} is not null`,
        others: exists(
          tx
            .select({ present: sql`1` })
            .from(otherMember)
            .where(
              and(
                eq(otherMember.groupId, familyMembers.groupId),
                ne(otherMember.userId, actor.userId),
                isNull(otherMember.revokedAt),
              ),
            ),
        ),
        otherAdministrator: exists(
          tx
            .select({ present: sql`1` })
            .from(otherMember)
            .innerJoin(users, eq(users.id, otherMember.userId))
            .where(
              and(
                eq(otherMember.groupId, familyMembers.groupId),
                ne(otherMember.userId, actor.userId),
                eq(otherMember.role, "administrator"),
                isNull(otherMember.revokedAt),
                eq(users.emailVerified, true),
                or(eq(users.banned, false), sql`${users.banExpiresAt} <= statement_timestamp()`),
                activeWebParticipationCondition(users.id),
              ),
            ),
        ),
      })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.userId, actor.userId),
          after ? gt(familyMembers.groupId, after) : undefined,
        ),
      )
      .orderBy(familyMembers.groupId)
      .limit(PAGE_SIZE),
  );
  const archiveGroups = memberships
    .filter(
      (m) => !m.revoked && m.role === "administrator" && !m.others && !retainedGroupIds.has(m.id),
    )
    .map((m) => m.id);
  const blocked =
    preservePeople.some((p) => p.userId === null && !p.availableCustodian) ||
    memberships.some(
      (m) =>
        !m.revoked &&
        m.role === "administrator" &&
        !archiveGroups.includes(m.id) &&
        !m.otherAdministrator,
    ) ||
    retainedProfiles.some((p) => p.manages && !p.otherManager);
  // No private names, mutable wallet balances, or app-owned exclusive profile IDs.
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        "family-detachment-v1",
        actor.userId,
        actor.operationId,
        actor.expectedRevision,
        memberships,
        people,
        removePeople.map((p) => p.id),
        archiveGroups,
        retainedProfiles.map((p) => ({ id: p.id, groupId: p.groupId, personId: p.personId })),
        blocked,
      ]),
    )
    .digest("hex");
  return {
    fingerprint,
    blocked,
    removePeople,
    preservePeople,
    memberships,
    archiveGroups,
    removedByApps: removedByApps.map((p) => p.id),
    retainedProfiles,
  };
}

/** Called inside the coordinator's final family receipt transaction, only after
 * every app has committed. Restrictive FKs remain the last erasure barrier. */
export async function detachClosedFamilyActor(
  tx: FamilyTransaction,
  actor: FrozenFamilyActor,
  expectedFingerprint: string,
) {
  const scope = await lockFamilyDetachmentScope(tx, actor);
  if (scope.blocked || scope.fingerprint !== expectedFingerprint || scope.removedByApps.length)
    throw new FamilyClosureScopeError();
  await tx.delete(familyAccessGrants).where(eq(familyAccessGrants.userId, actor.userId));
  await tx
    .update(familyMembers)
    .set({ revokedAt: sql`clock_timestamp()` })
    .where(and(eq(familyMembers.userId, actor.userId), isNull(familyMembers.revokedAt)));
  await revokePendingFamilyCapabilities(tx, actor.userId);
  await tx.delete(familyPersonManagers).where(eq(familyPersonManagers.userId, actor.userId));
  for (let start = 0; start < scope.removePeople.length; start += PAGE_SIZE) {
    const selected = scope.removePeople.slice(start, start + PAGE_SIZE).map((p) => p.id);
    await tx.delete(familyGroupPeople).where(inArray(familyGroupPeople.personId, selected));
    await tx
      .delete(familyPeople)
      .where(and(inArray(familyPeople.id, selected), isNull(familyPeople.userId)));
    await tx.insert(familyEvents).values(
      selected.map((personId) => ({
        actorId: actor.userId,
        personId,
        event: "person.removed_on_closure",
      })),
    );
  }
  // A shared historical profile keeps its person visible to its remaining grants.
  // The global adult identity and independent product login are never deleted.
  for (const person of scope.preservePeople.filter((p) => p.userId === actor.userId))
    await tx
      .update(familyGroupPeople)
      .set({ archivedAt: sql`coalesce(${familyGroupPeople.archivedAt}, clock_timestamp())` })
      .where(
        and(
          eq(familyGroupPeople.personId, person.id),
          sql`not exists (select 1 from ${familyAppProfiles} fp where fp.group_id = ${familyGroupPeople.groupId} and fp.person_id = ${familyGroupPeople.personId})`,
        ),
      );
  if (scope.archiveGroups.length)
    await tx
      .update(familyGroups)
      .set({ archivedAt: sql`coalesce(${familyGroups.archivedAt}, clock_timestamp())` })
      .where(inArray(familyGroups.id, scope.archiveGroups));
  for (let start = 0; start < scope.memberships.length; start += PAGE_SIZE)
    await tx.insert(familyEvents).values(
      scope.memberships.slice(start, start + PAGE_SIZE).map((member) => ({
        actorId: actor.userId,
        groupId: member.id,
        event: "member.detached_on_closure",
      })),
    );
}

async function revokePendingFamilyCapabilities(tx: FamilyTransaction, actorId: string) {
  await tx
    .update(familyInvitations)
    .set({ revokedAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(familyInvitations.invitedBy, actorId),
        isNull(familyInvitations.acceptedAt),
        isNull(familyInvitations.revokedAt),
      ),
    );
  await tx
    .update(familyPersonTransfers)
    .set({ outcome: "revoked", resolvedAt: sql`clock_timestamp()` })
    .where(
      and(
        or(
          eq(familyPersonTransfers.sourceUserId, actorId),
          eq(familyPersonTransfers.targetUserId, actorId),
        ),
        isNull(familyPersonTransfers.resolvedAt),
      ),
    );
}

/** Resume retains identities, custody, membership and content. Pending capabilities
 * from the old participation need a new explicit invitation/transfer afterwards. */
export async function prepareFamilyResumption(tx: FamilyTransaction, actor: FrozenFamilyActor) {
  await lockFamilyDetachmentScope(tx, actor);
  await revokePendingFamilyCapabilities(tx, actor.userId);
}
