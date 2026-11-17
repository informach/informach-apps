import {
  activeWebParticipationCondition,
  lockActiveWebParticipation,
} from "@informach/auth/web-participation";
import {
  familyAccessGrants,
  familyAppProfiles,
  familyGroupPeople,
  familyMembers,
  familyPeople,
  familyPersonManagers,
  users,
} from "@informach/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { requireFamilyCondition } from "./errors";
import {
  audit,
  lockGroup,
  lockPerson,
  requireIdentityManager,
  requireMember,
  requirePersonCapacity,
} from "./internal";
import type {
  CreatePersonInput,
  FamilyReader,
  FamilyServiceConfig,
  UpdatePersonInput,
} from "./types";
import { id, personSchema, updatePersonSchema } from "./validation";

export async function createPerson(
  deps: FamilyServiceConfig,
  actorId: string,
  raw: CreatePersonInput,
) {
  const input = personSchema.parse(raw);
  return deps.db.transaction(async (tx) => {
    await lockGroup(tx, input.groupId);
    await lockActiveWebParticipation(tx, actorId);
    await requireMember(tx, actorId, input.groupId, deps.now?.() ?? new Date(), "administrator");
    const [unclassified] = await tx
      .select({ id: familyPeople.id })
      .from(familyPeople)
      .innerJoin(familyGroupPeople, eq(familyGroupPeople.personId, familyPeople.id))
      .where(
        and(
          eq(familyGroupPeople.groupId, input.groupId),
          eq(familyPeople.kind, "unclassified"),
          isNull(familyPeople.archivedAt),
          isNull(familyGroupPeople.archivedAt),
        ),
      )
      .limit(1);
    requireFamilyCondition(
      !unclassified,
      "CONFLICT",
      "Confirme quem são os perfis importados antes de adicionar novas pessoas.",
    );
    await requirePersonCapacity(tx, input.groupId, input.kind);
    const [person] = await tx
      .insert(familyPeople)
      .values({
        kind: input.kind,
        displayName: input.displayName,
        color: input.color,
        avatar: input.avatar,
      })
      .returning();
    requireFamilyCondition(person);
    await tx.insert(familyGroupPeople).values({ groupId: input.groupId, personId: person.id });
    await tx.insert(familyPersonManagers).values({ personId: person.id, userId: actorId });
    await audit(tx, {
      event: "person.created",
      groupId: input.groupId,
      personId: person.id,
      actorId,
    });
    return person;
  });
}

export async function listPeople(deps: { db: FamilyReader }, actorId: string, groupId: string) {
  id.parse(groupId);
  // Permission and visibility are evaluated in the same statement to avoid a revoked-member gap.
  return deps.db
    .select({
      id: familyPeople.id,
      kind: familyPeople.kind,
      displayName: sql<string>`coalesce(${users.name}, ${familyPeople.displayName})`,
      color: familyPeople.color,
      avatar: familyPeople.avatar,
      version: familyPeople.version,
      accountId: familyPeople.userId,
      canManageIdentity: sql<boolean>`coalesce((${familyPeople.userId} = ${actorId} OR EXISTS (
        SELECT 1 FROM ${familyPersonManagers} pm WHERE pm.person_id = ${familyPeople.id} AND pm.user_id = ${actorId}
      )), false)`.mapWith(Boolean),
    })
    .from(familyGroupPeople)
    .innerJoin(familyPeople, eq(familyPeople.id, familyGroupPeople.personId))
    .leftJoin(users, eq(users.id, familyPeople.userId))
    .where(
      and(
        eq(familyGroupPeople.groupId, groupId),
        activeWebParticipationCondition(actorId),
        isNull(familyGroupPeople.archivedAt),
        isNull(familyPeople.archivedAt),
        sql`EXISTS (SELECT 1 FROM family.members m JOIN core.users u ON u.id = m.user_id JOIN family.groups g ON g.id = m.group_id
        WHERE m.group_id = ${groupId} AND m.user_id = ${actorId} AND m.revoked_at IS NULL AND g.archived_at IS NULL
        AND u.email_verified = true AND (u.banned = false OR u.ban_expires_at <= statement_timestamp()))`,
        sql`(${familyPeople.userId} = ${actorId} OR EXISTS (
        SELECT 1 FROM ${familyPersonManagers} pm WHERE pm.person_id = ${familyPeople.id} AND pm.user_id = ${actorId}
      ) OR EXISTS (
        SELECT 1 FROM ${familyAppProfiles} fp JOIN ${familyAccessGrants} fg ON fg.profile_id = fp.id
        WHERE fp.group_id = ${groupId} AND fp.person_id = ${familyPeople.id} AND fp.archived_at IS NULL
          AND fg.user_id = ${actorId} AND fg.action = 'read'
      ))`,
      ),
    )
    .orderBy(familyPeople.createdAt, familyPeople.id);
}

export async function updatePerson(
  deps: FamilyServiceConfig,
  actorId: string,
  raw: UpdatePersonInput,
) {
  const input = updatePersonSchema.parse(raw);
  const now = deps.now?.() ?? new Date();
  return deps.db.transaction(async (tx) => {
    await lockGroup(tx, input.groupId);
    await lockActiveWebParticipation(tx, actorId);
    await lockPerson(tx, input.personId);
    const existing = await requireIdentityManager(tx, actorId, input.groupId, input.personId, now);
    requireFamilyCondition(
      !existing.userId,
      "CONFLICT",
      "O nome de uma conta é atualizado no perfil da própria conta.",
    );
    const [updated] = await tx
      .update(familyPeople)
      .set({
        displayName: input.displayName,
        color: input.color,
        avatar: input.avatar,
        version: sql`${familyPeople.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(eq(familyPeople.id, input.personId), eq(familyPeople.version, input.expectedVersion)),
      )
      .returning();
    requireFamilyCondition(
      updated,
      "CONFLICT",
      "O perfil mudou. Atualize a página antes de salvar.",
    );
    await audit(tx, {
      event: "person.updated",
      groupId: input.groupId,
      personId: input.personId,
      actorId,
    });
    return updated;
  });
}

/** Archiving in this group does not erase the identity or another group's history. */
export async function archivePerson(
  deps: FamilyServiceConfig,
  actorId: string,
  groupId: string,
  personId: string,
) {
  id.parse(groupId);
  id.parse(personId);
  const now = deps.now?.() ?? new Date();
  await deps.db.transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await lockActiveWebParticipation(tx, actorId);
    await lockPerson(tx, personId);
    const person = await requireIdentityManager(tx, actorId, groupId, personId, now);
    if (person.userId) {
      const [member] = await tx
        .select()
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.groupId, groupId),
            eq(familyMembers.userId, person.userId),
            isNull(familyMembers.revokedAt),
          ),
        );
      requireFamilyCondition(
        !member,
        "CONFLICT",
        "Remova o integrante da família antes de arquivar sua participação.",
      );
    }
    await tx
      .update(familyGroupPeople)
      .set({ archivedAt: now })
      .where(and(eq(familyGroupPeople.groupId, groupId), eq(familyGroupPeople.personId, personId)));
    await tx
      .update(familyAppProfiles)
      .set({ delegationKey: sql`gen_random_uuid()` })
      .where(and(eq(familyAppProfiles.groupId, groupId), eq(familyAppProfiles.personId, personId)));
    await audit(tx, { event: "person.archived_in_group", groupId, personId, actorId });
  });
}

/** Restore the participation; independently archived app profiles remain archived. */
export async function restorePerson(
  deps: FamilyServiceConfig,
  actorId: string,
  groupId: string,
  personId: string,
) {
  id.parse(groupId);
  id.parse(personId);
  await deps.db.transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await lockActiveWebParticipation(tx, actorId);
    await lockPerson(tx, personId);
    await requireMember(tx, actorId, groupId, deps.now?.() ?? new Date());
    const [person] = await tx
      .select({ kind: familyPeople.kind })
      .from(familyPeople)
      .innerJoin(
        familyGroupPeople,
        and(
          eq(familyGroupPeople.personId, familyPeople.id),
          eq(familyGroupPeople.groupId, groupId),
        ),
      )
      .innerJoin(
        familyPersonManagers,
        and(
          eq(familyPersonManagers.personId, familyPeople.id),
          eq(familyPersonManagers.userId, actorId),
        ),
      )
      .where(
        and(
          eq(familyPeople.id, personId),
          isNull(familyPeople.userId),
          isNull(familyPeople.archivedAt),
          sql`${familyGroupPeople.archivedAt} is not null`,
        ),
      );
    requireFamilyCondition(person);
    if (person.kind !== "unclassified") await requirePersonCapacity(tx, groupId, person.kind);
    await tx
      .update(familyGroupPeople)
      .set({ archivedAt: null })
      .where(and(eq(familyGroupPeople.groupId, groupId), eq(familyGroupPeople.personId, personId)));
    await audit(tx, { event: "person.restored_in_group", groupId, personId, actorId });
  });
}
