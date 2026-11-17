import { createHash, randomBytes } from "node:crypto";
import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import { familyGroupPeople, familyInvitations, familyMembers, users } from "@informach/db/schema";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireFamilyCondition } from "./errors";
import { requireMemberCapacity } from "./groups";
import {
  audit,
  ensureAdultPerson,
  lockGroup,
  requireActor,
  requireMember,
  requirePersonCapacity,
} from "./internal";
import type { FamilyServiceConfig } from "./types";
import { id } from "./validation";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createInvitation(
  deps: FamilyServiceConfig,
  actorId: string,
  groupId: string,
  email: string,
) {
  id.parse(groupId);
  const recipient = z.email().max(254).parse(email.trim().toLowerCase());
  const now = deps.now?.() ?? new Date();
  return deps.db.transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await lockActiveWebParticipation(tx, actorId);
    await requireMember(tx, actorId, groupId, now, "administrator");
    await requireMemberCapacity(tx, groupId);
    const [existingMember] = await tx
      .select({ userId: familyMembers.userId })
      .from(familyMembers)
      .innerJoin(users, eq(users.id, familyMembers.userId))
      .where(
        and(
          eq(familyMembers.groupId, groupId),
          isNull(familyMembers.revokedAt),
          sql`lower(${users.email}) = ${recipient}`,
        ),
      );
    requireFamilyCondition(!existingMember, "CONFLICT", "Este adulto já participa da família.");
    // Reissuing to one recipient invalidates the previous secret, without retaining
    // an unlimited collection of live invitation tokens.
    await tx
      .update(familyInvitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(familyInvitations.groupId, groupId),
          eq(familyInvitations.email, recipient),
          isNull(familyInvitations.acceptedAt),
          isNull(familyInvitations.revokedAt),
        ),
      );
    const [pending] = await tx
      .select({ count: sql<number>`count(*)::integer` })
      .from(familyInvitations)
      .where(
        and(
          eq(familyInvitations.groupId, groupId),
          isNull(familyInvitations.acceptedAt),
          isNull(familyInvitations.revokedAt),
          gt(familyInvitations.expiresAt, now),
        ),
      );
    requireFamilyCondition(
      (pending?.count ?? 0) < 10,
      "CONFLICT",
      "Revogue um convite pendente antes de criar outro.",
    );
    const token = randomBytes(32).toString("base64url");
    const [invitation] = await tx
      .insert(familyInvitations)
      .values({
        groupId,
        invitedBy: actorId,
        email: recipient,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      })
      .returning({ id: familyInvitations.id, expiresAt: familyInvitations.expiresAt });
    requireFamilyCondition(invitation);
    await audit(tx, { event: "invitation.created", groupId, actorId, targetId: invitation.id });
    return { ...invitation, token };
  });
}

export async function acceptInvitation(deps: FamilyServiceConfig, actorId: string, token: string) {
  const digest = hashToken(
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .parse(token),
  );
  const now = deps.now?.() ?? new Date();
  return deps.db.transaction(async (tx) => {
    const [scope] = await tx
      .select({ groupId: familyInvitations.groupId })
      .from(familyInvitations)
      .where(eq(familyInvitations.tokenHash, digest))
      .limit(1);
    requireFamilyCondition(scope, "INVITATION_INVALID", "Convite inválido ou indisponível.");
    await lockGroup(tx, scope.groupId);
    await lockActiveWebParticipation(tx, actorId);
    // Email changes lock identity before invalidating invitations. Take the
    // matching key-share lock before the invitation row, not during a later FK
    // insert, to avoid the identity/invitation lock inversion and stale email.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, actorId)).for("key share");
    const actor = await requireActor(tx, actorId, now);
    const [invitation] = await tx
      .select()
      .from(familyInvitations)
      .where(eq(familyInvitations.tokenHash, digest))
      .for("update");
    requireFamilyCondition(
      invitation &&
        !invitation.revokedAt &&
        invitation.expiresAt > now &&
        invitation.email === actor.email.trim().toLowerCase(),
      "INVITATION_INVALID",
      "Convite inválido ou indisponível para esta conta.",
    );
    await requireMember(tx, invitation.invitedBy, invitation.groupId, now, "administrator");
    if (invitation.acceptedAt) {
      requireFamilyCondition(invitation.acceptedBy === actorId, "INVITATION_INVALID");
      await requireMember(tx, actorId, invitation.groupId, now);
      return { groupId: invitation.groupId };
    }
    const [current] = await tx
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.groupId, invitation.groupId),
          eq(familyMembers.userId, actorId),
          isNull(familyMembers.revokedAt),
        ),
      );
    if (!current) {
      await requireMemberCapacity(tx, invitation.groupId);
      const personId = await ensureAdultPerson(tx, actorId);
      const [participation] = await tx
        .select()
        .from(familyGroupPeople)
        .where(
          and(
            eq(familyGroupPeople.groupId, invitation.groupId),
            eq(familyGroupPeople.personId, personId),
            isNull(familyGroupPeople.archivedAt),
          ),
        );
      if (!participation) await requirePersonCapacity(tx, invitation.groupId, "adult");
      await tx
        .insert(familyMembers)
        .values({ groupId: invitation.groupId, userId: actorId, role: "member" })
        .onConflictDoUpdate({
          target: [familyMembers.groupId, familyMembers.userId],
          set: { role: "member", revokedAt: null },
        });
      await tx
        .insert(familyGroupPeople)
        .values({ groupId: invitation.groupId, personId })
        .onConflictDoUpdate({
          target: [familyGroupPeople.groupId, familyGroupPeople.personId],
          set: { archivedAt: null },
        });
    }
    await tx
      .update(familyInvitations)
      .set({ acceptedBy: actorId, acceptedAt: now })
      .where(eq(familyInvitations.id, invitation.id));
    await audit(tx, {
      event: "invitation.accepted",
      groupId: invitation.groupId,
      actorId,
      targetId: invitation.id,
    });
    return { groupId: invitation.groupId };
  });
}

export async function revokeInvitation(
  deps: FamilyServiceConfig,
  actorId: string,
  groupId: string,
  invitationId: string,
) {
  id.parse(groupId);
  id.parse(invitationId);
  const now = deps.now?.() ?? new Date();
  await deps.db.transaction(async (tx) => {
    await lockGroup(tx, groupId);
    await lockActiveWebParticipation(tx, actorId);
    await requireMember(tx, actorId, groupId, now, "administrator");
    const [updated] = await tx
      .update(familyInvitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(familyInvitations.id, invitationId),
          eq(familyInvitations.groupId, groupId),
          isNull(familyInvitations.acceptedAt),
        ),
      )
      .returning({ id: familyInvitations.id });
    requireFamilyCondition(
      updated,
      "INVITATION_INVALID",
      "Este convite já foi utilizado ou não está disponível.",
    );
    await audit(tx, { event: "invitation.revoked", groupId, actorId, targetId: invitationId });
  });
}
