import "server-only";

import { err, ok } from "@informach/auth/server-actions";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  agendaFamilyInvitations,
  agendaFamilyMembers,
  agendaFamilyProfileAccess,
  agendaNoticeActions,
  agendaProductEvents,
  agendaStudentProfiles,
  users,
} from "@informach/db/schema";
import type { z } from "zod";
import type { familyAccessSchema, familyInviteSchema } from "./schemas";

import { hashFamilyToken } from "./tokens";

export async function insertFamilyInvitation(
  userId: string,
  input: z.infer<typeof familyInviteSchema>,
  token: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:family:${userId}`}))`);
    const [owner] = await tx
      .select({ email: users.email, verified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId));
    if (!owner?.verified || owner.email.toLowerCase() === input.email)
      return err({ code: "INVALID_RECIPIENT" } as const);
    const profiles = await tx
      .select({ id: agendaStudentProfiles.id })
      .from(agendaStudentProfiles)
      .where(
        and(
          eq(agendaStudentProfiles.userId, userId),
          inArray(agendaStudentProfiles.id, input.profileIds),
        ),
      );
    if (profiles.length !== input.profileIds.length)
      return err({ code: "INVALID_PROFILE" } as const);
    const [member] = await tx
      .select({ id: agendaFamilyMembers.id })
      .from(agendaFamilyMembers)
      .where(eq(agendaFamilyMembers.ownerUserId, userId));
    if (member) return err({ code: "FAMILY_FULL" } as const);
    await tx
      .update(agendaFamilyInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(agendaFamilyInvitations.ownerUserId, userId),
          sql`${agendaFamilyInvitations.acceptedAt} IS NULL`,
          sql`${agendaFamilyInvitations.revokedAt} IS NULL`,
        ),
      );
    const [invitation] = await tx
      .insert(agendaFamilyInvitations)
      .values({
        ownerUserId: userId,
        email: input.email,
        profileIds: input.profileIds,
        tokenHash: hashFamilyToken(token),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      })
      .returning({ id: agendaFamilyInvitations.id });
    if (!invitation) throw new Error("Family invitation was not inserted");
    return ok({
      id: invitation.id,
    });
  });
}
export async function findFamilyInvitation(token: string) {
  const [invitation] = await db
    .select()
    .from(agendaFamilyInvitations)
    .where(eq(agendaFamilyInvitations.tokenHash, hashFamilyToken(token)));
  return invitation ?? null;
}
export async function acceptFamilyInvitationAtomically(
  userId: string,
  invitationId: string,
  ownerId: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:family:${ownerId}`}))`);
    const [current] = await tx
      .select()
      .from(agendaFamilyInvitations)
      .where(eq(agendaFamilyInvitations.id, invitationId))
      .for("update");
    const [recipient] = await tx
      .select({ email: users.email, verified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId));
    if (
      !current ||
      current.revokedAt ||
      current.expiresAt <= new Date() ||
      !recipient?.verified ||
      recipient.email.toLowerCase() !== current.email ||
      current.ownerUserId === userId
    ) {
      return err({ code: "INVITATION_UNAVAILABLE" } as const);
    }
    if (current.acceptedAt) return err({ code: "INVITATION_USED" } as const);
    const [existing] = await tx
      .select()
      .from(agendaFamilyMembers)
      .where(eq(agendaFamilyMembers.ownerUserId, current.ownerUserId));
    if (existing) return err({ code: "FAMILY_FULL" } as const);
    const profiles = await tx
      .select({ id: agendaStudentProfiles.id })
      .from(agendaStudentProfiles)
      .where(
        and(
          eq(agendaStudentProfiles.userId, current.ownerUserId),
          inArray(agendaStudentProfiles.id, current.profileIds),
        ),
      );
    if (!profiles.length || profiles.length !== current.profileIds.length)
      return err({ code: "INVALID_PROFILE" } as const);
    const [member] = await tx
      .insert(agendaFamilyMembers)
      .values({ ownerUserId: current.ownerUserId, userId })
      .returning();
    if (!member) throw new Error("Family member was not inserted");
    await tx
      .insert(agendaFamilyProfileAccess)
      .values(profiles.map((p) => ({ memberId: member.id, profileId: p.id })));
    await tx
      .update(agendaFamilyInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(agendaFamilyInvitations.id, current.id));
    await tx.insert(agendaProductEvents).values({ userId, event: "family_joined" });
    return ok({ id: member.id });
  });
}
export async function deleteFamilyAccess(userId: string, memberId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:family:${userId}`}))`);
    const [member] = await tx
      .select()
      .from(agendaFamilyMembers)
      .where(
        and(eq(agendaFamilyMembers.id, memberId), eq(agendaFamilyMembers.ownerUserId, userId)),
      );
    if (!member) return err({ code: "NOT_FOUND" } as const);
    await tx
      .update(agendaNoticeActions)
      .set({ assignedToUserId: null, updatedAt: new Date() })
      .where(
        and(
          eq(agendaNoticeActions.assignedToUserId, member.userId),
          inArray(
            agendaNoticeActions.profileId,
            tx
              .select({ id: agendaStudentProfiles.id })
              .from(agendaStudentProfiles)
              .where(eq(agendaStudentProfiles.userId, userId)),
          ),
        ),
      );
    await tx.delete(agendaFamilyMembers).where(eq(agendaFamilyMembers.id, memberId));
    return ok({ id: memberId });
  });
}
export async function replaceFamilyAccess(
  userId: string,
  input: z.infer<typeof familyAccessSchema>,
  isPro: boolean,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:family:${userId}`}))`);
    const [member] = await tx
      .select()
      .from(agendaFamilyMembers)
      .where(
        and(eq(agendaFamilyMembers.id, input.id), eq(agendaFamilyMembers.ownerUserId, userId)),
      );
    if (!member) return err({ code: "NOT_FOUND" } as const);
    const previousGrants = await tx
      .select({ id: agendaFamilyProfileAccess.profileId })
      .from(agendaFamilyProfileAccess)
      .where(eq(agendaFamilyProfileAccess.memberId, member.id));
    if (!isPro && input.profileIds.some((id) => !previousGrants.some((g) => g.id === id)))
      return err({ code: "PRO_REQUIRED" } as const);
    const profiles = await tx
      .select({ id: agendaStudentProfiles.id })
      .from(agendaStudentProfiles)
      .where(
        and(
          eq(agendaStudentProfiles.userId, userId),
          inArray(agendaStudentProfiles.id, input.profileIds),
        ),
      );
    if (profiles.length !== input.profileIds.length)
      return err({ code: "INVALID_PROFILE" } as const);
    await tx
      .update(agendaNoticeActions)
      .set({ assignedToUserId: null, updatedAt: new Date() })
      .where(
        and(
          eq(agendaNoticeActions.assignedToUserId, member.userId),
          inArray(
            agendaNoticeActions.profileId,
            tx
              .select({ profileId: agendaFamilyProfileAccess.profileId })
              .from(agendaFamilyProfileAccess)
              .where(eq(agendaFamilyProfileAccess.memberId, member.id)),
          ),
          sql`${agendaNoticeActions.profileId} NOT IN (${sql.join(
            input.profileIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
        ),
      );
    await tx
      .delete(agendaFamilyProfileAccess)
      .where(eq(agendaFamilyProfileAccess.memberId, member.id));
    await tx
      .insert(agendaFamilyProfileAccess)
      .values(profiles.map((p) => ({ memberId: member.id, profileId: p.id })));
    return ok({ id: member.id });
  });
}
export async function cancelFamilyInvitation(userId: string, id: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:family:${userId}`}))`);
    const rows = await tx
      .update(agendaFamilyInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(agendaFamilyInvitations.id, id),
          eq(agendaFamilyInvitations.ownerUserId, userId),
          sql`${agendaFamilyInvitations.acceptedAt} IS NULL`,
        ),
      )
      .returning({ id: agendaFamilyInvitations.id });
    return rows.length ? ok({ id }) : err({ code: "NOT_FOUND" } as const);
  });
}
