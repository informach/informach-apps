import { activeWebParticipationCondition } from "@informach/auth/web-participation";
import { COMPASSO_POLICY } from "@informach/config/collections";
import {
  familyEvents,
  familyGroupPeople,
  familyGroups,
  familyMembers,
  familyPeople,
  familyPersonManagers,
  users,
} from "@informach/db/schema";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { requireFamilyCondition } from "./errors";
import type { FamilyReader, FamilyTransaction } from "./types";

export function activeUserCondition(now: Date) {
  return and(
    eq(users.emailVerified, true),
    activeWebParticipationCondition(users.id),
    or(eq(users.banned, false), lte(users.banExpiresAt, now)),
  );
}

export async function requireActor(reader: FamilyReader, actorId: string, now: Date) {
  const [actor] = await reader
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.id, actorId), activeUserCondition(now)))
    .limit(1);
  requireFamilyCondition(actor);
  return actor;
}

/** All context mutations lock the same row before re-reading authorization. */
export async function lockGroup(tx: FamilyTransaction, groupId: string) {
  const [group] = await tx
    .select({ id: familyGroups.id })
    .from(familyGroups)
    .where(and(eq(familyGroups.id, groupId), isNull(familyGroups.archivedAt)))
    .for("update");
  requireFamilyCondition(group);
}

/** Identity responsibility spans groups. Mutations lock the person after the
 * group and before reading custody, so a concurrent handoff cannot leave stale authority. */
export async function lockPerson(tx: FamilyTransaction, personId: string) {
  const [person] = await tx
    .select({ id: familyPeople.id })
    .from(familyPeople)
    .where(eq(familyPeople.id, personId))
    .for("update");
  requireFamilyCondition(person);
}

export async function requireMember(
  reader: FamilyReader,
  actorId: string,
  groupId: string,
  now: Date,
  role?: "administrator",
) {
  const [member] = await reader
    .select({ role: familyMembers.role })
    .from(familyMembers)
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .innerJoin(familyGroups, eq(familyGroups.id, familyMembers.groupId))
    .where(
      and(
        eq(familyMembers.groupId, groupId),
        eq(familyMembers.userId, actorId),
        isNull(familyMembers.revokedAt),
        isNull(familyGroups.archivedAt),
        activeUserCondition(now),
        role ? eq(familyMembers.role, role) : undefined,
      ),
    )
    .limit(1);
  requireFamilyCondition(member);
  return member;
}

export async function requireIdentityManager(
  reader: FamilyReader,
  actorId: string,
  groupId: string,
  personId: string,
  now: Date,
) {
  await requireMember(reader, actorId, groupId, now);
  const [person] = await reader
    .select({ person: familyPeople })
    .from(familyPeople)
    .innerJoin(
      familyGroupPeople,
      and(eq(familyGroupPeople.personId, familyPeople.id), eq(familyGroupPeople.groupId, groupId)),
    )
    .where(
      and(
        eq(familyPeople.id, personId),
        isNull(familyPeople.archivedAt),
        isNull(familyGroupPeople.archivedAt),
        or(
          eq(familyPeople.userId, actorId),
          sql`EXISTS (
        SELECT 1 FROM ${familyPersonManagers} pm WHERE pm.person_id = ${familyPeople.id} AND pm.user_id = ${actorId}
      )`,
        ),
      ),
    )
    .limit(1);
  requireFamilyCondition(person);
  return person.person;
}

export async function requirePersonCapacity(
  tx: FamilyTransaction,
  groupId: string,
  kind: "adult" | "dependent",
) {
  const [result] = await tx
    .select({ count: sql<number>`count(*)::integer` })
    .from(familyGroupPeople)
    .innerJoin(familyPeople, eq(familyPeople.id, familyGroupPeople.personId))
    .where(
      and(
        eq(familyGroupPeople.groupId, groupId),
        eq(familyPeople.kind, kind),
        isNull(familyGroupPeople.archivedAt),
        isNull(familyPeople.archivedAt),
      ),
    );
  const limit =
    kind === "adult" ? COMPASSO_POLICY.capacity.adults : COMPASSO_POLICY.capacity.dependents;
  requireFamilyCondition(
    result && result.count < limit,
    "CAPACITY_EXCEEDED",
    `Esta família comporta até ${limit} ${kind === "adult" ? "adultos" : "dependentes"}.`,
  );
}

export async function audit(tx: FamilyTransaction, event: typeof familyEvents.$inferInsert) {
  await tx.insert(familyEvents).values(event);
}

export async function ensureAdultPerson(tx: FamilyTransaction, userId: string) {
  await tx.insert(familyPeople).values({ userId, kind: "adult" }).onConflictDoNothing();
  const [person] = await tx
    .select({ id: familyPeople.id })
    .from(familyPeople)
    .where(and(eq(familyPeople.userId, userId), isNull(familyPeople.archivedAt)))
    .limit(1);
  requireFamilyCondition(person);
  return person.id;
}
