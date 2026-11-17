import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import { COMPASSO_POLICY } from "@informach/config/collections";
import {
  familyAccessGrants,
  familyAppProfiles,
  familyGroupPeople,
  familyGroups,
  familyMembers,
  familyPeople,
  familyPersonTransfers,
  users,
} from "@informach/db/schema";
import { and, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireFamilyCondition } from "./errors";
import {
  activeUserCondition,
  audit,
  ensureAdultPerson,
  lockGroup,
  requireActor,
  requireMember,
} from "./internal";
import type { FamilyServiceConfig } from "./types";
import { id } from "./validation";

export async function createGroup(deps: FamilyServiceConfig, actorId: string, name: string) {
  const label = z.string().trim().min(1).max(80).parse(name);
  const now = deps.now?.() ?? new Date();
  return deps.db.transaction(async (tx) => {
    await lockActiveWebParticipation(tx, actorId);
    await requireActor(tx, actorId, now);
    const [group] = await tx.insert(familyGroups).values({ name: label }).returning();
    requireFamilyCondition(group);
    await tx
      .insert(familyMembers)
      .values({ groupId: group.id, userId: actorId, role: "administrator" });
    const personId = await ensureAdultPerson(tx, actorId);
    await tx.insert(familyGroupPeople).values({ groupId: group.id, personId });
    await audit(tx, { event: "group.created", groupId: group.id, actorId });
    return group;
  });
}

function visibleGroups(deps: FamilyServiceConfig, actorId: string, before?: string) {
  return deps.db
    .select({ id: familyGroups.id, name: familyGroups.name, role: familyMembers.role })
    .from(familyGroups)
    .innerJoin(familyMembers, eq(familyMembers.groupId, familyGroups.id))
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .where(
      and(
        eq(familyMembers.userId, actorId),
        isNull(familyMembers.revokedAt),
        isNull(familyGroups.archivedAt),
        activeUserCondition(deps.now?.() ?? new Date()),
        before ? lt(familyGroups.id, before) : undefined,
      ),
    );
}

export async function listGroups(deps: FamilyServiceConfig, actorId: string) {
  return visibleGroups(deps, actorId).orderBy(familyGroups.createdAt, familyGroups.id);
}

/** Keyset traversal for exports; visibility is identical to the account view. */
export async function listGroupsPage(deps: FamilyServiceConfig, actorId: string, before?: string) {
  if (before) id.parse(before);
  const rows = await visibleGroups(deps, actorId, before).orderBy(desc(familyGroups.id)).limit(21);
  return {
    groups: rows.slice(0, 20),
    nextCursor: rows.length > 20 ? (rows[19]?.id ?? null) : null,
  };
}

export async function revokeMember(
  deps: FamilyServiceConfig,
  actorId: string,
  groupId: string,
  userId: string,
) {
  id.parse(groupId);
  const now = deps.now?.() ?? new Date();
  await deps.db.transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await lockActiveWebParticipation(tx, actorId);
    await requireMember(tx, actorId, groupId, now, "administrator");
    const [target] = await tx
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.groupId, groupId),
          eq(familyMembers.userId, userId),
          isNull(familyMembers.revokedAt),
        ),
      );
    requireFamilyCondition(target);
    if (target.role === "administrator") {
      const remaining = await tx
        .select({ userId: familyMembers.userId })
        .from(familyMembers)
        .innerJoin(users, eq(users.id, familyMembers.userId))
        .where(
          and(
            eq(familyMembers.groupId, groupId),
            eq(familyMembers.role, "administrator"),
            isNull(familyMembers.revokedAt),
            ne(familyMembers.userId, userId),
            activeUserCondition(now),
          ),
        );
      requireFamilyCondition(
        remaining.length > 0,
        "LAST_ADMINISTRATOR",
        "Transfira a administração antes de sair da família.",
      );
      for (const member of remaining.sort((a, b) => a.userId.localeCompare(b.userId)))
        await lockActiveWebParticipation(tx, member.userId);
    }
    await tx
      .update(familyMembers)
      .set({ revokedAt: now })
      .where(and(eq(familyMembers.groupId, groupId), eq(familyMembers.userId, userId)));
    await tx
      .update(familyPersonTransfers)
      .set({ outcome: "revoked", resolvedAt: now })
      .where(
        and(
          eq(familyPersonTransfers.groupId, groupId),
          isNull(familyPersonTransfers.resolvedAt),
          or(
            eq(familyPersonTransfers.sourceUserId, userId),
            eq(familyPersonTransfers.targetUserId, userId),
          ),
        ),
      );
    await tx
      .delete(familyAccessGrants)
      .where(and(eq(familyAccessGrants.groupId, groupId), eq(familyAccessGrants.userId, userId)));
    const [person] = await tx
      .select({ id: familyPeople.id })
      .from(familyPeople)
      .where(eq(familyPeople.userId, userId));
    if (person) {
      await tx
        .update(familyGroupPeople)
        .set({ archivedAt: now })
        .where(
          and(eq(familyGroupPeople.groupId, groupId), eq(familyGroupPeople.personId, person.id)),
        );
      await tx
        .update(familyAppProfiles)
        .set({ archivedAt: now, delegationKey: sql`gen_random_uuid()` })
        .where(
          and(eq(familyAppProfiles.groupId, groupId), eq(familyAppProfiles.personId, person.id)),
        );
    }
    await audit(tx, { event: "member.revoked", groupId, actorId, targetId: userId });
  });
}

/** Administration changes neither custody nor access to application content. */
export async function transferAdministration(
  deps: FamilyServiceConfig,
  actorId: string,
  groupId: string,
  userId: string,
) {
  id.parse(groupId);
  requireFamilyCondition(actorId !== userId, "INVALID_INPUT");
  const now = deps.now?.() ?? new Date();
  await deps.db.transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await lockActiveWebParticipation(tx, actorId);
    await requireMember(tx, actorId, groupId, now, "administrator");
    await requireMember(tx, userId, groupId, now);
    await lockActiveWebParticipation(tx, userId);
    await tx
      .update(familyMembers)
      .set({ role: "administrator" })
      .where(and(eq(familyMembers.groupId, groupId), eq(familyMembers.userId, userId)));
    await tx
      .update(familyMembers)
      .set({ role: "member" })
      .where(and(eq(familyMembers.groupId, groupId), eq(familyMembers.userId, actorId)));
    await audit(tx, { event: "administration.transferred", groupId, actorId, targetId: userId });
  });
}

export async function requireMemberCapacity(
  tx: Parameters<Parameters<FamilyServiceConfig["db"]["transaction"]>[0]>[0],
  groupId: string,
) {
  const [count] = await tx
    .select({ count: sql<number>`count(*)::integer` })
    .from(familyMembers)
    .where(and(eq(familyMembers.groupId, groupId), isNull(familyMembers.revokedAt)));
  requireFamilyCondition(
    count && count.count < COMPASSO_POLICY.capacity.adults,
    "CAPACITY_EXCEEDED",
    "Esta família já tem dois adultos.",
  );
}
