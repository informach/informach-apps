import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import {
  familyAccessGrants,
  familyAppProfiles,
  familyGroupPeople,
  familyPeople,
} from "@informach/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { assertPersonAccess } from "./access";
import { requireFamilyCondition } from "./errors";
import {
  audit,
  lockGroup,
  lockPerson,
  requireIdentityManager,
  requirePersonCapacity,
} from "./internal";
import type { FamilyServiceConfig } from "./types";
import { id, linkSchema } from "./validation";

const associationSchema = linkSchema
  .extend({
    sourcePersonId: id,
    expectedSourceVersion: z.number().int().positive(),
    expectedTargetVersion: z.number().int().positive(),
    confirmed: z.literal(true),
  })
  .strict();
export type AssociateProfileInput = z.infer<typeof associationSchema>;

/** Moves an activation, never its domain ID/history. Both identities require explicit custody. */
export async function associateProfile(
  deps: FamilyServiceConfig,
  actorId: string,
  raw: AssociateProfileInput,
) {
  const input = associationSchema.parse(raw);
  requireFamilyCondition(input.sourcePersonId !== input.personId, "INVALID_INPUT");
  const now = deps.now?.() ?? new Date();
  return deps.db.transaction(async (tx) => {
    await lockGroup(tx, input.groupId);
    await lockActiveWebParticipation(tx, actorId);
    // Stable identity lock ordering also protects a person shared with another group.
    await tx
      .select({ id: familyPeople.id })
      .from(familyPeople)
      .where(sql`${familyPeople.id} in (${input.sourcePersonId}::uuid, ${input.personId}::uuid)`)
      .orderBy(familyPeople.id)
      .for("update");
    const source = await requireIdentityManager(
      tx,
      actorId,
      input.groupId,
      input.sourcePersonId,
      now,
    );
    const target = await requireIdentityManager(tx, actorId, input.groupId, input.personId, now);
    requireFamilyCondition(
      !source.userId,
      "CONFLICT",
      "Um perfil vinculado a uma conta não pode ser associado a outra identidade.",
    );
    requireFamilyCondition(
      source.version === input.expectedSourceVersion &&
        target.version === input.expectedTargetVersion,
      "CONFLICT",
      "Os perfis mudaram. Revise a associação antes de confirmar.",
    );
    const profile = await assertPersonAccess(
      tx,
      actorId,
      { groupId: input.groupId, personId: input.sourcePersonId, app: input.app, action: "manage" },
      now,
    );
    const [existing] = await tx
      .select({ id: familyAppProfiles.id })
      .from(familyAppProfiles)
      .where(
        and(
          eq(familyAppProfiles.groupId, input.groupId),
          eq(familyAppProfiles.personId, input.personId),
          eq(familyAppProfiles.app, input.app),
        ),
      );
    requireFamilyCondition(
      !existing,
      "CONFLICT",
      "Esta pessoa já tem um perfil no aplicativo. A associação não combina históricos do mesmo app.",
    );
    // An association cannot disclose the target identity to another adult. Shared profiles
    // must have grants reviewed first; simply keeping them would silently widen exposure.
    const delegated = await tx
      .select({ userId: familyAccessGrants.userId })
      .from(familyAccessGrants)
      .where(
        and(
          eq(familyAccessGrants.profileId, profile.id),
          sql`${familyAccessGrants.userId} <> ${actorId}`,
        ),
      )
      .limit(1);
    requireFamilyCondition(
      delegated.length === 0,
      "CONFLICT",
      "Revise e remova os acessos compartilhados deste perfil antes de associá-lo. Depois, conceda os acessos desejados à pessoa correta.",
    );
    await tx
      .update(familyAppProfiles)
      .set({ personId: target.id, delegationKey: sql`gen_random_uuid()` })
      .where(eq(familyAppProfiles.id, profile.id));
    const [remaining] = await tx
      .select({ id: familyAppProfiles.id })
      .from(familyAppProfiles)
      .where(
        and(
          eq(familyAppProfiles.groupId, input.groupId),
          eq(familyAppProfiles.personId, source.id),
          isNull(familyAppProfiles.archivedAt),
        ),
      )
      .limit(1);
    if (!remaining)
      await tx
        .update(familyGroupPeople)
        .set({ archivedAt: now })
        .where(
          and(
            eq(familyGroupPeople.groupId, input.groupId),
            eq(familyGroupPeople.personId, source.id),
          ),
        );
    await tx
      .update(familyPeople)
      .set({ version: sql`${familyPeople.version} + 1`, updatedAt: now })
      .where(eq(familyPeople.id, source.id));
    await audit(tx, {
      event: "profile.associated",
      groupId: input.groupId,
      personId: target.id,
      actorId,
      targetId: profile.id,
    });
    return { profileId: profile.id, personId: target.id };
  });
}

const classificationSchema = z
  .object({
    groupId: id,
    personId: id,
    expectedVersion: z.number().int().positive(),
    kind: z.enum(["adult", "dependent"]),
  })
  .strict();
export type ClassifyPersonInput = z.infer<typeof classificationSchema>;

export async function classifyPerson(
  deps: FamilyServiceConfig,
  actorId: string,
  raw: ClassifyPersonInput,
) {
  const input = classificationSchema.parse(raw);
  const now = deps.now?.() ?? new Date();
  return deps.db.transaction(async (tx) => {
    await lockGroup(tx, input.groupId);
    await lockActiveWebParticipation(tx, actorId);
    await lockPerson(tx, input.personId);
    const person = await requireIdentityManager(tx, actorId, input.groupId, input.personId, now);
    requireFamilyCondition(
      person.kind === "unclassified",
      "CONFLICT",
      "A categoria desta pessoa já foi confirmada.",
    );
    await requirePersonCapacity(tx, input.groupId, input.kind);
    const [updated] = await tx
      .update(familyPeople)
      .set({ kind: input.kind, version: sql`${familyPeople.version} + 1`, updatedAt: now })
      .where(
        and(eq(familyPeople.id, input.personId), eq(familyPeople.version, input.expectedVersion)),
      )
      .returning();
    requireFamilyCondition(
      updated,
      "CONFLICT",
      "O perfil mudou. Atualize a página antes de confirmar.",
    );
    await audit(tx, {
      event: "person.classified",
      groupId: input.groupId,
      personId: input.personId,
      actorId,
    });
    return updated;
  });
}
