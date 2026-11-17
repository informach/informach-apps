import { createHash } from "node:crypto";
import { lockFrozenWebParticipation } from "@informach/auth/web-participation";
import { and, eq, inArray, isNull, ne, sql } from "@informach/db";
import {
  familyAppProfiles,
  familyEvents,
  familyGroups,
  familyMembers,
  familyPeople,
} from "@informach/db/schema";
import { exists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { closureProfileAuthority } from "./closure-authority";
import type { FamilyTransaction } from "./types";
import { app as appSchema } from "./validation";

export type FrozenFamilyActor = Parameters<typeof lockFrozenWebParticipation>[1];
type ClosureProfile = { id: string; groupId: string; personId: string; delegationKey: string };
export class FamilyClosureScopeError extends Error {
  readonly code = "changed_authority";
  constructor() {
    super("Family closure authority changed");
    this.name = "FamilyClosureScopeError";
  }
}

/** Closure is not a manager's ordinary explicit delete action: any other
 * participant's grant keeps that history, including a temporarily suspended adult.
 * Payment and the historical creator user_id never confer content ownership. */
export async function lockAppClosureScope(
  tx: FamilyTransaction,
  actor: FrozenFamilyActor,
  app: string,
  lockDependencies?: (metadata: {
    profileIds: string[];
    groupIds: string[];
  }) => Promise<() => Promise<void>>,
) {
  appSchema.parse(app);
  const selected = () =>
    tx
      .select({
        id: familyAppProfiles.id,
        groupId: familyAppProfiles.groupId,
        personId: familyAppProfiles.personId,
        delegationKey: familyAppProfiles.delegationKey,
        personUserId: familyPeople.userId,
        ...closureProfileAuthority(actor.userId),
      })
      .from(familyAppProfiles)
      .innerJoin(familyPeople, eq(familyPeople.id, familyAppProfiles.personId))
      .where(
        and(
          eq(familyAppProfiles.app, app),
          sql`(${familyPeople.userId} = ${actor.userId}
            or exists (select 1 from family.access_grants ag where ag.profile_id = ${familyAppProfiles.id} and ag.user_id = ${actor.userId})
            or exists (select 1 from family.members m where m.group_id = ${familyAppProfiles.groupId} and m.user_id = ${actor.userId} and m.revoked_at is null))`,
        ),
      )
      .orderBy(familyAppProfiles.id);
  // Metadata only before locks. Archived histories are included, with exactly the
  // same context locks used by grants, reassociation, archive and explicit removal.
  const observed = await selected();
  const otherMember = alias(familyMembers, "closure_other_member");
  const memberships = () =>
    tx
      .select({
        id: familyMembers.groupId,
        role: familyMembers.role,
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
      })
      .from(familyMembers)
      .where(and(eq(familyMembers.userId, actor.userId), isNull(familyMembers.revokedAt)))
      .orderBy(familyMembers.groupId);
  const observedMemberships = await memberships();
  const groupIds = [
    ...new Set([
      ...observed.map((profile) => profile.groupId),
      ...observedMemberships.map((group) => group.id),
    ]),
  ].sort();
  // Some apps have shared dependencies preceding a family (school classrooms).
  // This metadata is not authority to read/erase content. The app locks those
  // dependencies first and supplies a recheck after our canonical locks.
  const verifyDependencies = await lockDependencies?.({
    profileIds: observed.map((profile) => profile.id),
    groupIds,
  });
  if (groupIds.length)
    await tx
      .select({ id: familyGroups.id })
      .from(familyGroups)
      .where(inArray(familyGroups.id, groupIds))
      .orderBy(familyGroups.id)
      .for("update");
  await lockFrozenWebParticipation(tx, actor);
  const current = await selected();
  const currentMemberships = await memberships();
  if (
    current.some((profile) => !groupIds.includes(profile.groupId)) ||
    currentMemberships.some((group) => !groupIds.includes(group.id))
  )
    throw new FamilyClosureScopeError();
  await verifyDependencies?.();
  const remove: ClosureProfile[] = [],
    preserve: ClosureProfile[] = [];
  let blocked = false;
  for (const profile of current) {
    const shared =
      profile.others || (profile.personUserId !== null && profile.personUserId !== actor.userId);
    const erase = profile.manages && !shared;
    const scope = {
      id: profile.id,
      groupId: profile.groupId,
      personId: profile.personId,
      delegationKey: profile.delegationKey,
    };
    if (erase) remove.push(scope);
    else preserve.push(scope);
    // A reader need not arrange custody they never held. A departing manager
    // cannot strand shared history behind only readers or unavailable adults.
    if (profile.manages && shared && !profile.otherManager) blocked = true;
  }
  // Group-owned settings/history can disappear only when this administrator is
  // the sole member and no preserved history depends on them. Metadata from an
  // ungranted profile is used only to preserve it, never to expose its content.
  const groups = currentMemberships.map((group) => ({
    id: group.id,
    exclusive:
      group.role === "administrator" &&
      !group.others &&
      !preserve.some((profile) => profile.groupId === group.id),
  }));
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        "family-app-closure-v1",
        app,
        actor.userId,
        actor.operationId,
        actor.expectedRevision,
        remove,
        preserve,
        blocked,
        groups,
      ]),
    )
    .digest("hex");
  return { remove, preserve, groups, blocked, fingerprint };
}

/** App adapters call this after native erasure, under the same scope locks.
 * Restrictive native FKs refuse an incomplete cleanup instead of orphaning it. */
export async function removeClosureProfileLinks(
  tx: FamilyTransaction,
  actor: FrozenFamilyActor,
  app: string,
  expectedFingerprint: string,
) {
  const scope = await lockAppClosureScope(tx, actor, app);
  if (scope.blocked || scope.fingerprint !== expectedFingerprint)
    throw new FamilyClosureScopeError();
  if (scope.remove.length) {
    await tx.delete(familyAppProfiles).where(
      and(
        eq(familyAppProfiles.app, app),
        inArray(
          familyAppProfiles.id,
          scope.remove.map((profile) => profile.id),
        ),
      ),
    );
    await tx.insert(familyEvents).values(
      scope.remove.map((profile) => ({
        event: "profile.removed",
        actorId: actor.userId,
        groupId: profile.groupId,
        personId: profile.personId,
        targetId: profile.id,
      })),
    );
  }
}
