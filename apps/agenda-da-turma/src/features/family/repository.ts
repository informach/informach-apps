import "server-only";
import { and, db, eq, sql } from "@informach/db";
import {
  agendaFamilyInvitations,
  agendaFamilyMembers,
  agendaFamilyProfileAccess,
  agendaStudentProfiles,
  users,
} from "@informach/db/schema";

export async function getFamilyOverview(userId: string) {
  const [profiles, members, invitations] = await Promise.all([
    db
      .select({ id: agendaStudentProfiles.id, name: agendaStudentProfiles.name })
      .from(agendaStudentProfiles)
      .where(eq(agendaStudentProfiles.userId, userId)),
    db
      .select({
        id: agendaFamilyMembers.id,
        name: users.name,
        email: users.email,
        profileId: agendaFamilyProfileAccess.profileId,
      })
      .from(agendaFamilyMembers)
      .innerJoin(users, eq(users.id, agendaFamilyMembers.userId))
      .leftJoin(
        agendaFamilyProfileAccess,
        eq(agendaFamilyProfileAccess.memberId, agendaFamilyMembers.id),
      )
      .where(eq(agendaFamilyMembers.ownerUserId, userId)),
    db
      .select({
        id: agendaFamilyInvitations.id,
        email: agendaFamilyInvitations.email,
        expiresAt: agendaFamilyInvitations.expiresAt,
      })
      .from(agendaFamilyInvitations)
      .where(
        and(
          eq(agendaFamilyInvitations.ownerUserId, userId),
          sql`${agendaFamilyInvitations.acceptedAt} IS NULL`,
          sql`${agendaFamilyInvitations.revokedAt} IS NULL`,
          sql`${agendaFamilyInvitations.expiresAt} > now()`,
        ),
      ),
  ]);
  const member = members[0];
  return {
    profiles,
    member: member
      ? {
          id: member.id,
          name: member.name,
          email: member.email,
          profileIds: members.flatMap((m) => (m.profileId ? [m.profileId] : [])),
        }
      : null,
    invitations,
  };
}
export type FamilyOverview = Awaited<ReturnType<typeof getFamilyOverview>>;
